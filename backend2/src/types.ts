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
  reveal_tx_id: string;
  created_block: number;
  last_checked_block: number;
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

/// from rpcApi
export type BlockHeader = {
  time: number;
  height: number;
  previousblockhash: string;
  hash: string;
};

export type RpcRes<T> = {
  success: true;
  result: T;
};

// only rpc
export type RpcErrRes = {
  success: false;
  error: ErrorDetails;
};

// Axios error -> error.response.data
export type RpcErrResponse = {
  result: null;
  id: string;
  error: { code: number; message: string };
};

export type ErrorDetails = {
  errCode: string;
  errMsg: string;
  errStatus: string;
  responseStatus?: number;
  responseStatusText?: string;
  dataErrCode?: unknown;
  dataErrMsg: string;
  details: string;
  originalResponseError?: RpcErrResponse;
};

export type IsWalletLoadedResponse =
  | { walletName: string; success: true; result: true }
  | { walletName: string; success: false; error: ErrorDetails };

export type LoadWalletResponse =
  | { walletName: string; success: false; error: ErrorDetails }
  | {
      walletName: string;
      success: true;
      result: boolean;
    };

export type UnLoadWalletResponse =
  | { walletName: string; success: true; result: boolean }
  | { walletName: string; success: false; error: ErrorDetails };

export type CreateWalletResponse =
  | { walletName: string; success: true; result: boolean }
  | { walletName: string; success: false; error: ErrorDetails };

export type GetDescriptorChecksumResponse = { result: string; success: true } | { success: false; error: ErrorDetails };

export type ImportDescriptorResponse = { success: true; result: boolean } | { success: false; error: ErrorDetails };

export type GetBalanceResponse = { success: true; result: number } | { success: false; error: ErrorDetails };

export type RescanBlockchainResponse =
  | {
      success: true;
      startHeight: number;
      stoptHeight: number;
    }
  | {
      success: false;
      startHeight: number;
      error: ErrorDetails;
    };

export type WalletAddress = {
  address: string;
  amount: number;
  confirmations: number;
  label: string;
  txids: string[];
};

export type ListWalletAddressesResponse =
  | { success: true; result: WalletAddress[] }
  | { success: false; error: ErrorDetails };

export type ListAddressUTXOResponse =
  | { success: true; result: PaymentUtxo[] }
  | { success: false; error: ErrorDetails };

export type ScanTxOutSetResponse =
  | { success: true; result: { progress: number } }
  | { success: false; error: ErrorDetails };

export type GetBlockAtTimeApproximateResponse =
  | { success: true; result: BlockHeader }
  | { success: false; error: ErrorDetails };

export type BroadcastRevealTransactionResponse =
  | { result: string; success: true }
  | { success: false; error: ErrorDetails };

// Axis response -> response.data, map it later when functions use rpcCall
// type RpcResponse<T> = {
//   result: T;
//   id: string;
//   error: null;
// };

/// from createInscription

export interface InscriptionResult {
  fileSize: number;
  tempPrivateKey: string;
  address: string;
  requiredAmount: string;
  createRevealTx: (txid: string, index: number, amount: bigint | number) => string;
}

export interface InscriptionData {
  tags: {
    contentType: string;
  };
  body: Uint8Array;
}
// from walletUtils

export interface KeyPair {
  raw: Uint8Array;
  wif: string;
  hex: string;
}

// temporary helper to create the same address for the same inscription
export interface InscriptionData {
  tags: {
    contentType: string;
  };
  body: Uint8Array;
}
