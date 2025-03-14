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
  type ErrorDetails,
  type AddressUtxo,
} from './rpcApi';

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

  if (inscriptionStatus === 'paid' || inscriptionStatus === 'reveal_ready') {
    return { success: true, result: true };
  }

  const walletName = `insc_wallet_${inscriptionId}`;

  if (inscriptionStatus === 'scanning') {
    const errorDetails = getErrorDetails(new Error(`Wallet "${walletName}" is being scanning now. Try again later."`));
    return { success: false, error: errorDetails };
  }

  const walletAddressesResult = await listWalletAddresses(walletName);

  if (!walletAddressesResult.success) {
    return { success: false, error: walletAddressesResult.error };
  }

  const { result: addresses } = walletAddressesResult;

  const properAddressItem = addresses.find((addressItem) => addressItem.address === address);

  if (!properAddressItem) {
    const errorDetails = getErrorDetails(
      new Error(`Could not find payment address "${address}" in the requested wallet "${walletName}"`),
    );
    return { success: false, error: errorDetails };
  }

  const balanceResult = await getBalance(walletName);

  if (!balanceResult.success) {
    return { success: false, error: balanceResult.error };
  }

  const { result: balance } = balanceResult;

  const balanceInSats = btcToSats(balance);
  const isPaid = !!balanceInSats && balanceInSats >= amountInSats;

  if (isPaid) {
    if (inscriptionStatus === 'pending') {
      updateInscriptionPayment('paid', inscriptionId);
    }
    return { success: true, result: isPaid };
  }

  /// block begin B - we now finding the block on the fly , but we can modify create inscription to save the current block
  // and avoid scanning
  updateInscriptionPayment('scanning', inscriptionId);

  const startBlockResult = await getBlockAtTimeApproximate(createdAt);

  if (!startBlockResult.success) {
    updateInscriptionPayment(inscriptionStatus, inscriptionId);
    return { success: false, error: startBlockResult.error };
  }
  /// block end B

  /// block begin S - we can move the rescanBlockchain logic to a different function later, to use with cron
  const scanResult = await rescanBlockchain(walletName, startBlockResult.result.height);

  if (!scanResult.success) {
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
): Promise<{ success: true; result: AddressUtxo } | { success: false; error: ErrorDetails }> {
  console.log(`Checking paymentUtxo for ${address}`);

  const walletName = `insc_wallet_${inscriptionId}`;
  console.log('walletName', walletName);

  // only unspent utxo
  const utxoListResult = await listAddressUTXO(walletName, [address]);

  if (!utxoListResult.success) {
    return { success: false, error: utxoListResult.error };
  }

  const utxoList = utxoListResult.result;

  const paymentUtxo = utxoList.find((utxo) => {
    console.dir(utxo);
    const utxoAmountInSats = btcToSats(utxo.amount);

    const isAddressOk = utxo.address === address;
    const isAmountOk = !!utxoAmountInSats && utxoAmountInSats >= amountInSats;
    const isSpendable = utxo.spendable;
    const isConfirmed = utxo.confirmations >= 1;

    return isAddressOk && isAmountOk && isSpendable && isConfirmed;
  });

  if (!paymentUtxo) {
    return {
      success: false,
      error: getErrorDetails(new Error('could not find a paymentUtxo with required criterias')),
    };
  }

  return { success: true, result: paymentUtxo };
}

export async function broadcastTx(
  inscriptionId: number,
  givenTxHex: string,
  revealTxHex?: string,
): Promise<{ success: true; result: string } | { success: false; error: ErrorDetails }> {
  if (revealTxHex !== givenTxHex) {
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
    console.log('err aa 1', getDescriptorChecksumResult.error);
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
    return { success: false, error: createWalletResult.error };
  }

  const loadWalletResult = await loadWallet(walletName);

  if (!loadWalletResult.success) {
    return { success: false, error: loadWalletResult.error };
  }

  const descriptorToImportResult = await getAddressDescriptorWithChecksum(revealAddress);

  if (!descriptorToImportResult.success) {
    return { success: false, error: descriptorToImportResult.error };
  }

  const importResult = await importDescriptor(descriptorToImportResult.result, walletName);

  if (!importResult.success) {
    return { success: false, error: importResult.error };
  }

  return {
    success: true,
    result: importResult.result,
  };
}
