import { sha256 } from '@noble/hashes/sha256';
import { base58 } from '@scure/base';

export function privateKeyToTestnetWIF(
    privateKey, // Uint8Array
    compressed = true,
) {
    const version = new Uint8Array([0xef]); // Testnet version byte
    const payload = new Uint8Array(version.length + privateKey.length + (compressed ? 1 : 0));

    // Manual byte concatenation
    payload.set(version);
    payload.set(privateKey, version.length);
    if (compressed) {
        payload.set([0x01], version.length + privateKey.length);
    }

    return base58check.encode(payload);
}

const base58check = {
    encode: (payload) => {
        const checksum = sha256(sha256(payload));
        const combined = new Uint8Array(payload.length + 4);
        combined.set(payload);
        combined.set(checksum.subarray(0, 4), payload.length);
        return base58.encode(combined);
    },
    decode: (encoded) => {
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
