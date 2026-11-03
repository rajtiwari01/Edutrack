import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const apiSource = appSource.split('\n').find(line => line.startsWith('async function api('));
const busySource = appSource.split('\n').find(line => line.startsWith('function setFormBusy('));
assert.ok(apiSource, 'The frontend api() request helper is present.');
assert.ok(busySource, 'The frontend setFormBusy() state helper is present.');

function createHarness(fetchImpl, { timeout = false } = {}) {
  const submit = { disabled: false, textContent: 'Save', dataset: {} };
  const form = {
    isConnected: true,
    dataset: {},
    querySelectorAll: () => [submit],
    querySelector: () => submit
  };
  const errors = [];
  const dialog = { open: true, querySelector: () => form, close() { this.open = false; } };
  const sandbox = {
    AbortController,
    URLSearchParams,
    JSON,
    Error,
    DOMException,
    dialog,
    state: { csrf: 'local-csrf', user: { role: 'OWNER' } },
    modalPayloadForms: new WeakMap(),
    fetch: fetchImpl,
    setFormError: (targetForm, message) => { errors.push(message); const control = targetForm.querySelector('button'); control.type = 'button'; control.textContent = 'Close and retry'; },
    renderLogin() {},
    setTimeout: timeout ? callback => { queueMicrotask(callback); return 1; } : setTimeout,
    clearTimeout: timeout ? () => {} : clearTimeout
  };
  vm.runInNewContext(busySource, sandbox);
  sandbox.setFormBusy = vm.runInNewContext(`(${busySource})`, sandbox);
  const api = vm.runInNewContext(`${apiSource}\napi`, sandbox);
  return { api, dialog, form, submit, errors, setFormBusy: sandbox.setFormBusy };
}

test('submit button stays pending until a successful request completes', async () => {
  let finishFetch;
  const harness = createHarness(() => new Promise(resolve => { finishFetch = resolve; }));
  harness.setFormBusy(harness.form, true);
  const pending = harness.api('/api/example', { method: 'POST', body: {} });
  assert.equal(harness.submit.disabled, true);
  assert.equal(harness.submit.textContent, 'Saving…');
  finishFetch(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.deepEqual(await pending, { ok: true });
  assert.equal(harness.submit.disabled, false);
  assert.equal(harness.submit.textContent, 'Save');
  assert.equal(harness.dialog.open, false);
});

test('HTTP, invalid JSON, and network failures show specific errors and clear loading', async t => {
  const cases = [
    ['HTTP error', async () => new Response('{"error":"Branch does not belong to course."}', { status: 400 }), 'Branch does not belong to course.'],
    ['invalid JSON', async () => new Response('<html>oops</html>', { status: 200 }), 'invalid response'],
    ['network failure', async () => { throw new TypeError('offline'); }, 'Could not reach the server']
  ];
  for (const [name, fetchImpl, message] of cases) await t.test(name, async () => {
    const harness = createHarness(fetchImpl);
    await assert.rejects(harness.api('/api/example', { method: 'POST', body: {} }), error => error.message.includes(message));
    assert.equal(harness.submit.disabled, false);
    assert.equal(harness.submit.textContent, 'Close and retry');
    assert.equal(harness.errors.length, 1);
  });
});

test('timed out requests clear loading and report the timeout', async () => {
  const harness = createHarness((_path, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }), { timeout: true });
  await assert.rejects(harness.api('/api/example', { method: 'POST', body: {} }), error => error.message.includes('timed out'));
  assert.equal(harness.submit.disabled, false);
  assert.equal(harness.errors.length, 1);
});

test('a timeout while reading the response body is also reported as a timeout', async () => {
  const harness = createHarness(async (_path, options) => ({
    ok: true,
    status: 200,
    text: () => new Promise((resolve, reject) => {
      if (options.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })
  }), { timeout: true });
  await assert.rejects(harness.api('/api/example', { method: 'POST', body: {} }), error => error.message.includes('timed out'));
  assert.equal(harness.submit.disabled, false);
  assert.equal(harness.errors.length, 1);
});
