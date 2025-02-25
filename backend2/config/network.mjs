import { TEST_NETWORK, NETWORK } from '@scure/btc-signer';

export const DUST_LIMIT = 546n; // Bitcoin's standard dust limit

// Defines either Bitcoin Mainnet or Testnet
export const BTC_SIGNER_NETWORK = process.env.NETWORK_NAME === 'Testnet' ? TEST_NETWORK : NETWORK;
