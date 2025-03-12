// createInscription.mjs
import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';
import * as ordinals from 'micro-ordinals';
import { base58, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { detectContentType } from './services/utils.mjs';
import { DUST_LIMIT, BTC_SIGNER_NETWORK, IS_TESTNET } from './config/network.mjs';

import fs from 'fs';

// Testnet WIF Generation (Fixed payload length)
export function privateKeyToTestnetWIF(privateKey) {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length');
  }

  // 1 byte version + 32 bytes key + 1 byte compression flag = 34 bytes
  const version = new Uint8Array([0xef]);
  const payload = new Uint8Array(34);
  payload.set(version);
  payload.set(privateKey, 1);
  payload.set([0x01], 33); // Compression flag at index 33

  // Calculate checksum over the 34-byte payload
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  const wifBytes = new Uint8Array([...payload, ...checksum]);

  return base58.encode(wifBytes);
}

// Mainnet WIF Generation
function privateKeyToMainnetWIF(privateKey) {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length');
  }

  const version = new Uint8Array([0x80]);
  const payload = new Uint8Array(34);
  payload.set(version);
  payload.set(privateKey, 1);
  payload.set([0x01], 33);

  const checksum = sha256(sha256(payload)).subarray(0, 4);
  const wifBytes = new Uint8Array([...payload, ...checksum]);

  return base58.encode(wifBytes);
}

// Network-aware key pair generator
function generateNetworkKeyPair(network) {
  console.log('network', network);
  const privateKey = secp256k1.utils.randomPrivateKey();
  return {
    raw: privateKey,
    wif: network === 'testnet' ? privateKeyToTestnetWIF(privateKey) : privateKeyToMainnetWIF(privateKey),
  };
}

// Unified private key handler
const getPrivateKey = (existingPrivKey = null) => {
  if (existingPrivKey) {
    if (typeof existingPrivKey === 'string') {
      // Decode and validate WIF
      const decoded = base58.decode(existingPrivKey);

      // Validate checksum
      const payload = decoded.subarray(0, -4);
      const checksum = decoded.subarray(-4);
      const verifyChecksum = sha256(sha256(payload)).subarray(0, 4);
      if (!verifyChecksum.every((v, i) => v === checksum[i])) {
        throw new Error('Invalid WIF checksum');
      }

      // Validate network version
      const expectedVersion = IS_TESTNET ? 0xef : 0x80;
      if (payload[0] !== expectedVersion) {
        throw new Error(`Invalid WIF version for ${IS_TESTNET ? 'testnet' : 'mainnet'}`);
      }

      return {
        raw: payload.subarray(1, 33), // Extract 32-byte private key
        wif: existingPrivKey,
      };
    }

    console.log('IS_TESTNET', IS_TESTNET);
    // Handle raw Uint8Array input
    return {
      raw: existingPrivKey,
      wif: IS_TESTNET ? privateKeyToTestnetWIF(existingPrivKey) : privateKeyToMainnetWIF(existingPrivKey),
    };
  }

  // Generate new key pair
  return generateNetworkKeyPair(IS_TESTNET ? 'testnet' : 'mainnet');
};

// Schnorr public key derivation with validation
function getSchnorrPublicKey(privateKey) {
  let keyBytes;

  if (typeof privateKey === 'string') {
    // Full WIF decoding flow
    const decoded = base58.decode(privateKey);
    const payload = decoded.subarray(0, -4);
    const checksum = decoded.subarray(-4);

    // Verify checksum
    const verifyChecksum = sha256(sha256(payload)).subarray(0, 4);
    if (!verifyChecksum.every((v, i) => v === checksum[i])) {
      throw new Error('Invalid WIF checksum');
    }

    // Validate network version
    const expectedVersion = IS_TESTNET ? 0xef : 0x80;
    if (payload[0] !== expectedVersion) {
      throw new Error(`Network version mismatch: Expected ${expectedVersion.toString(16)}`);
    }

    keyBytes = payload.subarray(1, 33);
  } else {
    keyBytes = privateKey;
  }

  // Final validation
  if (keyBytes.length !== 32) {
    throw new Error(`Invalid key length: ${keyBytes.length} bytes (must be 32)`);
  }

  return btc.utils.pubSchnorr(keyBytes);
}

export function createInscription(fileContent, feeRate, recipientAddress, existingPrivKey = null) {
  const privKeyObj = getPrivateKey(existingPrivKey);

  console.log('privKey', privKeyObj);

  const { raw: privKey, wif: privKeyHex } = privKeyObj;

  const pubKey = getSchnorrPublicKey(privKeyHex);
  console.log('aaa', privKeyHex);

  // Auto-detect content type from file content
  const contentType = detectContentType(fileContent);
  console.log('Detected content type:', contentType);

  // Create inscription
  const inscription = {
    tags: {
      contentType: contentType,
    },
    body: fileContent,
  };

  console.log('b');
  const customScripts = [ordinals.OutOrdinalReveal];

  // Create reveal payment
  const revealPayment = btc.p2tr(
    undefined,
    ordinals.p2tr_ord_reveal(pubKey, [inscription]),
    BTC_SIGNER_NETWORK,
    false,
    customScripts,
  );

  // Calculate required data sizes for fee estimation
  const witnessSize = fileContent.length + 100; // Add padding for witness overhead
  const totalSize = witnessSize + 200; // Add padding for transaction overhead

  // Calculate fees with decimal fee rate support
  const feeInSats = Math.ceil((totalSize * feeRate) / 4);
  const fee = BigInt(feeInSats);

  // Create reveal transaction function - move it outside
  function createRevealTx(txid, index, amount) {
    const tx = new btc.Transaction({ customScripts });
    const inputAmount = BigInt(amount);
    const outputAmount = inputAmount - fee;

    // Check if output would be dust
    if (outputAmount < DUST_LIMIT) {
      throw new Error(
        `Output amount (${outputAmount} sats) would be below dust limit (${DUST_LIMIT} sats). Need larger input amount.`,
      );
    }

    tx.addInput({
      ...revealPayment,
      txid,
      index,
      witnessUtxo: { script: revealPayment.script, amount: inputAmount },
    });

    // Send to provided recipient address
    tx.addOutputAddress(recipientAddress, outputAmount, BTC_SIGNER_NETWORK);

    tx.sign(privKeyHex);
    tx.finalize();
    return hex.encode(tx.extract());
  }

  return {
    fileSize: fileContent.length,
    // tempPrivateKey: hex.encode(privKey),
    tempPrivateKey: privKeyHex,
    address: revealPayment.address,
    requiredAmount: fee.toString(),
    createRevealTx: createRevealTx,
  };
}

// Optional example usage if the script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const recipientAddress = 'bc1p3wrhf9qjustckfhkfs5g373ux06ydlet0vyuvd9rjpshxwvu5p6sulqxdd';
  const feeRate = 1.5; // Example decimal fee rate
  const fileContent = fs.readFileSync('test.txt');

  const inscription = createInscription(fileContent, feeRate, recipientAddress);

  console.log('=============== Inscription Details ===============');
  console.log('File size:', inscription.fileSize, 'bytes');
  console.log('Temporary private key:', inscription.tempPrivateKey);
  console.log('Address to send BTC:', inscription.address);
  console.log('Required amount:', inscription.requiredAmount, 'satoshis');
  console.log('================================================');
}
