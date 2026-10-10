import test from 'node:test';
import assert from 'node:assert/strict';
import { createV2CopyHandler } from './handler.mjs';
import { createV2CopySdkBridge } from './sdk-bridge.mjs';
import { backendFixture, fakeCreateClient, ORIGIN, SERVICE_KEY, SECRET, requestFor } from './backend-fixture.mjs';
import { BATCH } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-fixture.mjs';

const bridgeFor = (mock, changes = {}) => createV2CopySdkBridge({ createClient: fakeCreateClient,
  fetchImpl: mock.fetchImpl, serverUrl: ORIGIN, serviceRoleKey: SERVICE_KEY, ...changes });
const configured = (mock, options = {}) => createV2CopyHandler({ ...bridgeFor(mock), enabled: true, ...options });

test('handler defaults OFF and refuses non-POST without backend work', async () => {
  assert.equal((await createV2CopyHandler()(requestFor())).status, 503);
  assert.equal((await createV2CopyHandler()(new Request('https://handler.invalid/'))).status, 405);
  assert.throws(() => createV2CopyHandler({ enabled: true }));
  assert.throws(() => createV2CopyHandler({ deadlineMs: 80001 }));
});

test('custom secret authentication precedes export and response only includes sanitized receipt/status', async () => {
  const mock = backendFixture(), handler = configured(mock);
  const missing = new Request('https://handler.invalid/', { method: 'POST', body: '{}' });
  assert.equal((await handler(missing)).status, 403);
  assert.equal(mock.rpcCalls.length, 0);
  const response = await handler(requestFor());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  const text = await response.text(), result = JSON.parse(text);
  assert.deepEqual(Object.keys(result).sort(), ['receipt', 'restoreVerified', 'status']);
  assert.equal(result.status, 'COPY_RECEIPT_RECORDED');
  assert.equal(result.receipt.batchId, BATCH);
  assert.equal(result.restoreVerified, true);
  assert.ok(!text.includes(SECRET) && !text.includes(SERVICE_KEY) && !text.includes('normalizedJson') && !text.includes('payloadText'));
  assert.deepEqual(mock.rpcCalls.map((c) => c.name), ['proesc_v2_worker_service', 'proesc_v2_export_copy_service', 'proesc_v2_record_copy_receipt_service']);
  assert.ok(mock.rpcCalls.every((c) => c.init.signal instanceof AbortSignal && c.init.redirect === 'error'));
});

test('well-formed but unauthorized secret never exports or contacts Storage', async () => {
  const mock = backendFixture();
  assert.equal((await configured(mock)(requestFor(undefined, { 'X-Proesc-Sync-Secret': 'b'.repeat(64) }))).status, 403);
  assert.equal(mock.rpcCalls.length, 1); assert.equal(mock.calls.length, 0);
});

test('body accepts only one literal batchId UUID and enforces actual 256-byte stream cap', async () => {
  for (const body of ['{}', 'null', '{"batchId":"no"}', JSON.stringify({ batchId: BATCH, unitId: '3145' }),
    `{"batchId":"${BATCH}","batchId":"${BATCH}"}`, 'x'.repeat(257)]) {
    const mock = backendFixture(), response = await configured(mock)(requestFor(body));
    assert.ok([400, 413].includes(response.status));
    assert.equal(mock.rpcCalls.length, 1); assert.equal(mock.calls.length, 0);
  }
  const mock = backendFixture();
  assert.equal((await configured(mock)(requestFor('x'.repeat(257), { 'content-length': '1' }))).status, 413);
  assert.equal((await configured(mock)(requestFor(undefined, { 'content-length': '9999' }))).status, 413);
  assert.equal((await configured(mock)(requestFor(undefined, { 'content-type': 'text/plain' }))).status, 415);
});

