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

// when we broadcast, the hex might be big, so I have increased it up to 10mb for now
export const REQUEST_SIZE_LIMIT = '10mb';

console.log('Config RPC_CONFIG', RPC_CONFIG, RPC_URL);

export const PG_POOL_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'ordinals',
  pool_mode: 'session',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

console.log('Config PG_POOL_CONFIG', PG_POOL_CONFIG);
