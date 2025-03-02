import path from 'path';
import fs from 'fs';
import * as ordinals from 'micro-ordinals';
import * as btc from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import * as bitcoin from 'bitcoinjs-lib';
import * as helpers from './helpers';
import 'dotenv/config';

import { IS_TESTNET } from '../config/network';

const network = bitcoin.networks.testnet;

interface Base58Check {
  encode: (payload: Uint8Array) => string;
  decode: (encoded: string) => Uint8Array;
}

// Type definitions
interface KeyPair {
  raw: Uint8Array;
  wif: string;
}

export const base58check: Base58Check = {
  encode: (payload: Uint8Array): string => {
    const checksum = sha256(sha256(payload));
    const combined = new Uint8Array(payload.length + 4);
    combined.set(payload);
    combined.set(checksum.subarray(0, 4), payload.length);
    return base58.encode(combined);
  },

  decode: (encoded: string): Uint8Array => {
    const decoded = base58.decode(encoded);
    const payload = decoded.subarray(0, -4);
    const checksum = decoded.subarray(-4);

    const verify = sha256(sha256(payload));
    if (!verify.subarray(0, 4).every((v, i) => v === checksum[i])) {
      throw new Error('Invalid checksum');
    }

    return payload;
  },
};
// Testnet WIF Generation
export function privateKeyToTestnetWIF(privateKey: Uint8Array): string {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length');
  }

  // 1 byte version + 32 bytes key + 1 byte compression flag = 34 bytes
  const version = new Uint8Array([0xef]);
  const payload = new Uint8Array(34);

  payload.set(version);
  payload.set(privateKey, 1);
  payload.set([0x01], 33); // Compression flag at index 33

  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58.encode(new Uint8Array([...payload, ...checksum]));
}

// Mainnet WIF Generation
function privateKeyToMainnetWIF(privateKey: Uint8Array): string {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length');
  }

  const version = new Uint8Array([0x80]);
  const payload = new Uint8Array(34);
  payload.set(version);
  payload.set(privateKey, 1);
  payload.set([0x01], 33);

  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58.encode(new Uint8Array([...payload, ...checksum]));
}

// Network-aware key pair generator
function generateNetworkKeyPair(network: 'testnet' | 'mainnet'): KeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  return {
    raw: privateKey,
    wif: network === 'testnet' ? privateKeyToTestnetWIF(privateKey) : privateKeyToMainnetWIF(privateKey),
  };
}

// Schnorr public key derivation
export function getSchnorrPublicKey(privateKey: string | Uint8Array): Uint8Array {
  let keyBytes: Uint8Array;

  if (typeof privateKey === 'string') {
    const decoded = base58.decode(privateKey);
    const payload = decoded.subarray(0, -4);
    const checksum = decoded.subarray(-4);
    const verifyChecksum = sha256(sha256(payload)).subarray(0, 4);

    if (!verifyChecksum.every((v, i) => v === checksum[i])) {
      throw new Error('Invalid WIF checksum');
    }

    const expectedVersion = IS_TESTNET ? 0xef : 0x80;
    if (payload[0] !== expectedVersion) {
      throw new Error(`Network version mismatch: Expected ${expectedVersion.toString(16)}`);
    }

    keyBytes = payload.subarray(1, 33);
  } else {
    keyBytes = privateKey;
  }

  if (keyBytes.length !== 32) {
    throw new Error(`Invalid key length: ${keyBytes.length} bytes (must be 32)`);
  }

  return btc.utils.pubSchnorr(keyBytes);
}

// Unified private key handler
export function getPrivateKey(existingPrivKey?: string | Uint8Array | null): KeyPair {
  if (existingPrivKey) {
    if (typeof existingPrivKey === 'string') {
      // Decode and validate WIF
      const decoded = base58.decode(existingPrivKey);

      const payload = decoded.subarray(0, -4);
      const checksum = decoded.subarray(-4);
      const verifyChecksum = sha256(sha256(payload)).subarray(0, 4);

      if (!verifyChecksum.every((v, i) => v === checksum[i])) {
        throw new Error('Invalid WIF checksum');
      }

      const expectedVersion = IS_TESTNET ? 0xef : 0x80;
      if (payload[0] !== expectedVersion) {
        throw new Error(`Invalid WIF version for ${IS_TESTNET ? 'testnet' : 'mainnet'}`);
      }

      return {
        raw: payload.subarray(1, 33),
        wif: existingPrivKey,
      };
    }

    return {
      raw: existingPrivKey,
      wif: IS_TESTNET ? privateKeyToTestnetWIF(existingPrivKey) : privateKeyToMainnetWIF(existingPrivKey),
    };
  }

  return generateNetworkKeyPair(IS_TESTNET ? 'testnet' : 'mainnet');
}

// temporary helper to create the same address for the same inscription
interface InscriptionData {
  tags: {
    contentType: string;
  };
  body: Uint8Array;
}

// temporary helper to create the same address for the same inscription
export async function getRevealPaymentAddressForWif(wif: string) {
  try {
    const INSCRIBE_FILE = 'test.txt';
    const filePath = path.join(__dirname, INSCRIBE_FILE);

    const fileContent = fs.readFileSync(filePath);

    const contentType = helpers.detectContentType(fileContent);

    const inscription: InscriptionData = {
      tags: { contentType },
      body: fileContent,
    };

    const customScripts = [ordinals.OutOrdinalReveal];

    const privKeyObj = getPrivateKey(wif);

    const { wif: privKeyWif } = privKeyObj;

    const pubKeySchnorr = getSchnorrPublicKey(privKeyWif);

    const revealPayment = btc.p2tr(
      undefined,
      ordinals.p2tr_ord_reveal(pubKeySchnorr, [inscription]),
      network,
      false,
      customScripts,
    );

    return revealPayment.address;
  } catch (error) {
    console.error('Error getting reveal payment address address:');
    console.log('EEE err', error);
  }
}

// temporary keep it here
// export async function getAddressDescriptorWithChecksum(address: string) {
//   try {
//     const baseDescriptor = `addr(${address})`;
//
//     const response = await rpcApi.getDescriptorChecksum(baseDescriptor);
//     const { error, descriptorChecksum, success: isFetched } = response;
//
//     if (!isFetched || !descriptorChecksum) {
//       return {
//         success: false,
//         details: `Could not fetch checksum.`,
//         error,
//       };
//     }
//
//     const descriptorWithChecksum = `${baseDescriptor}#${descriptorChecksum}`;
//
//     return { descriptorWithChecksum, success: true };
//   } catch (error) {
//     console.error('Error getting address descriptor:', error instanceof Error ? error.message : error);
//   }
// }