test('invalid source destination or non-approved batch cannot construct a Storage adapter', async () => {
  for (const changed of [{ projectRef: 'bbbbbbbbbbbbbbbbbbbb' }, { bucket: 'public' }, { namespace: 'other' },
    { tenantId: '../other' }, { batchId: 'other' }]) {
    const mock = backendFixture(); Object.assign(mock.source, changed);
    assert.equal((await configured(mock)(requestFor())).status, 409);
    assert.equal(mock.calls.length, 0); assert.equal(mock.credentialCalls.length, 0);
    assert.equal(mock.rpcCalls.length, 2);
  }
  const mock = backendFixture();
  const other = '00000000-0000-0000-0000-000000000999';
  assert.equal((await configured(mock)(requestFor(JSON.stringify({ batchId: other })))).status, 409);
  assert.equal(mock.calls.length, 0);
});

test('fixed backend origin rejects URL overrides and config accessors before SDK construction', () => {
  for (const serverUrl of ['https://evil.invalid', `${ORIGIN}/other`, `${ORIGIN}?token=x`, `https://x@${new URL(ORIGIN).hostname}`]) {
    assert.throws(() => bridgeFor(backendFixture(), { serverUrl }));
  }
  let reads = 0;
  const options = { createClient: fakeCreateClient, fetchImpl: async () => {}, serviceRoleKey: SERVICE_KEY };
  Object.defineProperty(options, 'serverUrl', { enumerable: true, get() { reads++; return ORIGIN; } });
  assert.throws(() => createV2CopySdkBridge(options)); assert.equal(reads, 0);
});

test('redirects, SDK failures and raw backend errors are sanitized with no export retry', async () => {
  for (const kind of ['redirect', 'error', 'throw']) {
    const mock = backendFixture({ intercept: () => {
      if (kind === 'redirect') return new Response(null, { status: 307, headers: { location: 'https://evil.invalid' } });
      if (kind === 'error') return new Response('synthetic-secret-body', { status: 500 });
      throw new Error('synthetic-secret-exception');
    } });
    const response = await configured(mock)(requestFor());
    assert.equal(response.status, 403);
    assert.ok(!(await response.text()).includes('synthetic-secret'));
    assert.equal(mock.rpcCalls.length, 1); assert.equal(mock.calls.length, 0);
  }
});

test('HTTP corruption cannot write a catalog receipt and catalog ambiguity does not return success', async () => {
  const corrupt = backendFixture({ storage: { intercept: (call) => call.method === 'GET' && call.pathname.endsWith('.jsonl.gz')
    ? new Response('corrupt') : undefined } });
  assert.equal((await configured(corrupt)(requestFor())).status, 409);
  assert.equal(corrupt.catalog, undefined);
  const ambiguous = backendFixture({ intercept: (call) => call.name.endsWith('record_copy_receipt_service')
    ? new Response('{}', { headers: { 'content-type': 'application/json' } }) : undefined });
  assert.equal((await configured(ambiguous)(requestFor())).status, 409);
  assert.equal(ambiguous.objects.size, 2);
});

test('global deadline covers stalled auth and export, with no later upload/catalog', async () => {
  for (const phase of ['proesc_v2_worker_service', 'proesc_v2_export_copy_service']) {
    const mock = backendFixture({ intercept: async (call) => {
      if (call.name === phase) { await new Promise((r) => setTimeout(r, 150)); return new Response('{}'); }
    } });
    const response = await configured(mock, { deadlineMs: 100 })(requestFor());
    assert.equal(response.status, 504);
    await new Promise((r) => setTimeout(r, 180));
    assert.equal(mock.calls.length, 0); assert.equal(mock.catalog, undefined);
    assert.ok(mock.rpcCalls.every((call) => call.init.signal.aborted));
  }
});

test('global deadline propagates into Storage and cannot advance late responses to catalog', async () => {
  let sawSignal;
  const mock = backendFixture({ storage: { intercept: async (call) => {
    sawSignal = call.request.signal;
    await new Promise((r) => setTimeout(r, 150)); return new Response('{}');
  } } });
  assert.equal((await configured(mock, { deadlineMs: 100 })(requestFor())).status, 504);
  await new Promise((r) => setTimeout(r, 180));
  assert.equal(sawSignal.aborted, true); assert.equal(mock.calls.length, 1); assert.equal(mock.catalog, undefined);
});

