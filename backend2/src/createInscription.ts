// createInscription.ts
import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';
import * as ordinals from 'micro-ordinals';
import { base58, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { detectContentType } from './services/utils';
import { DUST_LIMIT, BTC_SIGNER_NETWORK, IS_TESTNET } from './config/network';

// Type definitions
interface KeyPair {
  raw: Uint8Array;
  wif: string;
}

interface InscriptionResult {
  fileSize: number;
  tempPrivateKey: string;
  address: string;
  requiredAmount: string;
  createRevealTx: (txid: string, index: number, amount: bigint | number) => string;
}

interface InscriptionData {
  tags: {
    contentType: string;
  };
  body: Uint8Array;
}

// Testnet WIF Generation
export function privateKeyToTestnetWIF(privateKey: Uint8Array): string {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length');
  }

  const version = new Uint8Array([0xef]);
  const payload = new Uint8Array(34);
  payload.set(version);
  payload.set(privateKey, 1);
  payload.set([0x01], 33);

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

// Unified private key handler
function getPrivateKey(existingPrivKey?: string | Uint8Array | null): KeyPair {
  if (existingPrivKey) {
    if (typeof existingPrivKey === 'string') {
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

// Schnorr public key derivation
function getSchnorrPublicKey(privateKey: string | Uint8Array): Uint8Array {
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

export function createInscription(
  fileContent: Uint8Array,
  feeRate: number,
  existingPrivKey?: string | Uint8Array | null,
): InscriptionResult {
  const privKeyObj = getPrivateKey(existingPrivKey);
  const pubKey = getSchnorrPublicKey(privKeyObj.wif);

  const contentType = detectContentType(fileContent);
  const inscription: InscriptionData = {
    tags: { contentType },
    body: fileContent,
  };

  const customScripts = [ordinals.OutOrdinalReveal];

  const revealPayment = btc.p2tr(
    undefined,
    ordinals.p2tr_ord_reveal(pubKey, [inscription]),
    BTC_SIGNER_NETWORK,
    false,
    customScripts,
  );

  const witnessSize = fileContent.length + 100;
  const totalSize = witnessSize + 200;
  const feeInSats = Math.ceil((totalSize * feeRate) / 4);
  const fee = BigInt(feeInSats);

  function createRevealTx(txid: string, index: number, amount: bigint | number): string {
    const tx = new btc.Transaction({ customScripts });
    const inputAmount = BigInt(amount);
    const outputAmount = inputAmount - fee;

    if (outputAmount < DUST_LIMIT) {
      throw new Error(`Output amount (${outputAmount} sats) below dust limit (${DUST_LIMIT} sats)`);
    }

    tx.addInput({
      ...revealPayment,
      txid,
      index,
      witnessUtxo: { script: revealPayment.script, amount: inputAmount },
    });

    tx.addOutputAddress(revealPayment.address!, outputAmount, BTC_SIGNER_NETWORK);
    tx.sign(privKeyObj.raw);
    tx.finalize();

    return hex.encode(tx.extract());
  }

  return {
    fileSize: fileContent.length,
    tempPrivateKey: privKeyObj.wif,
    address: revealPayment.address!,
    requiredAmount: fee.toString(),
    createRevealTx,
  };
}
