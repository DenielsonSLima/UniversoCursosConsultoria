import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSupabasePrivateStore } from './supabase-store.mjs';
import { CONFIG, mockStorage } from './storage-http-fixture.mjs';

const bytes = Buffer.from('synthetic fixture');
const name = `synthetic-batch.${createHash('sha256').update(bytes).digest('hex')}.jsonl.gz`;
const body = (value, status = 200, headers) => new Response(JSON.stringify(value), { status, headers });

test('adapter is disabled by default before any credential or HTTP access', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore({ ...CONFIG, enabled: undefined }, mock);
  await assert.rejects(remote.putImmutable(name, bytes), { code: 'DISABLED' });
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.credentialCalls.length, 0);
  assert.equal(remote.cleanupEnabled, false);
  assert.equal('delete' in remote, false);
  assert.equal('createBucket' in remote, false);
});

test('requires injected transport and explicit strict destination, rejecting URL injection', () => {
  assert.throws(() => createSupabasePrivateStore(CONFIG), { code: 'DEPENDENCIES_REQUIRED' });
  for (const changed of [{ projectRef: 'https://evil.invalid' }, { bucket: '../public' },
    { namespace: 'archive/other' }, { tenantId: 'x?token=x' }, { baseUrl: 'https://evil.invalid' },
    { maxObjectBytes: 7 * 1024 * 1024 }, { enabled: 'true' }]) {
    assert.throws(() => createSupabasePrivateStore({ ...CONFIG, ...changed }, mockStorage()));
  }
});

test('private upload and authenticated readback use exact scoped path, no overwrite', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore(CONFIG, mock);
  assert.deepEqual(await remote.putImmutable(name, bytes), { name, reused: false, verified: true });
  assert.deepEqual(await remote.putImmutable(name, bytes), { name, reused: true, verified: true });
  assert.equal(mock.objects.size, 1);
  assert.ok(mock.calls.every((call) => ['GET', 'POST'].includes(call.method)));
  assert.ok(mock.calls.every((call) => !/\/public\/|\/sign\//.test(call.pathname)));
  for (const { request } of mock.calls) {
    assert.equal(request.redirect, 'error');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-access-token-not-real');
    assert.equal(request.headers.apikey, 'synthetic-api-key-not-real');
  }
});

test('bucket must exist, match identity and be explicitly private before object calls', async () => {
  for (const bucket of [{ public: true }, { public: undefined }, { id: 'different' }, { type: 'ANALYTICS' }]) {
    const mock = mockStorage({ bucket });
    const remote = createSupabasePrivateStore(CONFIG, mock);
    await assert.rejects(remote.putImmutable(name, bytes), { code: 'PRIVATE_BUCKET_REQUIRED' });
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.objects.size, 0);
  }
  const mock = mockStorage({ intercept: () => body({ code: 'NoSuchBucket' }, 404) });
  await assert.rejects(createSupabasePrivateStore(CONFIG, mock).putImmutable(name, bytes), { code: 'BUCKET_CHECK_FAILED', status: 404 });
  assert.equal(mock.calls.length, 1);
});

test('per-bucket size and MIME limits are respected without changing settings', async () => {
  for (const bucket of [{ file_size_limit: 1 }, { allowed_mime_types: ['image/png'] }]) {
    const mock = mockStorage({ bucket });
    await assert.rejects(createSupabasePrivateStore(CONFIG, mock).putImmutable(name, bytes));
    assert.equal(mock.calls.length, 1);
  }
});

test('rejects traversal, foreign paths, oversized input and arbitrary filenames before HTTP', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore(CONFIG, mock);
  for (const path of [`../${name}`, `/other/${name}`, `other%2f${name}`, 'credentials.json', `${name}?token=x`]) {
    await assert.rejects(remote.putImmutable(path, bytes), { code: 'INVALID_OBJECT_NAME' });
  }
  await assert.rejects(remote.putImmutable(name, Buffer.alloc(6 * 1024 * 1024 + 1)), { code: 'INVALID_OBJECT_SIZE' });
  assert.equal(mock.calls.length, 0);
});

test('readback verifies actual bytes and rejects corruption on success or conflict', async () => {
  const mock = mockStorage();
  mock.objects.set(name, Buffer.from('different bytes'));
  await assert.rejects(createSupabasePrivateStore(CONFIG, mock).putImmutable(name, bytes), { code: 'IMMUTABLE_READBACK_MISMATCH' });
  assert.equal(mock.objects.get(name).toString(), 'different bytes');
  const broken = mockStorage({ intercept: (call) => call.method === 'GET' && call.pathname.includes('/object/')
    ? new Response(Buffer.from('corrupt')) : undefined });
  await assert.rejects(createSupabasePrivateStore(CONFIG, broken).putImmutable(name, bytes), { code: 'IMMUTABLE_READBACK_MISMATCH' });
});