test('caller abort and stalled request body are bounded before export', async () => {
  const mock = backendFixture(), controller = new AbortController(); controller.abort();
  assert.equal((await configured(mock)(requestFor(undefined, {}, controller.signal))).status, 504);
  assert.equal(mock.rpcCalls.length, 0);
  const body = new ReadableStream({ start() {} });
  const request = new Request('https://handler.invalid/', { method: 'POST', body, duplex: 'half',
    headers: { 'content-type': 'application/json', 'X-Proesc-Sync-Secret': SECRET } });
  assert.equal((await configured(mock, { deadlineMs: 10 })(request)).status, 504);
  assert.equal(mock.rpcCalls.length, 1); assert.equal(mock.calls.length, 0);
});

test('RPC response body is capped by bytes read with missing Content-Length', async () => {
  const mock = backendFixture({ intercept: () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)) });
  assert.equal((await configured(mock)(requestFor())).status, 403);
  assert.equal(mock.rpcCalls.length, 1);
});

test('a corrupt independent restoration after valid upload readbacks prevents catalog recording', async () => {
  let payloadReads = 0;
  const mock = backendFixture({ storage: { intercept: (call) => {
    if (call.method === 'GET' && call.pathname.endsWith('.jsonl.gz') && ++payloadReads === 2) return new Response('corrupt');
  } } });
  const response = await configured(mock)(requestFor());
  assert.equal(response.status, 409); assert.equal(payloadReads, 2);
  assert.equal(mock.objects.size, 2); assert.equal(mock.catalog, undefined);
  assert.equal(mock.rpcCalls.some((call) => call.name === 'proesc_v2_record_copy_receipt_service'), false);
  assert.ok(!(await response.text()).includes('restoreVerified'));
});

test('SDK transport cannot redirect the credential to an unapproved RPC, host or Storage scope', async () => {
  const mock = backendFixture(); let sdkFetch;
  bridgeFor(mock, { createClient: (_url, _key, options) => { sdkFetch = options.global.fetch; return fakeCreateClient(_url, _key, options); } });
  for (const url of ['https://evil.invalid/rest/v1/rpc/proesc_v2_worker_service', `${ORIGIN}/rest/v1/rpc/other`,
    `${ORIGIN}/storage/v1/bucket/other`, `${ORIGIN}/storage/v1/bucket/proesc-history`, `${ORIGIN}/auth/v1/user`]) {
    await assert.rejects(sdkFetch(url, { method: 'POST', signal: new AbortController().signal }));
  }
  assert.equal(mock.rpcCalls.length, 0); assert.equal(mock.calls.length, 0);
});

test('global deadline during catalog recording stays unconfirmed after a verified restore', async () => {
  let recordSignal;
  const mock = backendFixture({ intercept: async (call) => {
    if (call.name === 'proesc_v2_record_copy_receipt_service') {
      recordSignal = call.init.signal;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return new Response(JSON.stringify({ batchId: BATCH, status: 'COPY_RECEIPT_RECORDED', copyOnly: true }));
    }
  } });
  const response = await configured(mock, { deadlineMs: 100 })(requestFor());
  assert.equal(response.status, 504); assert.equal(mock.objects.size, 2);
  assert.ok(!(await response.text()).includes('restoreVerified'));
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(recordSignal.aborted, true);
  assert.equal(mock.rpcCalls.filter((call) => call.name === 'proesc_v2_record_copy_receipt_service').length, 1);
});

test('isolated memory restore caps bytes and never aliases caller-owned buffers', async () => {
  const { createMemoryRestoreStore } = await import('./memory-restore.mjs');
  const { Buffer } = await import('node:buffer');
  const store = createMemoryRestoreStore(), input = Buffer.from('fixture');
  await store.putImmutable('restored.json', input); input.fill(0);
  const restored = await store.read('restored.json', 100);
  assert.equal(restored.toString(), 'fixture'); restored.fill(0);
  assert.equal((await store.read('restored.json', 100)).toString(), 'fixture');
  await assert.rejects(store.putImmutable('other.json', Buffer.from('fixture')));
  await assert.rejects(store.putImmutable('restored.json', Buffer.alloc(1048577)));
  await assert.rejects(store.putImmutable('restored.json', Buffer.from('different')));
});
