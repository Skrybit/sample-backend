import axios from 'axios';
import * as dateUtils from '../utils/dateUtils';
import {
  type BlockHeader,
  type RpcRes,
  type RpcErrRes,
  type ErrorDetails,
  type IsWalletLoadedResponse,
  type LoadWalletResponse,
  type UnLoadWalletResponse,
  type CreateWalletResponse,
  type GetDescriptorChecksumResponse,
  type ImportDescriptorResponse,
  type GetBalanceResponse,
  type RescanBlockchainResponse,
  type ListWalletAddressesResponse,
  type ListAddressUTXOResponse,
  type ScanTxOutSetResponse,
  type BroadcastRevealTransactionResponse,
  type GetBlockAtTimeApproximateResponse,
} from '../types';
import { RPC_CONFIG, RPC_URL, RPC_TIMEOUT, WALLET_STUB_VAL } from '../config/network';

export function buildRpcWalletName(inscriptionId: number | bigint) {
  return `insc_wallet_${inscriptionId}_${WALLET_STUB_VAL}`;
}

export function buildRpcUrlForWallet(walletName: string) {
  if (!walletName) {
    throw new Error('Wallet Name mas be provided');
  }

  return `${RPC_URL}wallet/${walletName}`;
}

const handleNonRpcError = (error: unknown) => {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  throw error;
};

const getAuthHeaders = () => {
  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${RPC_CONFIG.user}:${RPC_CONFIG.pass}`).toString('base64')}`,
  };
};

async function rpcCall<T>(
  method: string,
  params: any[],
  errorDetailsTextToOverwrite = '',
  timeout = RPC_TIMEOUT,
): Promise<RpcRes<T> | RpcErrRes> {
  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: `blockfinder_${method}`,
        method,
        params,
      },
      {
        headers: getAuthHeaders(),
        timeout,
      },
    );

    if (response.data.error) {
      return {
        success: false,
        error: getErrorDetails(new Error(response.data.error.message)),
      };
    }

    return {
      success: true,
      result: response?.data?.result,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    const errorDetails = getErrorDetails(error);

    const errorToReturn = errorDetailsTextToOverwrite
      ? { ...errorDetails, details: errorDetailsTextToOverwrite }
      : errorDetails;

    return {
      success: false,
      error: errorToReturn,
    };
  }
}

