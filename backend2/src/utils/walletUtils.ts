import path from 'path';
import fs from 'fs';
import * as ordinals from 'micro-ordinals';
import * as btc from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { base58, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import * as bitcoin from 'bitcoinjs-lib';
import * as helpers from './helpers';
import ECPairFactory from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import { IS_TESTNET } from '../config/network';

const ECPair = ECPairFactory(tinysecp);
export const network = IS_TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

bitcoin.initEccLib(tinysecp);

// Type definitions
interface KeyPair {
  raw: Uint8Array;
  wif: string;
  hex: string;
}

export function validateWIFNetwork(wifString: string, network: string): boolean {
  const mainnetRegex = /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/;
  const testnetRegex = /^[c][1-9A-HJ-NP-Za-km-z]{51}$/;

  return network === 'mainnet' ? mainnetRegex.test(wifString) : testnetRegex.test(wifString);
}

// A helper function to simplify this code
// const pubkey = hex.encode(secp256k1.getPublicKey(privKeyObj.raw, true));
// creates a compressed pubkey
export const getPublicKeyFromWif = (wif: string) => {
  const network = IS_TESTNET ? 'testnet' : 'mainnet';

  const isValidWif = validateWIFNetwork(wif, network);

  if (!isValidWif) {
    throw new Error('not valid wif for ' + network);
  }

  const btcNetwork = IS_TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

  const keyPair = ECPair.fromWIF(wif, btcNetwork);
  const publicKey = Buffer.from(keyPair.publicKey);

  return {
    raw: publicKey,
    hex: hex.encode(publicKey),
  };
};

// Testnet WIF Generation
export function privateKeyToTestnetWIF(privateKey: Uint8Array, compressed = true): string {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length');
  }

  const version = new Uint8Array([0xef]);

  // 1 byte version + 32 bytes key + 1 byte compression flag = 34 bytes or 33 if not compressed
  // const payload = new Uint8Array(34);
  const payload = new Uint8Array(version.length + privateKey.length + (compressed ? 1 : 0));

  payload.set(version);
  // payload.set(privateKey, 1);
  payload.set(privateKey, version.length); // it is 1 but better to do proper length

  if (compressed) {
    // payload.set([0x01], 33); // Compression flag at index 33
    payload.set([0x01], version.length + privateKey.length);
  }

  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58.encode(new Uint8Array([...payload, ...checksum]));
}

// Mainnet WIF Generation
// @TODO: add support for compression here , similartly to privateKeyToTestnetWIF
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
    hex: hex.encode(privateKey),
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

      const raw = payload.subarray(1, 33);

      return {
        raw,
        wif: existingPrivKey,
        hex: hex.encode(raw),
      };
    }

    return {
      raw: existingPrivKey,
      wif: IS_TESTNET ? privateKeyToTestnetWIF(existingPrivKey) : privateKeyToMainnetWIF(existingPrivKey),
      hex: hex.encode(existingPrivKey),
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
