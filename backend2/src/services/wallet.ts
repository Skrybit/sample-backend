// import { sha256 } from '@noble/hashes/sha256';
// import { base58 } from '@scure/base';

// export function privateKeyToTestnetWIF(privateKey: Uint8Array, compressed: boolean = true): string {
//   if (privateKey.length !== 32) {
//     throw new Error('Invalid private key length. Must be 32 bytes');
//   }
//
//   const version = new Uint8Array([0xef]); // Testnet version byte
//   const payloadSize = version.length + privateKey.length + (compressed ? 1 : 0);
//   const payload = new Uint8Array(payloadSize);
//
//   payload.set(version);
//   payload.set(privateKey, version.length);
//
//   if (compressed) {
//     payload.set([0x01], version.length + privateKey.length);
//   }
//
//   return base58check.encode(payload);
// }

// interface Base58Check {
//   encode: (payload: Uint8Array) => string;
//   decode: (encoded: string) => Uint8Array;
// }

// export const base58check: Base58Check = {
//   encode: (payload: Uint8Array): string => {
//     const checksum = sha256(sha256(payload));
//     const combined = new Uint8Array(payload.length + 4);
//     combined.set(payload);
//     combined.set(checksum.subarray(0, 4), payload.length);
//     return base58.encode(combined);
//   },
//
//   decode: (encoded: string): Uint8Array => {
//     const decoded = base58.decode(encoded);
//     const payload = decoded.subarray(0, -4);
//     const checksum = decoded.subarray(-4);
//
//     const verify = sha256(sha256(payload));
//     if (!verify.subarray(0, 4).every((v, i) => v === checksum[i])) {
//       throw new Error('Invalid checksum');
//     }
//
//     return payload;
//   },
// };
