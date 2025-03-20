import { RunResult } from 'better-sqlite3';
import { btcToSats } from '../utils/helpers';
import {
  getErrorDetails,
  listAddressUTXO,
  listWalletAddresses,
  loadWallet,
  importDescriptor,
  getDescriptorChecksum,
  getBalance,
  rescanBlockchain,
  getBlockAtTimeApproximate,
  createWallet,
  broadcastRevealTransaction,
} from './rpcApi';

import { type ErrorDetails, PaymentUtxo } from '../types';

type UpdateInscriptionPaymentFn = (status: string, id: number) => RunResult;

export async function checkPaymentToAddress(
  inscriptionId: number,
  inscriptionStatus: string,
  createdAt: string,
  address: string,
  amountInSats: number,
  updateInscriptionPayment: UpdateInscriptionPaymentFn,
): Promise<{ success: true; result: boolean } | { success: false; error: ErrorDetails }> {
  console.log(`Checking ${address} for ${amountInSats}`);

  if (inscriptionStatus === 'paid' || inscriptionStatus === 'reveal_ready' || inscriptionStatus === 'completed') {
    console.log('NOT err checkPaymentToAddress 0 status', inscriptionStatus);
    return { success: true, result: true };
  }

  const walletName = `insc_wallet_${inscriptionId}`;

  if (inscriptionStatus === 'scanning') {
    const errorDetails = getErrorDetails(new Error(`Wallet "${walletName}" is being scanning now. Try again later."`));
    console.log('err checkPaymentToAddress 1');
    return { success: false, error: errorDetails };
  }

  const walletAddressesResult = await listWalletAddresses(walletName);

  if (!walletAddressesResult.success) {
    console.log('err checkPaymentToAddress 2');
    return { success: false, error: walletAddressesResult.error };
  }

  const { result: addresses } = walletAddressesResult;

  const properAddressItem = addresses.find((addressItem) => addressItem.address === address);

  if (!properAddressItem) {
    const errorDetails = getErrorDetails(
      new Error(`Could not find payment address "${address}" in the requested wallet "${walletName}"`),
    );
    console.log('err checkPaymentToAddress 3');
    return { success: false, error: errorDetails };
  }

  const balanceResult = await getBalance(walletName);

  if (!balanceResult.success) {
    console.log('err checkPaymentToAddress 4');
    return { success: false, error: balanceResult.error };
  }
  console.log('balance ', balanceResult.result);

  const { result: balance } = balanceResult;

  const balanceInSats = btcToSats(balance);
  const isPaid = !!balanceInSats && balanceInSats >= amountInSats;

  if (isPaid) {
    if (inscriptionStatus === 'pending') {
      updateInscriptionPayment('paid', inscriptionId);
    }
    console.log('NOT err checkPaymentToAddress 5');
    return { success: true, result: isPaid };
  }

  /// block begin B - we now finding the block on the fly , but we can modify create inscription to save the current block
  // and avoid scanning
  updateInscriptionPayment('scanning', inscriptionId);

  const startBlockResult = await getBlockAtTimeApproximate(createdAt);

  if (!startBlockResult.success) {
    console.log('err checkPaymentToAddress 6');
    updateInscriptionPayment(inscriptionStatus, inscriptionId);
    return { success: false, error: startBlockResult.error };
  }
  /// block end B

  /// block begin S - we can move the rescanBlockchain logic to a different function later, to use with cron
  const scanResult = await rescanBlockchain(walletName, startBlockResult.result.height);

  if (!scanResult.success) {
    console.log('err checkPaymentToAddress 7');
    updateInscriptionPayment(inscriptionStatus, inscriptionId);
    return { success: false, error: scanResult.error };
  }

  updateInscriptionPayment(inscriptionStatus, inscriptionId);
  /// block end S

  return { success: true, result: false };
}

