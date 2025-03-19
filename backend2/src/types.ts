export interface Inscription {
  id: number;
  temp_private_key: string;
  address: string;
  required_amount: number;
  file_size: number;
  recipient_address: string;
  sender_address: string;
  fee_rate: number;
  created_at: string;
  commit_tx_id?: string;
  reveal_tx_hex?: string;
  status: 'pending' | 'paid' | 'reveal_ready' | 'completed';
}

// export interface CreateCommitBody {
//   recipientAddress: string;
//   feeRate: string;
//   senderAddress: string;
// }

export interface CreateRevealBody {
  inscriptionId: string;
  commitTxId: string;
  vout: string;
  amount: string;
}

export interface PaymentStatusBody {
  address: string;
  required_amount: string;
  sender_address: string;
  id: string;
}

export interface BroadcastRevealTxBody {
  txHex: string;
  id: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

export interface InscriptionResponse {
  id: number;
  payment_address: string;
  required_amount_in_sats: number;
  file_size_in_bytes?: number;
  status: 'pending' | 'paid' | 'reveal_ready' | 'completed';
  commit_tx_id?: string;
  reveal_tx_hex?: string;
  sender_address: string;
  recipient_address: string;
  created_at: string;
}

//
export interface CreateCommitPayload {
  recipientAddress: string;
  senderAddress: string;
  feeRate: string;
  filePath: string;
}

export interface CreateCommitResponse {
  inscriptionId: number | bigint;
  fileSizeInBytes: number;
  paymentAddress: string;
  recipientAddress: string;
  senderAddress: string;
  requiredAmountInSats: string;
  commmitCreationSuccessful: boolean;
}

// export interface InscriptionItem {
//   id: number;
//   address: string;
//   required_amount: number;
//   status: string;
//   commit_tx_id?: string | null;
//   sender_address: string;
//   recipient_address: string;
//   created_at: string;
// }

// export interface InscriptionStatus {
//   id: number;
//   address: string;
//   required_amount: number;
//   status: string;
//   commit_tx_id?: string | null;
//   created_at: string;
// }

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
