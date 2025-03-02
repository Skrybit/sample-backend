import { Buffer } from 'buffer';

export function detectContentType(buffer: Uint8Array): string {
  // Common file signatures and their corresponding MIME types
  const signatures: Record<string, string> = {
    // Images
    ffd8ff: 'image/jpeg',
    '89504e47': 'image/png',
    '47494638': 'image/gif',
    // Documents
    '25504446': 'application/pdf',
    // Audio
    '494433': 'audio/mpeg',
    fff3: 'audio/mpeg',
    fff2: 'audio/mpeg',
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
  const hexStr = Buffer.from(buffer).toString('hex', 0, 4).toLowerCase();

  // Check against signatures
  for (const [signature, mimeType] of Object.entries(signatures)) {
    if (hexStr.startsWith(signature.toLowerCase())) {
      return mimeType;
    }
  }

  // Text detection with proper Buffer conversion
  try {
    // Convert Uint8Array to Buffer and slice first 1024 bytes
    const bufferSlice = Buffer.from(buffer).subarray(0, 1024);
    const textSample = bufferSlice.toString('utf8'); // Now works correctly

    if (/^[\x20-\x7E\n\r\t]*$/.test(textSample)) {
      return 'text/plain;charset=utf-8';
    }
  } catch (e) {
    // Ignore decoding errors
  }
  // Default fallback
  return 'application/octet-stream';
}

export function satsToBtc(sats: number): number | null {
  if (typeof sats !== 'number' || isNaN(sats) || sats < 0) {
    console.error('Invalid input: Sats must be a non-negative number.');
    return null;
  }
  return Math.round(sats / 1e8);
}

export function btcToSats(btc: number): number | null {
  if (typeof btc !== 'number' || isNaN(btc) || btc < 0) {
    console.error('Invalid input: BTC must be a non-negative number.');
    return null;
  }
  return Math.round(btc * 1e8);
}
