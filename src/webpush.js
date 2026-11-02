const encoder = new TextEncoder();

function decodeBase64Url(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function encodeBase64Url(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function concat(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function uint32(value) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

async function hmac(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, value));
}

async function hkdfExpand(prk, info, length) {
  const blocks = [];
  let previous = new Uint8Array();
  for (let counter = 1, size = 0; size < length; counter++) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
    size += previous.length;
  }
  return concat(...blocks).subarray(0, length);
}

async function vapidToken(endpoint, env) {
  const publicKey = decodeBase64Url(env.VAPID_PUBLIC_KEY);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('VAPID public key is invalid.');
  const privateKey = decodeBase64Url(env.VAPID_PRIVATE_KEY);
  if (privateKey.length !== 32) throw new Error('VAPID private key is invalid.');
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: encodeBase64Url(publicKey.subarray(1, 33)),
    y: encodeBase64Url(publicKey.subarray(33, 65)),
    d: encodeBase64Url(privateKey), ext: true, key_ops: ['sign']
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const audience = new URL(endpoint).origin;
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: env.VAPID_SUBJECT })));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned));
  return `${unsigned}.${encodeBase64Url(signature)}`;
}

async function encryptPayload(payload, p256dh, authSecret) {
  const receiverPublic = decodeBase64Url(p256dh);
  const auth = decodeBase64Url(authSecret);
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4 || auth.length !== 16) throw new Error('Push subscription keys are invalid.');
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sender = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, sender.privateKey, 256));
  const authPrk = await hmac(auth, sharedSecret);
  const ikm = await hkdfExpand(authPrk, concat(encoder.encode('WebPush: info\0'), receiverPublic, senderPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await hkdfExpand(prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plain = concat(encoder.encode(JSON.stringify(payload)), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  return concat(salt, uint32(4096), new Uint8Array([senderPublic.length]), senderPublic, ciphertext);
}

export async function sendWebPush(subscription, payload, env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new Error('Web Push is not configured.');
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error('Push endpoint must use HTTPS.');
  const [authorization, body] = await Promise.all([
    vapidToken(endpoint.href, env),
    encryptPayload(payload, subscription.p256dh, subscription.auth_secret)
  ]);
  const response = await fetch(endpoint.href, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${authorization}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '300',
      Urgency: 'high'
    },
    body,
    signal: AbortSignal.timeout(8000)
  });
  return response;
}
