import { TEST_NETWORK, NETWORK } from '@scure/btc-signer';
import 'dotenv/config';

export const DUST_LIMIT = 546n; // Bitcoin's standard dust limit

export const IS_TESTNET = process.env.NETWORK_NAME === 'Testnet';
console.log('IS_TESTNET', IS_TESTNET);

// Defines either Bitcoin Mainnet or Testnet
export const BTC_SIGNER_NETWORK = IS_TESTNET ? TEST_NETWORK : NETWORK;
