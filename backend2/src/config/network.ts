import { TEST_NETWORK, NETWORK } from '@scure/btc-signer';

import dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../../.env` }); // Adjust path if needed

export const DUST_LIMIT = 546n; // Bitcoin's standard dust limit

export const IS_TESTNET = process.env.NETWORK_NAME === 'Testnet';

// just to make it easier to differentiate wallets on the node and avoid id collision
export const WALLET_STUB_VAL = process.env.WALLET_STUB_VAL || 'api_server';

console.log('Config IS_TESTNET', IS_TESTNET);

// Defines either Bitcoin Mainnet or Testnet
export const BTC_SIGNER_NETWORK = IS_TESTNET ? TEST_NETWORK : NETWORK;

// Configuration from environment
export const RPC_CONFIG = {
  host: process.env.RPC_HOST || '127.0.0.1',
  port: process.env.RPC_PORT || 18332,
  user: process.env.RPC_USER || 'your_username',
  pass: process.env.RPC_PASS || 'your_password',
};

// rpcApi
export const RPC_URL = `http://${RPC_CONFIG.host}:${RPC_CONFIG.port}/`;
export const RPC_TIMEOUT = 15_000;

// client
export const BASE_URL = process.env.BASE_URL || '';
// from who we create the inscription
export const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS || '';
// for who we create the inscription
export const SENDER_ADDRESS = process.env.SENDER_ADDRESS || '';

// only used in create commit for now
export const FEE_RATE = 1.5;

console.log('Config RPC_CONFIG', RPC_CONFIG, RPC_URL);
