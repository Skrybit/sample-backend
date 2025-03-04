import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';

import 'dotenv/config';

export interface CreateCommitResponse {
  inscriptionId: number;
  fileSize: number;
  address: string;
  recipientAddress: string;
  senderAddress: string;
  requiredAmount: string;
  createResult: boolean;
}

export interface CreateCommitPayload {
  recipientAddress: string;
  senderAddress: string;
  feeRate: number;
  filePath: string;
}

export interface InscriptionItem {
  id: number;
  address: string;
  required_amount: number;
  status: string;
  commit_tx_id?: string | null;
  sender_address: string;
  recipient_address: string;
  created_at: string;
}

export interface InscriptionStatus {
  id: number;
  address: string;
  required_amount: number;
  status: string;
  commit_tx_id?: string | null;
  created_at: string;
}

export interface InscriptionPayment {
  is_paid: boolean;
  id: number;
  address: string;
  amount: number;
  sender_address: string;
}

export type PaymentUtxo = {
  txid: string;
  vout: number;
  address: string;
  label: string;
  amount: number;
  confirmations: number;
  scriptPubKey: string;
  spendable: boolean;
};

export type InscriptionUtxo = {
  id: number;
  address: string;
  amount: number;
  sender_address: string;
  paymentUtxo: PaymentUtxo;
};

export interface CreateRevealPayload {
  inscriptionId: string;
  commitTxId: string;
  vout: number;
  amount: number;
  filePath: string;
}

export interface CreateRevealResponse {
  revealTxHex: string;
  debug: {
    generatedAddress: string;
    pubkey: string;
    amount: number;
    fees: bigint;
  };
}

export interface BroadcastRevealResponse {
  id: number;
  txId: string | null;
}

interface ErrorDetails {
  errCode: string;
  errMsg: string;
  errStatus: string;
  responseStatus?: number;
  responseStatusText?: string;
  dataErrCode?: unknown;
  dataErrMsg: string;
  details: string;
  originalResponseError?: unknown;
}

// backend api url
const BASE_URL = process.env.BASE_URL || '';
console.log('BASE_URL', BASE_URL);

const getErrorDetails = (error: any): ErrorDetails => {
  const errCode = error.code || 'unknown code';
  const errMsg = error.message || 'unknown message';
  const errStatus = error.status || 'unknown status';

  const responseStatus = error?.response?.status;
  const responseStatusText = error?.response?.statusText;

  const dataErrCode = error?.response?.data?.error?.code;
  const dataErrMsg = error?.response?.data?.error?.message || 'unknown data err message';
  const dataError = error?.response?.data?.error;

  const details = dataError ? `RPC Error: ${JSON.stringify(dataError)}` : 'unknown details';

  return {
    errCode,
    errMsg,
    errStatus,
    responseStatus,
    responseStatusText,
    dataErrCode,
    dataErrMsg,
    details,
    originalResponseError: error?.response?.data,
  };
};

const handleNonRpcError = (error: unknown) => {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  throw error;
};

type ApiRes<T> = {
  success: true;
  result: T;
};

type ApiErrRes = {
  success: false;
  error: ErrorDetails;
};

async function handleError<T>(error: any): Promise<ApiErrRes> {
  if (!axios.isAxiosError(error)) {
    handleNonRpcError(error);
  }

  return {
    success: false,
    error: getErrorDetails(error),
  };
}

// 1 d
export async function createCommit({
  recipientAddress,
  senderAddress,
  feeRate,
  filePath,
}: CreateCommitPayload): Promise<ApiRes<CreateCommitResponse> | ApiErrRes> {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('recipientAddress', recipientAddress);
    form.append('senderAddress', senderAddress);
    form.append('feeRate', feeRate.toString());

    const response = await axios.post<CreateCommitResponse>(`${BASE_URL}/create-commit`, form, {
      headers: form.getHeaders(),
    });

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// 2 d
export async function getSenderInscriptions(senderAddress: string): Promise<ApiRes<InscriptionItem> | ApiErrRes> {
  try {
    const response = await axios.get<InscriptionItem>(`${BASE_URL}/sender-inscriptions/${senderAddress}`);
    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// 3 d
export async function getInscriptionStatus(inscriptionId: number): Promise<ApiRes<InscriptionStatus> | ApiErrRes> {
  try {
    const response = await axios.get<InscriptionStatus>(`${BASE_URL}/inscription/${inscriptionId}`);
    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// 4 d
export async function isInscriptionPaid(
  address: string,
  id: string,
  senderAddress: string,
  requiredAmountSat: string,
): Promise<ApiRes<InscriptionPayment> | ApiErrRes> {
  try {
    const response = await axios.post<InscriptionPayment>(
      `${BASE_URL}/payment-status`,
      {
        id,
        address,
        sender_address: senderAddress,
        required_amount: requiredAmountSat,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// 5 d
export async function getInscriptionPaymentUtxo(
  address: string,
  id: string,
  senderAddress: string,
  requiredAmountSat: string,
): Promise<ApiRes<InscriptionUtxo> | ApiErrRes> {
  try {
    const response = await axios.post<InscriptionUtxo>(
      `${BASE_URL}/payment-utxo`,
      {
        id,
        address,
        sender_address: senderAddress,
        required_amount: requiredAmountSat,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// 6 d
export async function createReveal({
  inscriptionId,
  commitTxId,
  vout,
  amount,
  filePath,
}: CreateRevealPayload): Promise<ApiRes<CreateRevealResponse> | ApiErrRes> {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('inscriptionId', inscriptionId);
    form.append('commitTxId', commitTxId);
    form.append('vout', vout.toString());
    form.append('amount', amount.toString());

    const response = await axios.post<CreateRevealResponse>(`${BASE_URL}/create-reveal`, form, {
      headers: form.getHeaders(),
    });

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// 7
export async function broadcastRevealTx(
  id: string,
  txHex: string,
): Promise<ApiRes<BroadcastRevealResponse> | ApiErrRes> {
  try {
    const response = await axios.post<BroadcastRevealResponse>(
      `${BASE_URL}/broadcast-reveal-tx`,
      {
        id,
        txHex,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}
