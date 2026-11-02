import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { sendWebPush } from '../src/webpush.js';

globalThis.crypto ??= webcrypto;
const encode = bytes => Buffer.from(bytes).toString('base64url');
const decode = value => Buffer.from(value, 'base64url');

test('builds a signed VAPID request with an aes128gcm payload', async () => {
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey));
  const vapidPrivate = await crypto.subtle.exportKey('jwk', vapid.privateKey);
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const previousFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(null, { status: 201 });
  };
  try {
    const response = await sendWebPush(
      { endpoint: 'https://fcm.googleapis.com/send/test', p256dh: encode(receiverPublic), auth_secret: encode(authSecret) },
      { title: 'Classroom started', body: 'QA Systems' },
      { VAPID_PUBLIC_KEY: encode(vapidPublic), VAPID_PRIVATE_KEY: vapidPrivate.d, VAPID_SUBJECT: 'mailto:qa@example.test' }
    );
    assert.equal(response.status, 201);
    assert.equal(captured.url, 'https://fcm.googleapis.com/send/test');
    assert.equal(captured.init.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(captured.init.headers.TTL, '300');

    const authHeader = captured.init.headers.Authorization;
    const token = authHeader.slice('vapid t='.length).split(',')[0];
    const [header, claimsPart, signature] = token.split('.');
    const claims = JSON.parse(decode(claimsPart).toString());
    assert.equal(claims.aud, 'https://fcm.googleapis.com');
    assert.equal(claims.sub, 'mailto:qa@example.test');
    const publicKey = await crypto.subtle.importKey('raw', vapidPublic, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(signature), new TextEncoder().encode(`${header}.${claimsPart}`)), true);

    const record = new Uint8Array(captured.init.body);
    assert.equal(new DataView(record.buffer).getUint32(16), 4096);
    assert.equal(record[20], 65);
    assert.ok(record.length > 100);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('rejects malformed push subscription keys before delivery', async () => {
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey));
  const vapidPrivate = await crypto.subtle.exportKey('jwk', vapid.privateKey);
  await assert.rejects(
    () => sendWebPush(
      { endpoint: 'https://fcm.googleapis.com/send/test', p256dh: 'bad', auth_secret: 'bad' },
      { title: 'x' },
      { VAPID_PUBLIC_KEY: encode(vapidPublic), VAPID_PRIVATE_KEY: vapidPrivate.d, VAPID_SUBJECT: 'mailto:qa@example.test' }
    ),
    /subscription keys are invalid/
  );
});
