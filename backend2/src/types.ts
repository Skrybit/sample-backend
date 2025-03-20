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

export interface PaymentStatusBody {
  payment_address: string;
  required_amount_in_sats: string;
  sender_address: string;
  id: string;
}

// ?
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

// we can leave it, it for request
export interface CreateCommitPayload {
  recipientAddress: string;
  senderAddress: string;
  feeRate: string;
  filePath: string;
}

export interface CreateCommitResponse {
  inscription_id: number | bigint;
  file_size_in_bytes: number;
  payment_address: string;
  recipient_address: string;
  sender_address: string;
  required_amount_in_sats: string;
  commmit_creation_successful: boolean;
}

export interface InscriptionPayment {
  is_paid: boolean;
  id: number;
  payment_address: string;
  required_amount_in_sats: number;
  sender_address: string;
  status: 'pending' | 'paid' | 'reveal_ready' | 'completed';
  payment_utxo: PaymentUtxo | null;
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

export interface CreateRevealPayload {
  inscription_id: string;
  commit_tx_id: string;
  vout: string;
  amount: string;
  file_path: string;
}

export interface CreateRevealResponse {
  inscription_id: string;
  commit_tx_id: string;
  reveal_tx_hex: string;
  debug: {
    payment_address: string;
    payment_pubkey: string;
    required_amount_in_sats: string;
    given_utxo_amount_in_sats: string;
    sender_address: string;
    recipient_address: string;
    fees: string;
  };
}

// change
export interface BroadcastRevealResponse {
  id: number;
  txId: string | null;
}
