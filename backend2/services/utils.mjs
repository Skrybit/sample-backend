export function detectContentType(buffer) {
    // Common file signatures and their corresponding MIME types
    const signatures = {
        // Images
        ffd8ff: 'image/jpeg',
        '89504e47': 'image/png',
        47494638: 'image/gif',
        // Documents
        25504446: 'application/pdf',
        // Audio
        494433: 'audio/mpeg',
        fff3: 'audio/mpeg',
        fff2: 'audio/mpeg',
        4944: 'audio/mpeg',
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

// @TODO implement RPC
export async function checkPaymentToAddess(inscriptionId, address, amountInSats, updateInscriptionPayment) {
    console.log(`checking ${address} for ${amountInSats}`);

    // make res to check the rpc call
    const res = false;

    if (res === true) {
        updateInscriptionPayment.run('paid', inscriptionId);
    }

    return res;
}