export async function getPaymentUtxo(
  inscriptionId: number,
  address: string,
  amountInSats: number,
): Promise<{ success: true; result: PaymentUtxo } | { success: false; error: ErrorDetails }> {
  console.log(`Checking paymentUtxo for ${address}`);

  const walletName = `insc_wallet_${inscriptionId}`;
  console.log('walletName', walletName);

  // only unspent utxo
  const utxoListResult = await listAddressUTXO(walletName, [address]);

  if (!utxoListResult.success) {
    console.log('err getPaymentUtxo 1');
    return { success: false, error: utxoListResult.error };
  }

  const utxoList = utxoListResult.result;

  const paymentUtxo = utxoList.find((utxo) => {
    const utxoAmountInSats = btcToSats(utxo.amount);

    const isAddressOk = utxo.address === address;
    const isAmountOk = !!utxoAmountInSats && utxoAmountInSats >= amountInSats;
    const isSpendable = utxo.spendable;
    // we have 0 confirmations. maybe we need at least 1???
    const isConfirmed = utxo.confirmations >= 0;

    const result = isAddressOk && isAmountOk && isSpendable && isConfirmed;
    if (!result) {
      console.log(
        'err getPaymentUtxo 2: isAddressOk, isAmountOk, isSpendable, isConfirmed',
        isAddressOk,
        isAmountOk,
        isSpendable,
        isConfirmed,
      );
    }
    return result;
  });

  if (!paymentUtxo) {
    console.log('err getPaymentUtxo 3: ');
    return {
      success: false,
      error: getErrorDetails(new Error('could not find a paymentUtxo with required criterias')),
    };
  }

  console.log('getPaymentUtxo , found utxo successfully  ');

  return { success: true, result: paymentUtxo };
}

export async function broadcastTx(
  inscriptionId: number,
  givenTxHex: string,
  revealTxHex?: string,
): Promise<{ success: true; result: string } | { success: false; error: ErrorDetails }> {
  if (revealTxHex !== givenTxHex) {
    console.log('err broadcastTx 1 ');
    return {
      success: false,
      error: getErrorDetails(
        new Error('given tx does not match the revealTxHex of the inscription with an id' + inscriptionId),
      ),
    };
  }
  const broadcastResult = await broadcastRevealTransaction(givenTxHex);

  console.log('broadcastResult u', broadcastResult);

  if (!broadcastResult.success) {
    console.log('err broadcastTx 2 ');
    return { success: false, error: broadcastResult.error };
  }

  return { success: true, result: broadcastResult.result };
}

export async function getAddressDescriptorWithChecksum(
  address: string,
): Promise<{ success: true; result: string } | { success: false; error: ErrorDetails }> {
  const baseDescriptor = `addr(${address})`;

  const getDescriptorChecksumResult = await getDescriptorChecksum(baseDescriptor);

  if (!getDescriptorChecksumResult.success) {
    console.log('err getAddressDescriptorWithChecksum 1 ', getDescriptorChecksumResult.error);
    return { success: false, error: getDescriptorChecksumResult.error };
  }

  const descriptorWithChecksum = `${baseDescriptor}#${getDescriptorChecksumResult.result}`;
  console.log('descriptorWithChecksum', descriptorWithChecksum);

  return { result: descriptorWithChecksum, success: true };
}

export async function createWalletAndAddressDescriptor(
  inscriptionId: number | bigint,
  revealAddress: string,
): Promise<{ success: true; result: boolean } | { success: false; error: ErrorDetails }> {
  const walletName = `insc_wallet_${inscriptionId}`;

  console.log(`Creating walletName "${walletName}" for "${revealAddress}"`);

  const createWalletResult = await createWallet(walletName, true);

  if (!createWalletResult.success) {
    console.log('err createWalletAndAddressDescriptor 1 ', createWalletResult.error);
    return { success: false, error: createWalletResult.error };
  }

  const loadWalletResult = await loadWallet(walletName);

  if (!loadWalletResult.success) {
    console.log('err createWalletAndAddressDescriptor 2', loadWalletResult.error);
    return { success: false, error: loadWalletResult.error };
  }

  const descriptorToImportResult = await getAddressDescriptorWithChecksum(revealAddress);

  if (!descriptorToImportResult.success) {
    console.log('err createWalletAndAddressDescriptor 3', descriptorToImportResult.error);
    return { success: false, error: descriptorToImportResult.error };
  }

  const importResult = await importDescriptor(descriptorToImportResult.result, walletName);

  if (!importResult.success) {
    console.log('err createWalletAndAddressDescriptor 4', importResult.error);
    return { success: false, error: importResult.error };
  }

  return {
    success: true,
    result: importResult.result,
  };
}
