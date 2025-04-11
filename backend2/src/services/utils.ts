import { btcToSats } from '../utils/helpers';
import { appdb } from '../db';
import {
  getErrorDetails,
  listAddressUTXO,
  loadWallet,
  importDescriptor,
  getDescriptorChecksum,
  getBalance,
  rescanBlockchain,
  createWallet,
  broadcastRevealTransaction,
  buildRpcWalletName,
  getCurrentHeight,
} from './rpcApi';

import { type ErrorDetails, PaymentUtxo } from '../types';

export async function getCurrentBlockHeight() {
  const currentBlockchainInfo = await getCurrentHeight();

  if (!currentBlockchainInfo.success) {
    console.log('err getCurrentBlockHeight', currentBlockchainInfo.error);
    return 0;
  }

  return currentBlockchainInfo.result;
}

export async function checkPaymentToAddress(
  inscriptionId: number,
  inscriptionStatus: string,
  address: string,
  amountInSats: number,
  lastCheckedBlock: number,
  currentBlock: number,
): Promise<
  | { success: true; result: boolean; utxo: PaymentUtxo }
  | { success: true; result: true; utxo: null }
  | { success: false; utxo: null; error: ErrorDetails }
> {
  console.log(`Checking ${address} for ${amountInSats}`);

  const walletName = buildRpcWalletName(inscriptionId);

  if (inscriptionStatus === 'scanning') {
    const errorDetails = getErrorDetails(new Error(`Wallet "${walletName}" is being scanning now. Try again later."`));
    console.log('err checkPaymentToAddress 1');
    return { success: false, utxo: null, error: errorDetails };
  }

  // if (inscriptionStatus === 'paid' || inscriptionStatus === 'reveal_ready' || inscriptionStatus === 'completed') {
  //   console.log('NOT 1 err checkPaymentToAddress 0 status', inscriptionStatus);
  //   return { success: true, result: true, utxo: null };
  // }
  const balanceResult = await getBalance(walletName);

  if (!balanceResult.success) {
    console.log('err checkPaymentToAddress 4');
    return { success: false, utxo: null, error: balanceResult.error };
  }

  console.log('balance ', balanceResult.result);

  const walletUtxoResultW = await getPaymentUtxo(inscriptionId, address, amountInSats);

  if (!walletUtxoResultW.success) {
    console.log('err checkPaymentToAddress 0a');

    await appdb.updateInscriptionStatus({
      id: inscriptionId,
      status: 'scanning',
    });

    if (currentBlock && currentBlock >= lastCheckedBlock) {
      // await updateInscriptionLastCheckedBlock({ id: inscriptionId, lastCheckedBlock: currentBlock });
      await appdb.insertBlockCheck({ id: inscriptionId, blockNumber: currentBlock });
    }

    await rescanBlockchain(walletName, lastCheckedBlock);

    console.log('given status', inscriptionStatus);
    await appdb.updateInscriptionStatus({ id: inscriptionId, status: inscriptionStatus });

    return { success: false, utxo: null, error: walletUtxoResultW.error };
  }

  const walletUtxo = walletUtxoResultW.result;

  if (inscriptionStatus === 'paid' || inscriptionStatus === 'reveal_ready' || inscriptionStatus === 'completed') {
    console.log('NOT 2 err checkPaymentToAddress 0 status', inscriptionStatus);
    return { success: true, result: true, utxo: walletUtxo };
  }

  const { result: balance } = balanceResult;

  const balanceInSats = btcToSats(balance);

  const isPaid = (!!balanceInSats && balanceInSats >= amountInSats) || !!walletUtxo;

  if (isPaid) {
    if (inscriptionStatus === 'pending') {
      await appdb.updateInscriptionStatus({ id: inscriptionId, status: 'paid' });
    }
    console.log('NOT err checkPaymentToAddress 5');
    return { success: true, result: true, utxo: walletUtxo };
  }

  await appdb.updateInscriptionStatus({ id: inscriptionId, status: inscriptionStatus });

  return {
    success: false,
    utxo: null,
    error: getErrorDetails(new Error('could not check if inscription was paid')),
  };
}

export async function getPaymentUtxo(
  inscriptionId: number,
  address: string,
  amountInSats: number,
): Promise<{ success: true; result: PaymentUtxo } | { success: false; error: ErrorDetails }> {
  console.log(`Checking paymentUtxo for ${address}`);

  const walletName = buildRpcWalletName(inscriptionId);

  console.log('walletName', walletName);

  // only unspent utxo
  const utxoListResult = await listAddressUTXO(walletName, [address]);

  if (!utxoListResult.success) {
    console.log('err getPaymentUtxo 1');
    return { success: false, error: utxoListResult.error };
  }

  const utxoList = utxoListResult.result;
  console.log('getPaymentUtxo utxoList', utxoList);

  const paymentUtxo = utxoList.find((utxo) => {
    const utxoAmountInSats = btcToSats(utxo.amount);

    const isAddressOk = utxo.address === address;
    const isAmountOk = !!utxoAmountInSats && utxoAmountInSats >= amountInSats;

    // we dont check if it is spendable? shall we?
    // const isSpendable = utxo.spendable;

    // we have 0 confirmations. maybe we need at least 1???
    const isConfirmed = utxo.confirmations >= 0;

    const result = isAddressOk && isAmountOk && isConfirmed;
    if (!result) {
      console.log('err getPaymentUtxo 2: isAddressOk, isAmountOk, isConfirmed', isAddressOk, isAmountOk, isConfirmed);
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
): Promise<{ success: true; result: string } | { success: false; error: ErrorDetails }> {
  if (!givenTxHex) {
    console.log('err broadcastTx 1 ');
    return {
      success: false,
      error: getErrorDetails(new Error('reveal tx hex is required for inscription with an id' + inscriptionId)),
    };
  }

  const broadcastResult = await broadcastRevealTransaction(givenTxHex);

  console.log('broadcastResult update', broadcastResult);

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
  const walletName = buildRpcWalletName(inscriptionId);

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
