import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCopyFixture } from './fixtures/proesc-v2-copy.fixture.mjs';
import { createSupabasePrivateStore } from '../review-drafts/proesc-v2-growth/archive/supabase-store.mjs';
import { runV2CopyBatch } from '../review-drafts/proesc-v2-growth/archive/v2-copy-worker.mjs';
import { restoreV2Copy } from '../review-drafts/proesc-v2-growth/archive/v2-copy-transfer.mjs';
import { createV2CopyRestoreStore } from '../review-drafts/proesc-v2-growth/archive/v2-copy-local-store.mjs';

// Pure in-memory transport. Even the production-shaped project reference never makes a network request.
function storage(source) {
  const objects = new Map(), calls = [];
  const config = { projectRef: source.projectRef, bucket: source.bucket, namespace: source.namespace,
    tenantId: source.tenantId, enabled: true, maxObjectBytes: 4194304 };
  const prefix = `/storage/v1/object/${config.bucket}/${config.namespace}/${config.tenantId}/`;
  const state = { corruptReadback: false };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const transport = async (url, request) => {
    const target = new URL(url); calls.push({ method: request.method, path: target.pathname });
    assert.equal(target.origin, `https://${config.projectRef}.supabase.co`);
    assert.equal(request.redirect, 'error');
    if (target.pathname === `/storage/v1/bucket/${config.bucket}` && request.method === 'GET') {
      return json({ id: config.bucket, public: false, type: 'STANDARD', file_size_limit: 4194304,
        allowed_mime_types: ['application/gzip'] });
    }
    assert.ok(target.pathname.startsWith(prefix));
    const name = target.pathname.slice(prefix.length);
    if (request.method === 'POST') {
      assert.equal(request.headers['x-upsert'], 'false'); assert.equal(request.headers['content-type'], 'application/gzip');
      if (objects.has(name)) return json({ code: 'ResourceAlreadyExists' }, 409);
      objects.set(name, Buffer.from(request.body));
      return json({ Key: `${config.bucket}/${config.namespace}/${config.tenantId}/${name}` });
    }
    assert.equal(request.method, 'GET');
    return objects.has(name) ? new Response(state.corruptReadback ? Buffer.from('synthetic corruption') : objects.get(name))
      : json({ code: 'NoSuchKey' }, 404);
  };
  const credentials = async () => ({ apiKey: 'synthetic-copy-api-key', accessToken: 'synthetic-copy-access-token' });
  return { remote: createSupabasePrivateStore(config, { transport, credentials }), objects, calls, state };
}

const f = await createCopyFixture();
const { db, id, run, observationIds, scalar } = f;
const prepare = (batch) => scalar('SELECT internal_proesc.v2_prepare_copy_archive($1,$2,$3,$4::uuid[]) value', [batch, run, '3145', observationIds]);
const exportBatch = (batch) => scalar('SELECT public.proesc_v2_export_copy_service($1) value', [batch]);
const recordReceipt = (batch, receipt) => scalar('SELECT public.proesc_v2_record_copy_receipt_service($1,$2::jsonb) value', [batch, JSON.stringify(receipt)]);
const receiptCount = (batch) => scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_receipts WHERE batch_id=$1', [batch]);
const fingerprint = () => scalar(`SELECT md5(jsonb_build_object(
  'observations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM internal_proesc.v2_invoice_observations o),
  'payloads',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM internal_proesc.v2_invoice_payloads p),
  'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM internal_proesc.financial_snapshots s),
  'receivables',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.contas_receber c))::text) value`);
let checks = 0;
try {
  const original = await fingerprint(), first = id(8000);
  await prepare(first); const source = await exportBatch(first); const mock = storage(source);
  const result = await runV2CopyBatch(first, { remote: mock.remote, exportBatch, recordReceipt });
  assert.equal(result.catalog.status, 'COPY_RECEIPT_RECORDED');
  assert.deepEqual(await scalar('SELECT receipt value FROM internal_proesc.v2_copy_archive_receipts WHERE batch_id=$1', [first]), result.receipt);
  assert.equal(mock.objects.size, 2); checks++;
  const target = await createV2CopyRestoreStore(await mkdtemp(join(tmpdir(), 'proesc-v2-copy-synthetic-')));
  const restored = await restoreV2Copy(mock.remote, result.receipt, target, 'restored.json');
  assert.equal(await readFile(join(target.root, restored.name), 'utf8'), source.payloadText);
  assert.match(source.payloadText, /9007199254740993/); assert.equal(await fingerprint(), original); checks++;
  assert.deepEqual(await runV2CopyBatch(first, { remote: mock.remote, exportBatch, recordReceipt }), result);
  assert.equal(await receiptCount(first), 1); assert.equal(mock.objects.size, 2); checks++;

  const second = id(8001); await prepare(second); const failing = storage(await exportBatch(second));
  failing.state.corruptReadback = true; let recordCalls = 0;
  const countedRecord = (...args) => { recordCalls++; return recordReceipt(...args); };
  await assert.rejects(runV2CopyBatch(second, { remote: failing.remote, exportBatch, recordReceipt: countedRecord }), /READBACK/);
  assert.equal(recordCalls, 0); assert.equal(await receiptCount(second), 0);
  assert.equal(failing.calls.filter((call) => call.method === 'POST' && call.path.endsWith('.manifest.json.gz')).length, 0); checks++;
  failing.state.corruptReadback = false;
  await runV2CopyBatch(second, { remote: failing.remote, exportBatch, recordReceipt: countedRecord });
  assert.equal(recordCalls, 1); assert.equal(await receiptCount(second), 1); checks++;

  const third = id(8002); await prepare(third); const uncertain = storage(await exportBatch(third));
  await assert.rejects(runV2CopyBatch(third, { remote: uncertain.remote, exportBatch, recordReceipt: async (...args) => {
    await recordReceipt(...args); throw new Error('Synthetic response lost after SQL commit');
  } }), { code: 'CATALOG_UNCONFIRMED' });
  assert.equal(await receiptCount(third), 1);
  await runV2CopyBatch(third, { remote: uncertain.remote, exportBatch, recordReceipt });
  assert.equal(await receiptCount(third), 1); assert.equal(uncertain.objects.size, 2); checks++;

  const callsBefore = mock.calls.length;
  await assert.rejects(runV2CopyBatch(id(8999), { remote: mock.remote, exportBatch, recordReceipt }), { code: 'EXPORT_UNCONFIRMED' });
  assert.equal(mock.calls.length, callsBefore); assert.equal(await fingerprint(), original); checks++;
  console.log(JSON.stringify({ result: 'PASS', checks, scope: 'Actual isolated SQL + in-memory HTTP + local synthetic restore; no production calls' }));
} finally { await db.close(); }
