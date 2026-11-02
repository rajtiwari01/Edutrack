import { webcrypto } from 'node:crypto';

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
const publicBytes = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
const encode = bytes => Buffer.from(bytes).toString('base64url');

process.stdout.write(`VAPID_PUBLIC_KEY=${encode(publicBytes)}\nVAPID_PRIVATE_KEY=${privateJwk.d}\n`);
