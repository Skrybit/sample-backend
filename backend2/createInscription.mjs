import * as btc from '@scure/btc-signer';
import * as ordinals from 'micro-ordinals';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { detectContentType } from './services/utils.mjs';
import { DUST_LIMIT, BTC_SIGNER_NETWORK } from './config/network.mjs';

import fs from 'fs';

export function createInscription(fileContent, feeRate, existingPrivKey = null) {
    // Use the provided private key or generate a new one
    const privKey = existingPrivKey
        ? hex.decode(existingPrivKey) // Convert hex string back to Uint8Array
        : secp256k1.utils.randomPrivateKey();

    console.log('privkey: ' + hex.encode(privKey));

    const pubKey = btc.utils.pubSchnorr(privKey);

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

        tx.sign(privKey);
        tx.finalize();
        return hex.encode(tx.extract());
    }

    return {
        fileSize: fileContent.length,
        tempPrivateKey: hex.encode(privKey),
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