test('denial/5xx is not retried or treated as already-existing data', async () => {
  for (const status of [400, 401, 403, 413, 429, 500, 503]) {
    const mock = mockStorage({ intercept: (call) => call.method === 'POST'
      ? body({ code: 'AccessDenied', message: 'synthetic-secret-in-server-error' }, status) : undefined });
    const error = await createSupabasePrivateStore(CONFIG, mock).putImmutable(name, bytes).catch((value) => value);
    assert.equal(error.code, 'UPLOAD_UNCONFIRMED');
    assert.equal(error.status, status);
    assert.ok(!String(error).includes('synthetic-secret'));
    assert.equal(mock.calls.filter((call) => call.method === 'POST').length, 1);
    assert.equal(mock.calls.filter((call) => call.pathname.includes('/object/') && call.method === 'GET').length, 0);
  }
});

test('ambiguous upload is unconfirmed, explicit retry verifies same bytes without overwrite', async () => {
  let interrupted = false;
  const mock = mockStorage({ intercept: (call, state) => {
    if (call.method === 'POST' && !interrupted) {
      interrupted = true;
      state.objects.set(name, Buffer.from(call.request.body));
      throw new Error('Simulated lost response; synthetic-api-key-not-real');
    }
  } });
  const remote = createSupabasePrivateStore(CONFIG, mock);
  await assert.rejects(remote.putImmutable(name, bytes), { code: 'TRANSPORT_UNCONFIRMED' });
  assert.equal(mock.calls.filter((call) => call.method === 'POST').length, 1);
  assert.deepEqual(await remote.putImmutable(name, bytes), { name, reused: true, verified: true });
  assert.equal(mock.objects.size, 1);
});

test('legacy 400 duplicate is accepted only after matching byte readback', async () => {
  const mock = mockStorage({ intercept: (call) => call.method === 'POST' ? body({ error: 'Duplicate' }, 400) : undefined });
  mock.objects.set(name, Buffer.from(bytes));
  assert.equal((await createSupabasePrivateStore(CONFIG, mock).putImmutable(name, bytes)).reused, true);
});

test('redirects fail without forwarding credentials to another host', async () => {
  const mock = mockStorage({ intercept: () => new Response(null, {
    status: 307, headers: { location: 'https://evil.invalid/steal' },
  }) });
  await assert.rejects(createSupabasePrivateStore(CONFIG, mock).read(name, 100), { code: 'REDIRECT_REJECTED' });
  assert.equal(mock.calls.length, 1);
  assert.ok(mock.calls.every((call) => new URL(call.url).host === `${CONFIG.projectRef}.supabase.co`));
});

test('readback limit checks streamed bytes with missing or understated Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    const mock = mockStorage({ intercept: (call) => call.pathname.includes('/object/')
      ? new Response(Buffer.alloc(256), { headers }) : undefined });
    await assert.rejects(createSupabasePrivateStore(CONFIG, mock).read(name, 32), { code: 'RESPONSE_TOO_LARGE' });
  }
});

test('oversized Content-Length is rejected without trusting a smaller body', async () => {
  const mock = mockStorage({ intercept: (call) => call.pathname.includes('/object/')
    ? new Response('tiny', { headers: { 'content-length': '99999' } }) : undefined });
  await assert.rejects(createSupabasePrivateStore(CONFIG, mock).read(name, 32), { code: 'RESPONSE_TOO_LARGE' });
});

test('timeout is bounded and never repeats a request', async () => {
  const mock = mockStorage({ intercept: () => new Promise(() => {}) });
  await assert.rejects(createSupabasePrivateStore({ ...CONFIG, timeoutMs: 20 }, mock).read(name, 32), { code: 'REQUEST_TIMEOUT' });
  assert.equal(mock.calls.length, 1);
});

test('credential failures are sanitized and late resolution cannot start HTTP after timeout', async () => {
  const mock = mockStorage();
  const broken = { ...mock, credentials: async () => { throw new Error('synthetic-sensitive-value'); } };
  const error = await createSupabasePrivateStore(CONFIG, broken).read(name, 32).catch((value) => value);
  assert.equal(error.code, 'CREDENTIALS_UNAVAILABLE');
  assert.ok(!String(error).includes('synthetic-sensitive-value'));
  const late = { ...mock, credentials: async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { apiKey: 'synthetic-api', accessToken: 'synthetic-token' };
  } };
  await assert.rejects(createSupabasePrivateStore({ ...CONFIG, timeoutMs: 10 }, late).read(name, 32), { code: 'REQUEST_TIMEOUT' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(mock.calls.length, 0);
});

test('caller cannot mutate scope or payload bytes while bucket check is pending', async () => {
  const mock = mockStorage();
  const config = { ...CONFIG };
  const remote = createSupabasePrivateStore(config, mock);
  const input = Buffer.from(bytes);
  const pending = remote.putImmutable(name, input);
  input.fill(0);
  config.bucket = 'other';
  await pending;
  assert.deepEqual(mock.objects.get(name), bytes);
  assert.equal(remote.scope.bucket, CONFIG.bucket);
});

test('private state is checked again if a bucket changes between operations', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore(CONFIG, mock);
  await remote.putImmutable(name, bytes);
  mock.bucket.public = true;
  await assert.rejects(remote.read(name, 100), { code: 'PRIVATE_BUCKET_REQUIRED' });
});

