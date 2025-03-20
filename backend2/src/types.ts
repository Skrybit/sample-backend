// used in routes
export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

// used in routes
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

// step 1
export interface CreateCommitPayload {
  recipient_address: string;
  sender_address: string;
  fee_rate: string;
  file_path: string;
}

// step 1
export interface CreateCommitResponse {
  inscription_id: number | bigint;
  file_size_in_bytes: number;
  payment_address: string;
  recipient_address: string;
  sender_address: string;
  required_amount_in_sats: string;
  commmit_creation_successful: boolean;
}

// step 2 and 3
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

// step 4
export interface InscriptionPayment {
  is_paid: boolean;
  id: number;
  payment_address: string;
  required_amount_in_sats: number;
  sender_address: string;
  status: 'pending' | 'paid' | 'reveal_ready' | 'completed';
  payment_utxo: PaymentUtxo | null;
}

// step 4 (used)
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

// step 4 (inderectly, only in route)
export interface PaymentStatusBody {
  payment_address: string;
  required_amount_in_sats: string;
  sender_address: string;
  id: string;
}

// step 5
export interface CreateRevealPayload {
  inscription_id: string;
  commit_tx_id: string;
  vout: string;
  amount: string;
  file_path: string;
}

// step 5
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

// step 6
export interface BroadcastRevealTxBody {
  inscription_id: string;
  reveal_tx_hex: string;
}

// step 6
export interface BroadcastRevealResponse {
  inscription_id: string;
  reveal_tx_id: string | null;
}
