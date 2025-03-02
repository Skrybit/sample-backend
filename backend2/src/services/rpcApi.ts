import axios from 'axios';
import * as dateUtils from '../utils/dateUtils';
import 'dotenv/config';

// Configuration from environment
const RPC_CONFIG = {
  host: process.env.RPC_HOST || '127.0.0.1',
  port: process.env.RPC_PORT || 18332,
  user: process.env.RPC_USER || 'your_username',
  pass: process.env.RPC_PASS || 'your_password',
};

const RPC_URL = `http://${RPC_CONFIG.host}:${RPC_CONFIG.port}/`;
const RPC_TIMEOUT = 15_000;

type BlockHeader = {
  time: number;
  height: number;
  previousblockhash: string;
  hash: string;
};

type RpcRes<T> = {
  success: boolean;
  result: T | false;
  error?: ErrorDetails;
};

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

// @TODO: make rest of functions to use this rpcCall
async function rpcCall<T>(
  method: string,
  params: any[],
  errorDetailsText = '',
  timeout = RPC_TIMEOUT,
): Promise<RpcRes<T>> {
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
      throw new Error(response.data.error.message);
    }

    // return response.data.result;
    return {
      success: true,
      result: response?.data?.result,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    const errorDetails = getErrorDetails(error);

    const errorToReturn = errorDetailsText ? { ...errorDetails, details: errorDetailsText } : errorDetails;

    return {
      success: false,
      result: false,
      error: errorToReturn,
    };
  }
}

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

export async function isWalletLoaded(walletName: string) {
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

    const loadedWallets: string[] = response?.data?.result;
    const success = loadedWallets.includes(walletName);

    return { walletName, success };
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

export async function loadWallet(walletName: string) {
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
      success: !response?.data?.error,
      originalResponse: response?.data,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    const errorDetails = getErrorDetails(error);

    let errorDetailsText = errorDetails.details;

    let success = false;

    if (errorDetails?.dataErrMsg?.includes('already loaded')) {
      errorDetailsText = `ℹ️ Wallet "${walletName}" already loaded`;
      success = true;
    }

    return {
      walletName,
      success,
      error: { ...errorDetails, details: errorDetailsText },
    };
  }
}

export async function unLoadWallet(walletName: string) {
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
      walletName,
      success: !response?.data?.error,
      originalResponse: response?.data,
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

export async function createWallet(walletName: string, descriptorSupport = false) {
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
      success: !response?.data?.error,
      originalResponse: response?.data,
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

export async function getDescriptorChecksum(descriptor: string) {
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
      descriptorChecksum,
      success: !response?.data?.error,
      originalResponse: response.data,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      descriptorChecksum: '',
      success: false,
      error: getErrorDetails(error),
    };
  }
}

export async function importDescriptor(descriptorWithChecksum: string, walletName: string) {
  try {
    const url = buildRpcUrlForWallet(walletName);

    const response = await axios.post(
      url, // with the wallet name
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
      success: !response?.data?.error && response?.data?.result[0]?.success,
      originalResponse: response.data,
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

export async function getBalance(walletName: string) {
  try {
    const url = buildRpcUrlForWallet(walletName);

    const response = await axios.post(
      url,
      {
        jsonrpc: '1.0',
        id: 'get_balance',
        method: 'getbalance',
      },
      {
        headers: getAuthHeaders(),
        timeout: RPC_TIMEOUT,
      },
    );

    const balance = response?.data?.result;

    return {
      success: !response?.data?.error,
      balance,
      details: `✅ WalletName "${walletName}" has balance "${balance}"`,
      originalResponse: response.data,
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

export async function rescanBlockchain(walletName: string, startBlock: number) {
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
      success: !response?.data?.error,
      startHeight: response?.data?.result?.start_height,
      stoptHeight: response?.data?.result?.stop_height,
      details: `✅ WalletName "${walletName}" has been rescanned`,
      originalResponse: response.data,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      startHeight: 0,
      stopHeight: 0,
      error: getErrorDetails(error),
    };
  }
}

export async function listWalletReceivedByAddress(walletName: string) {
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

    // const addresses = response?.data?.result as Array<{
    //   address: string;
    //   amount: number;
    //   confirmations: number;
    //   label: string;
    //   txids: string[];
    // }>;

    return {
      success: !response?.data?.error,
      addresses: response?.data?.result,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      addresses: [],
      error: getErrorDetails(error),
    };
  }
}

export async function listAddressUTXOs(walletName: string, addresses: string[]) {
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

    // const utxoList = response.data.result as Array<{
    //   txid: string;
    //   vout: number;
    //   address: string;
    //   amount: number;
    //   confirmations: number;
    //   scriptPubKey: string;
    //   spendable: boolean;
    // }>;

    return {
      success: !response?.data?.error,
      utxoList: response?.data?.result,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      utxoList: [],
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
export async function scanTxOutSet(addresses: string[]) {
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

    return {
      success: !response?.data?.error,
      scanResult: response?.data?.result,
      details: `✅ Addresses "${addresses.join(',')}" have been checked`,
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
      scanResult: false,
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
export async function scanTxOutSetStatus(addresses: string[]) {
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

    const scanResult = response?.data?.result;

    return {
      success: !response?.data?.error,
      scanResult,
    };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      handleNonRpcError(error);
    }

    return {
      success: false,
      scanResult: { progress: 0 },
      error: getErrorDetails(error),
    };
  }
}

export async function getBlockAtTimeApproximate(
  createdAt: string,
  verifyIntegrity = false,
): Promise<{ success: true; result: BlockHeader } | { success: false; error?: ErrorDetails }> {
  // Convert input time to Unix timestamp
  const targetTime = dateUtils.dateToUTCTimestamp(createdAt);
  console.log('ℹ️ Iscription create time (given target)  ', createdAt);
  console.log('ℹ️ TargetTime UTC', targetTime);

  // Get current blockchain info
  const currentBlockchainInfo = await rpcCall<{ blocks: number }>(
    'getblockchaininfo',
    [],
    `❌ Could not get current blockchain info `,
  );

  if (!currentBlockchainInfo.result || !currentBlockchainInfo.success) {
    return { success: false, error: currentBlockchainInfo.error };
  }

  const { blocks: currentHeight } = currentBlockchainInfo.result;

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

    if (!blockHashResult.result || !blockHashResult.success) {
      throw new Error('could not get blockhash info');
    }
    const blockHash = blockHashResult.result;

    const blockHeaderResult = await rpcCall<BlockHeader>('getblockheader', [blockHash]);

    if (!blockHeaderResult.result || !blockHeaderResult.success) {
      throw new Error('could not get blockcheader info');
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

    if (!blockHeaderResult.result || !blockHeaderResult.success) {
      throw new Error('could not get blockcheader info');
    }

    const parentHeader = blockHeaderResult.result;

    const blockResult = await rpcCall<BlockHeader>('getblockheader', [parentHeader.previousblockhash]);

    if (!blockResult.result || !blockResult.success) {
      throw new Error('could not get blockheader info');
    }
    const parentBlock = blockResult.result;

    console.log('✅ parentBlock    ', parentBlock.height);

    if (parentBlock.height !== currentBlock.height - 1) {
      throw new Error('Blockchain consistency check failed');
    }
    currentBlock = { ...parentBlock, hash: parentHeader.previousblockhash };
    console.log('✅ currentBlock confirmed    ', currentBlock.height);
  }

  console.log('✅ bestBlock confirmed    ', bestBlock);

  return { success: true, result: bestBlock };
}
