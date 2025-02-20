import * as btc from '@scure/btc-signer';
import * as ordinals from 'micro-ordinals';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import fs from 'fs';

function detectContentType(buffer) {
    // Common file signatures and their corresponding MIME types
    const signatures = {
        // Images
        'ffd8ff': 'image/jpeg',
        '89504e47': 'image/png',
        '47494638': 'image/gif',
        // Documents
        '25504446': 'application/pdf',
        // Audio
        '494433': 'audio/mpeg',
        'fff3': 'audio/mpeg',
        'fff2': 'audio/mpeg',
        '4944': 'audio/mpeg',
        // Video
        '000001': 'video/mpeg',
        // SVG (usually starts with '<?xml' or '<svg')
        '3c3f786d': 'image/svg+xml',
        '3c737667': 'image/svg+xml',
        // Text files
        '7b': 'application/json', // Starts with {
        '5b': 'application/json', // Starts with [
    };

    // Convert the first few bytes to hex
    const hex = Buffer.from(buffer).toString('hex', 0, 4).toLowerCase();

    // Check against signatures
    for (let [signature, mimeType] of Object.entries(signatures)) {
        if (hex.startsWith(signature)) {
            return mimeType;
        }
    }

    // Text detection (check if content is UTF-8 compatible)
    try {
        const textSample = buffer.slice(0, 1024).toString('utf8');
        // If we can decode it as UTF-8 and it contains mainly printable characters
        if (/^[\x20-\x7E\n\r\t]*$/.test(textSample)) {
            return 'text/plain;charset=utf-8';
        }
    } catch (e) {
        // If UTF-8 decode fails, ignore
    }

    // Default fallback
    return 'application/octet-stream';
}

export function createInscription(fileContent, feeRate, recipientAddress, existingPrivKey = null) {
    const DUST_LIMIT = 546n; // Bitcoin's standard dust limit
    
    // Use the provided private key or generate a new one
    const privKey = existingPrivKey
        ? hex.decode(existingPrivKey) // Convert hex string back to Uint8Array
        : secp256k1.utils.randomPrivateKey();
    
    console.log("privkey: " + hex.encode(privKey));
    const pubKey = btc.utils.pubSchnorr(privKey);

    // Auto-detect content type from file content
    const contentType = detectContentType(fileContent);
    console.log("Detected content type:", contentType);

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
        btc.NETWORK,
        false,
        customScripts
    );

    // Calculate required data sizes for fee estimation
    const witnessSize = fileContent.length + 100; // Add padding for witness overhead
    const totalSize = witnessSize + 200; // Add padding for transaction overhead

    // Calculate fees with decimal fee rate support
    const feeInSats = Math.ceil(totalSize * feeRate / 4);
    const fee = BigInt(feeInSats);

    // Create reveal transaction function
    function createRevealTx(txid, index, amount) {
        const tx = new btc.Transaction({ customScripts });
        const inputAmount = BigInt(amount);
        const outputAmount = inputAmount - fee;
        
        // Check if output would be dust
        if (outputAmount < DUST_LIMIT) {
            throw new Error(`Output amount (${outputAmount} sats) would be below dust limit (${DUST_LIMIT} sats). Need larger input amount.`);
        }
        
        tx.addInput({
            ...revealPayment,
            txid,
            index,
            witnessUtxo: { script: revealPayment.script, amount: inputAmount }
        });

        // Send to provided recipient address
        tx.addOutputAddress(
            recipientAddress,
            outputAmount,
            btc.NETWORK
        );

        tx.sign(privKey);
        tx.finalize();
        return hex.encode(tx.extract());
    }

    return {
        fileSize: fileContent.length,
        tempPrivateKey: hex.encode(privKey),
        address: revealPayment.address,
        requiredAmount: fee.toString(),
        createRevealTx: createRevealTx
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