test('configuration accessors cannot change validated origin or scope before credential use', () => {
  for (const field of ['projectRef', 'bucket', 'namespace', 'tenantId', 'enabled', 'timeoutMs', 'maxObjectBytes']) {
    const mock = mockStorage();
    const config = { ...CONFIG, timeoutMs: 100, maxObjectBytes: 1024 };
    let reads = 0;
    Object.defineProperty(config, field, { enumerable: true, get() {
      reads += 1;
      return reads <= 2 ? CONFIG[field] : 'evil.invalid/#';
    } });
    assert.throws(() => createSupabasePrivateStore(config, mock), { code: 'INVALID_CONFIGURATION' });
    assert.equal(reads, 0);
    assert.equal(mock.calls.length, 0);
    assert.equal(mock.credentialCalls.length, 0);
  }
});

test('credentials are captured once, sanitized and never included in thrown errors', async () => {
  const mock = mockStorage();
  let apiReads = 0;
  let tokenReads = 0;
  const credentials = async () => ({
    get apiKey() { apiReads += 1; return apiReads === 1 ? 'synthetic-api' : 'unsafe\r\nheader'; },
    get accessToken() { tokenReads += 1; return tokenReads === 1 ? 'synthetic-token' : 'unsafe\r\nheader'; },
  });
  const remote = createSupabasePrivateStore(CONFIG, { ...mock, credentials });
  await assert.rejects(remote.read(name, 100), { code: 'INVALID_CREDENTIALS' });
  // First request uses one valid snapshot. A separate request refuses the changed values.
  assert.equal(mock.calls.length, 1);
  assert.equal(apiReads, 2);
  assert.equal(tokenReads, 2);
  assert.equal(mock.calls[0].request.headers.apikey, 'synthetic-api');
  const throwing = async () => ({ get apiKey() { throw new Error('synthetic-sensitive-error'); } });
  const error = await createSupabasePrivateStore(CONFIG, { ...mock, credentials: throwing }).read(name, 100).catch((value) => value);
  assert.equal(error.code, 'CREDENTIALS_UNAVAILABLE');
  assert.ok(!String(error).includes('synthetic-sensitive-error'));
});

test('adapter alone requires the object filename digest to match bytes before credentials or HTTP', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore(CONFIG, mock);
  for (const extension of ['jsonl.gz', 'manifest.json.gz']) {
    await assert.rejects(remote.putImmutable(`synthetic-batch.${'0'.repeat(64)}.${extension}`, bytes), {
      code: 'OBJECT_NAME_HASH_MISMATCH',
    });
  }
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.credentialCalls.length, 0);
  assert.equal(mock.objects.size, 0);
});

test('gzip-only contract refuses plain manifests and defaults to a 4 MiB object ceiling', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore({ ...CONFIG, maxObjectBytes: undefined }, mock);
  assert.equal(remote.maxObjectBytes, 4 * 1024 * 1024);
  await assert.rejects(remote.putImmutable(name.replace('.jsonl.gz', '.manifest.json'), bytes), {
    code: 'INVALID_OBJECT_NAME',
  });
  await assert.rejects(remote.putImmutable(name, Buffer.alloc(4 * 1024 * 1024 + 1)), { code: 'INVALID_OBJECT_SIZE' });
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.credentialCalls.length, 0);
});

test('bucket 4 MiB ceiling also blocks a caller-configured larger cap before POST', async () => {
  const mock = mockStorage();
  const remote = createSupabasePrivateStore({ ...CONFIG, maxObjectBytes: 6 * 1024 * 1024 }, mock);
  const large = Buffer.alloc(4 * 1024 * 1024 + 1);
  const largeName = `synthetic-batch.${createHash('sha256').update(large).digest('hex')}.jsonl.gz`;
  await assert.rejects(remote.putImmutable(largeName, large), { code: 'BUCKET_FILE_LIMIT' });
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].method, 'GET');
  assert.equal(mock.objects.size, 0);
});
