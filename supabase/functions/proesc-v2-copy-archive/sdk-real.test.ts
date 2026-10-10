import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { createV2CopyHandler } from './handler.mjs';
import { createV2CopySdkBridge } from './sdk-bridge.mjs';
import { backendFixture, ORIGIN, SERVICE_KEY, requestFor } from './backend-fixture.mjs';
import { BATCH, copyExportFixture, createV2CopyHttpFixture } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-fixture.mjs';
import { encodeV2Copy, decodeV2CopyManifest, decodeV2CopyPayload, sha256 } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-codec.mjs';

const services = (mock: ReturnType<typeof backendFixture>) => createV2CopySdkBridge({
  createClient, fetchImpl: mock.fetchImpl, serverUrl: ORIGIN, serviceRoleKey: SERVICE_KEY,
});

Deno.test('Deno + real Supabase 2.95.3 SDK sends only mocked authorized RPC/storage requests', async () => {
  const mock = backendFixture();
  const handler = createV2CopyHandler({ ...services(mock), enabled: true });
  const response = await handler(requestFor());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'COPY_RECEIPT_RECORDED');
  assert.equal(result.receipt.batchId, BATCH);
  assert.equal(result.receipt.copyOnly, true);
  assert.equal(result.restoreVerified, true);
  assert.equal(mock.objects.size, 2);
  assert.deepEqual(mock.rpcCalls.map((c: { name: string }) => c.name), [
    'proesc_v2_worker_service', 'proesc_v2_export_copy_service', 'proesc_v2_record_copy_receipt_service',
  ]);
  for (const call of mock.rpcCalls) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('apikey'), SERVICE_KEY);
    assert.equal(headers.get('authorization'), `Bearer ${SERVICE_KEY}`);
    assert.equal(call.init.redirect, 'error');
    assert.ok(call.init.signal instanceof AbortSignal);
  }
  const replay = await handler(requestFor());
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).receipt, result.receipt);
  assert.equal(mock.objects.size, 2);
});

Deno.test('real SDK auth failure and ambiguous catalog never report success or retry automatically', async () => {
  for (const phase of ['proesc_v2_worker_service', 'proesc_v2_record_copy_receipt_service']) {
    const mock = backendFixture({ intercept: (call: { name: string }) => call.name === phase
      ? new Response(JSON.stringify({ message: 'synthetic-error' }), { status: 503, headers: { 'content-type': 'application/json' } }) : undefined });
    const response = await createV2CopyHandler({ ...services(mock), enabled: true })(requestFor());
    assert.equal(response.status, phase === 'proesc_v2_worker_service' ? 403 : 409);
    assert.equal(mock.rpcCalls.filter((c: { name: string }) => c.name === phase).length, 1);
    assert.ok(!(await response.text()).includes('synthetic-error'));
    if (phase === 'proesc_v2_worker_service') assert.equal(mock.calls.length, 0);
  }
});

Deno.test('real SDK abortSignal and global deadline prevent late export from advancing to Storage', async () => {
  const mock = backendFixture({ intercept: async (call: { name: string }) => {
    if (call.name === 'proesc_v2_export_copy_service') {
      await new Promise((resolve) => setTimeout(resolve, 300)); return new Response('{}');
    }
  } });
  const response = await createV2CopyHandler({ ...services(mock), enabled: true, deadlineMs: 200 })(requestFor());
  assert.equal(response.status, 504);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(mock.calls.length, 0);
  assert.ok(mock.rpcCalls.every((c: { init: { signal: AbortSignal } }) => c.init.signal.aborted));
  assert.equal(mock.catalog, undefined);
});

Deno.test('Deno node:zlib enforces manifest and payload maxOutputLength on compression bombs', async () => {
  const remote = createV2CopyHttpFixture().remote;
  const bundle = await encodeV2Copy(copyExportFixture(), BATCH, remote.scope);
  const manifest = await decodeV2CopyManifest(bundle.manifestCompressed, bundle.receipt);
  const manifestBomb = gzipSync(Buffer.alloc(131072));
  await assert.rejects(decodeV2CopyManifest(manifestBomb, { ...bundle.receipt,
    manifestJsonBytes: 65536, manifestCompressedBytes: manifestBomb.length,
    manifestCompressedSha256: sha256(manifestBomb),
    manifestObjectName: `${BATCH}.${sha256(manifestBomb)}.manifest.json.gz`,
  }), { code: 'ERR_BUFFER_TOO_LARGE' });
  const payloadBomb = gzipSync(Buffer.alloc(2097152));
  await assert.rejects(decodeV2CopyPayload(payloadBomb, { ...manifest,
    rawBytes: 1048576, compressedBytes: payloadBomb.length, compressedSha256: sha256(payloadBomb),
    objectName: `${BATCH}.${sha256(payloadBomb)}.jsonl.gz`,
  }), { code: 'ERR_BUFFER_TOO_LARGE' });
  const compressed = Buffer.from(bundle.compressed);
  const pending = decodeV2CopyPayload(compressed, manifest); compressed.fill(0);
  assert.equal((await pending).toString(), copyExportFixture().payloadText);
});

Deno.test('AbortSignal.any reaches mocked Storage and prevents catalog after global expiry', async () => {
  let storageSignal: AbortSignal | undefined;
  const mock = backendFixture({ storage: { intercept: async (call: { request: { signal: AbortSignal } }) => {
    storageSignal = call.request.signal;
    await new Promise((resolve) => setTimeout(resolve, 300)); return new Response('{}');
  } } });
  const response = await createV2CopyHandler({ ...services(mock), enabled: true, deadlineMs: 200 })(requestFor());
  assert.equal(response.status, 504);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(storageSignal?.aborted, true);
  assert.equal(mock.catalog, undefined);
});

Deno.test('real SDK flow cannot record a receipt if fresh restore GET differs after successful readbacks', async () => {
  let payloadReads = 0;
  const mock = backendFixture({ storage: { intercept: (call: { method: string; pathname: string }) => {
    if (call.method === 'GET' && call.pathname.endsWith('.jsonl.gz') && ++payloadReads === 2) return new Response('corrupt');
  } } });
  const response = await createV2CopyHandler({ ...services(mock), enabled: true })(requestFor());
  assert.equal(response.status, 409);
  assert.equal(payloadReads, 2);
  assert.equal(mock.objects.size, 2);
  assert.equal(mock.catalog, undefined);
  assert.equal(mock.rpcCalls.some((call: { name: string }) => call.name === 'proesc_v2_record_copy_receipt_service'), false);
});
