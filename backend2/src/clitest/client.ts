import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';
import { BASE_URL } from '../config/network';
import { type ErrorDetails, getErrorDetails } from '../services/rpcApi';
import {
  CreateCommitPayload,
  CreateCommitResponse,
  InscriptionResponse,
  InscriptionPayment,
  CreateRevealPayload,
  CreateRevealResponse,
} from '../types';

// backend api url
console.log('Client BASE_URL', BASE_URL);

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

    const url = `${BASE_URL}/inscriptions/create-commit`;

    console.log('createCommit URL', url);
    const response = await axios.post<CreateCommitResponse>(url, form, {
      headers: form.getHeaders(),
    });

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

export async function getSenderInscriptions(senderAddress: string): Promise<ApiRes<InscriptionResponse[]> | ApiErrRes> {
  try {
    const url = `${BASE_URL}/inscriptions/sender/${senderAddress}`;
    const response = await axios.get<InscriptionResponse[]>(url);
    console.log('response getSenderInscriptions', response.data);
    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

export async function getInscription(inscriptionId: number): Promise<ApiRes<InscriptionResponse> | ApiErrRes> {
  try {
    const url = `${BASE_URL}/inscriptions/${inscriptionId}`;
    const response = await axios.get<InscriptionResponse>(url);
    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

export async function isInscriptionPaid(
  paymentAddress: string,
  id: string,
  senderAddress: string,
  requiredAmountSat: string,
): Promise<ApiRes<InscriptionPayment> | ApiErrRes> {
  try {
    const url = `${BASE_URL}/payments/status`;

    const response = await axios.post<InscriptionPayment>(
      url,
      {
        id,
        payment_address: paymentAddress,
        sender_address: senderAddress,
        required_amount_in_sats: requiredAmountSat,
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

export async function createReveal({
  inscription_id,
  commit_tx_id,
  vout,
  amount,
  file_path,
}: CreateRevealPayload): Promise<ApiRes<CreateRevealResponse> | ApiErrRes> {
  const url = `${BASE_URL}/inscriptions/create-reveal`;
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(file_path));
    form.append('inscription_id', inscription_id);
    form.append('commit_tx_id', commit_tx_id);
    form.append('vout', vout);
    form.append('amount', amount);

    const response = await axios.post<CreateRevealResponse>(url, form, {
      headers: form.getHeaders(),
    });

    return { success: true, result: response.data };
  } catch (err) {
    return handleError(err);
  }
}

// export async function broadcastRevealTx(
//   id: string,
//   txHex: string,
// ): Promise<ApiRes<BroadcastRevealResponse> | ApiErrRes> {
//   try {
//     const response = await axios.post<BroadcastRevealResponse>(
//       `${BASE_URL}/broadcast-reveal-tx`,
//       {
//         id,
//         txHex,
//       },
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           Accept: 'application/json',
//         },
//       },
//     );
//
//     return { success: true, result: response.data };
//   } catch (err) {
//     return handleError(err);
//   }
// }
