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
  status: string;
}

export interface CreateCommitBody {
  recipientAddress: string;
  feeRate: string;
  senderAddress: string;
}

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