export const getErrorDetails = (error: any): ErrorDetails => {
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

export async function isWalletLoaded(walletName: string): Promise<IsWalletLoadedResponse> {
  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'walletcheck',
        method: 'listwallets',
        params: [],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    console.log('isWalletLoaded response', response.data);
    const loadedWallets: string[] = response?.data?.result;
    const success = loadedWallets.includes(walletName);

    if (success) {
      return { walletName, success, result: true };
    }

    return {
      walletName,
      success,
      error: getErrorDetails(new Error(`Could not find wallet "${walletName}" in a list of wallets`)),
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      walletName,
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function loadWallet(walletName: string): Promise<LoadWalletResponse> {
  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'wallet_load',
        method: 'loadwallet',
        params: [walletName],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    return {
      walletName,
      success: true,
      result: !response?.data?.error,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    const errorDetails = getErrorDetails(error);

    if (errorDetails?.dataErrMsg?.includes('already loaded')) {
      return {
        walletName,
        success: true,
        result: true,
      };
    }

    return {
      walletName,
      success: false,
      error: errorDetails,
    };
  }
}

export async function unLoadWallet(walletName: string): Promise<UnLoadWalletResponse> {
  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'wallet_unload',
        method: 'unloadwallet',
        params: [walletName],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    return {
      success: true,
      result: !response?.data?.error,
      walletName,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      walletName,
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function createWallet(walletName: string, descriptorSupport = false): Promise<CreateWalletResponse> {
  const paramsForImportPrivateKey = [
    false, // disable_private_keys
    false, // blank
    '', // passphrase
    false, // avoid_reuse
    false, // descriptors
  ];

  const paramsForImportDescriptor = [
    true, // disable_private_keys
    true, // blank
    '', // passphrase
    false, // avoid_reuse
    true, // descriptors
  ];

  const params = descriptorSupport ? paramsForImportDescriptor : paramsForImportPrivateKey;

  console.log('createWallet URL', RPC_URL);

  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'wallet_create',
        method: 'createwallet',
        params: [walletName, ...params],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    return {
      walletName,
      success: true,
      result: !response?.data?.error,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      walletName,
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function getDescriptorChecksum(descriptor: string): Promise<GetDescriptorChecksumResponse> {
  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'descriptor_info',
        method: 'getdescriptorinfo',
        params: [descriptor],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    const descriptorChecksum = `${response?.data?.result?.checksum}`;

    return {
      result: descriptorChecksum,
      success: true,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function importDescriptor(
  descriptorWithChecksum: string,
  walletName: string,
): Promise<ImportDescriptorResponse> {
  try {
    const url = buildRpcUrlForWallet(walletName);

    const response = await axios.post(
      url,
      {
        jsonrpc: '1.0',
        id: 'import_descriptor',
        method: 'importdescriptors',
        params: [
          [
            {
              desc: descriptorWithChecksum,
              active: false,
              label: `${walletName}_lbl`,
              timestamp: 'now',
              internal: false,
              watchonly: false,
            },
          ],
        ],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    return {
      success: true,
      result: !response?.data?.error && response?.data?.result[0]?.success,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function getBalance(walletName: string): Promise<GetBalanceResponse> {
  try {
    const url = buildRpcUrlForWallet(walletName);

    const response = await axios.post(
      url,
      {
        jsonrpc: '1.0',
        id: 'get_balancea',
        method: 'getbalance',
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    const balance = response?.data?.result;
    console.log('bb balance', response.data);

    return {
      success: true,
      result: balance || 0,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

// is ONLY used when node is being synced and no utxo was found
export async function rescanBlockchain(walletName: string, startBlock: number): Promise<RescanBlockchainResponse> {
  try {
    const url = buildRpcUrlForWallet(walletName);
    const response = await axios.post(
      url,
      {
        jsonrpc: '1.0',
        id: 'rescan_blockchain',
        method: 'rescanblockchain',
        params: [startBlock],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT * 2,
      },
    );

    return {
      success: true,
      startHeight: response?.data?.result?.start_height,
      stoptHeight: response?.data?.result?.stop_height,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      startHeight: startBlock,
      error: getErrorDetails(error),
    };
  }
}

export async function listWalletAddresses(walletName: string): Promise<ListWalletAddressesResponse> {
  try {
    const url = buildRpcUrlForWallet(walletName);

    const response = await axios.post(
      url,
      {
        jsonrpc: '1.0',
        id: 'list_received',
        method: 'listreceivedbyaddress',
        params: [
          0, // Minimum confirmations (0 = include unconfirmed)
          true, // Include empty addresses
          true, // Include watch-only
        ],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    return {
      success: true,
      result: response?.data?.result || [],
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function listAddressUTXO(walletName: string, addresses: string[]): Promise<ListAddressUTXOResponse> {
  try {
    const url = buildRpcUrlForWallet(walletName);
    const response = await axios.post(
      url,
      {
        jsonrpc: '1.0',
        id: 'list_unspent',
        method: 'listunspent',
        params: [
          0, // Minimum confirmations
          9999999, // Maximum confirmations
          addresses, // Addresses to filter
        ],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    return {
      success: true,
      result: response?.data?.result || [],
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function getCurrentHeight(): Promise<
  { success: true; result: number } | { success: false; error: ErrorDetails }
> {
  try {
    const currentBlockchainInfo = await rpcCall<{ blocks: number }>('getblockchaininfo', []);

    if (!currentBlockchainInfo.success) {
      return { success: false, error: getErrorDetails(currentBlockchainInfo.error) };
    }
    const { blocks: currentHeight } = currentBlockchainInfo.result;

    return {
      success: true,
      result: currentHeight,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

// Important Considerations:
//
// Performance - UTXO scans are resource-intensive and can take minutes
// No Wallet Required - Operates directly on blockchain data
// Testnet Only - Use with caution on mainnet due to resource usage
// scan loaded descriptor (long time call)
// done
export async function scanTxOutSet(addresses: string[]): Promise<ScanTxOutSetResponse> {
  try {
    const descriptors = addresses.map((addr) => `addr(${addr})`);

    const response = await axios.post(
      `http://${RPC_CONFIG.host}:${RPC_CONFIG.port}/`,
      {
        jsonrpc: '1.0',
        id: 'utxo_scan',
        method: 'scantxoutset',
        params: ['start', descriptors],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT / 2,
      },
    );

    const success = !response?.data?.error;

    if (!success) {
      const errMsg = `Could not scan descriptors "${descriptors.join(',')}. Details: "${JSON.stringify(response?.data?.error || {})}"`;

      return {
        success: false,
        error: getErrorDetails(new Error(errMsg)),
      };
    }

    return {
      success: true,
      result: { progress: 100 },
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    const errorDetails = getErrorDetails(error);

    // Specific timeout handling
    if (errorDetails.errCode === 'ECONNABORTED') {
      console.error('⏰ Scan seems to be in progress. Redirecting to call its status.');
      return scanTxOutSetStatus(addresses);
    }

    if (errorDetails.dataErrCode === -8) {
      return scanTxOutSetStatus(addresses);
    }

    return {
      success: false,
      error: errorDetails,
    };
  }
}

// Important Considerations:
//
// Performance - UTXO scans are resource-intensive and can take minutes
// No Wallet Required - Operates directly on blockchain data
// Testnet Only - Use with caution on mainnet due to resource usage
// scan loaded descriptor (long time call)
// done
export async function scanTxOutSetStatus(addresses: string[]): Promise<ScanTxOutSetResponse> {
  try {
    const descriptors = addresses.map((addr) => `addr(${addr})`);

    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'utxo_scan_status',
        method: 'scantxoutset',
        params: ['status', descriptors],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    const success = !response?.data?.error;

    if (!success) {
      const errMsg = `Could not check scan status for descriptors "${descriptors.join(',')}. Details: "${JSON.stringify(response?.data?.error || {})}"`;

      return {
        success: false,
        error: getErrorDetails(new Error(errMsg)),
      };
    }

    const scanResult = response?.data?.result;

    return {
      success: true,
      result: scanResult,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}

// is not used as for now.
export async function getBlockAtTimeApproximate(
  createdAt: string,
  verifyIntegrity = false,
): Promise<GetBlockAtTimeApproximateResponse> {
  // Convert input time to Unix timestamp
  const targetTime = dateUtils.dateToUTCTimestamp(createdAt);
  console.log('ℹ️ Iscription create time (given target)  ', createdAt);
  console.log('ℹ️ TargetTime UTC', targetTime);

  const currentBlockchainInfo = await getCurrentHeight();

  if (!currentBlockchainInfo.success) {
    return { success: false, error: currentBlockchainInfo.error };
  }

  const currentHeight = currentBlockchainInfo.result;

  // Binary search implementation
  let low = 0;
  let high = currentHeight;
  let bestBlock: BlockHeader = {
    height: 0,
    time: 0,
    hash: '',
    previousblockhash: '',
  };

  console.log('ℹ️ CurrentHeight', currentHeight);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const blockHashResult = await rpcCall<string>('getblockhash', [mid]);

    if (!blockHashResult.success) {
      return {
        success: false,
        error: getErrorDetails(new Error(`could not get blockhash info for mid height "${mid}`)),
      };
    }
    const blockHash = blockHashResult.result;

    const blockHeaderResult = await rpcCall<BlockHeader>('getblockheader', [blockHash]);

    if (!blockHeaderResult.success) {
      return {
        success: false,
        error: getErrorDetails(new Error(`could not get blockheader info for blockhash ${blockHash}`)),
      };
    }

    const blockHeader = blockHeaderResult.result;

    // Update best block if closer to target time
    if (Math.abs(blockHeader.time - targetTime) < Math.abs(bestBlock.time - targetTime)) {
      bestBlock = {
        height: blockHeader.height,
        time: blockHeader.time,
        hash: blockHash,
        previousblockhash: blockHeader.previousblockhash,
      };
    }

    if (blockHeader.time < targetTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let currentBlock = bestBlock;

  console.log('✅ Found block is approximately close and before targetTime    ', currentBlock);
  console.log('✅ Found block time is ', dateUtils.timestampToDateString(currentBlock.time));

  // Verify chain continuity
  if (!verifyIntegrity) {
    return { success: true, result: bestBlock };
  }

  while (currentBlock.height > 0) {
    const blockHeaderResult = await rpcCall<BlockHeader>('getblockheader', [currentBlock.hash]);

    if (!blockHeaderResult.success) {
      return {
        success: false,
        error: getErrorDetails(
          new Error(`could not get blockcheader info for currentBlock hash "${currentBlock.hash}"`),
        ),
      };
    }

    const parentHeader = blockHeaderResult.result;

    const blockResult = await rpcCall<BlockHeader>('getblockheader', [parentHeader.previousblockhash]);

    if (!blockResult.success) {
      return {
        success: false,
        error: getErrorDetails(
          new Error(
            `could not get blockheader info for parentHeader previousblockhash "${parentHeader.previousblockhash}"`,
          ),
        ),
      };
    }
    const parentBlock = blockResult.result;

    console.log('✅ parentBlock    ', parentBlock.height);

    if (parentBlock.height !== currentBlock.height - 1) {
      return {
        success: false,
        error: getErrorDetails(
          new Error(
            `Blockchain consistency check failed , parentBlock.height !== currentBlock.height - 1 -> parentBlock height "${parentBlock.height}", currentBlock height "${currentBlock.height}"`,
          ),
        ),
      };
    }

    currentBlock = { ...parentBlock, hash: parentHeader.previousblockhash };
    console.log('✅ currentBlock confirmed    ', currentBlock.height);
  }

  console.log('✅ bestBlock confirmed    ', bestBlock);

  return { success: true, result: bestBlock };
}

export async function broadcastRevealTransaction(txHex: string): Promise<BroadcastRevealTransactionResponse> {
  try {
    const response = await axios.post(
      RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'tx_broadcast',
        method: 'sendrawtransaction',
        params: [txHex],
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    console.log('response.data broadcastRevealTransaction', response.data);
    return {
      success: true,
      result: response?.data?.result || 'n/a',
    };
  } catch (error) {
    console.log('response error broadcastRevealTransaction ', error);
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      error: getErrorDetails(error),
    };
  }
}
