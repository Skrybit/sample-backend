import { RunResult } from 'better-sqlite3';
import { btcToSats, satsToBtc } from '../utils/helpers';
import {
  getErrorDetails,
  listAddressUTXO,
  listWalletAddresses,
  getBalance,
  rescanBlockchain,
  getBlockAtTimeApproximate,
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

  if (inscriptionStatus === 'paid') {
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
  inscriptionStatus: string,
  address: string,
  amountInSats: number,
): Promise<{ success: true; result: AddressUtxo } | { success: false; error: ErrorDetails }> {
  console.log(`Checking paymentUtxo for ${address}`);

  const walletName = `insc_wallet_${inscriptionId}`;

  if (inscriptionStatus === 'scanning') {
    const errorDetails = getErrorDetails(new Error(`Wallet "${walletName}" is being scanning now. Try again later."`));
    return { success: false, error: errorDetails };
  }

  const isPaid = inscriptionStatus === 'paid';

  if (!isPaid) {
    const errorDetails = getErrorDetails(
      new Error(`Could not find payment utxo for address "${address}" in the requested wallet "${walletName}"`),
    );
    return { success: false, error: errorDetails };
  }

  const utxoListResult = await listAddressUTXO(walletName, [address]);

  if (!utxoListResult.success) {
    return { success: false, error: utxoListResult.error };
  }

  const utxoList = utxoListResult.result;

  const paymentUtxo = utxoList.find((utxo) => {
    const utxoAmountInSats = btcToSats(utxo.amount);
    const isAmountOk = !!utxoAmountInSats && utxoAmountInSats >= amountInSats;

    return utxo.address === address && isAmountOk && utxo.spendable === true && utxo.confirmations >= 5;
  });

  if (!paymentUtxo) {
    return {
      success: false,
      error: getErrorDetails(new Error('could not find a paymentUtxo with required criterias')),
    };
  }

  return { success: true, result: paymentUtxo };
}
