import { ArchiveError, encodeArchive, sha256 } from './codec.ts';
import { archiveOneBatch, type ArchiveAdmin } from './worker.ts';
import { createArchiveHandler } from './handler.ts';

function assert(ok: unknown, message = 'Assertion failed'): asserts ok { if (!ok) throw new Error(message); }
async function fixture() {
  const batchId = '11111111-1111-4111-8111-111111111111';
  const payloadText = '{"formatVersion": 1, "rows": [{"request_id": "22222222-2222-4222-8222-222222222222", "response": {"result": "UNCHANGED"}}]}';
  const payloadSha256 = await sha256(new TextEncoder().encode(payloadText));
  const source = { status: 'PREPARED', batchId, leaseToken: '33333333-3333-4333-8333-333333333333',
    formatVersion: 1, bucket: 'proesc-history', objectPath: `receipts/v1/${batchId}.json.gz`, payloadText, payloadSha256, rowCount: 1 };
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const state = { object: null as Uint8Array | null, unavailable: false, public: false,
    commitError: false, commitCode: '', batchStatus: 'PREPARED', denyAuth: false };
  const admin: ArchiveAdmin = {
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'proesc_sync_runtime_service') return Promise.resolve({
        data: state.denyAuth ? null : { actorId: '44444444-4444-4444-8444-444444444444' },
        error: state.denyAuth ? { code: '42501' } : null,
      });
      if (name === 'proesc_receipt_archive_status_service') return Promise.resolve({
        data: { ...source, status: state.batchStatus }, error: null,
      });
      if (name === 'proesc_abort_receipt_archive_service') return Promise.resolve({ data: { status: 'ABORTED' }, error: null });
      if (name === 'proesc_restore_receipt_archive_service') return Promise.resolve({
        data: { restored: true, requestId: args.p_request_id }, error: null,
      });
      return Promise.resolve(name === 'proesc_prepare_receipt_archive_service' ? { data: source, error: null }
        : { data: { status: 'COMMITTED', rowCount: 1, archivedCount: 1 },
          error: state.commitError ? { secret: 'do-not-log', code: state.commitCode } : null });
    },
    storage: {
      getBucket: () => Promise.resolve({ data: { public: state.public }, error: null }),
      createBucket: () => Promise.resolve({ error: null }),
      from: () => ({
        upload(_path, body, options) {
          assert(options.upsert === false); calls.push({ name: 'upload' });
          if (state.object) return Promise.resolve({ error: { statusCode: 409 } });
          state.object = body; return Promise.resolve({ error: null });
        },
        download() {
          calls.push({ name: 'download' });
          return Promise.resolve({ data: state.unavailable || !state.object ? null : new Blob([state.object as BlobPart]),
            error: state.unavailable ? { secret: 'do-not-log' } : null });
        },
      }),
    },
  };
  return { source, state, calls, admin };
}
async function rejects(run: () => Promise<unknown>, code: string) {
  try { await run(); } catch (error) { assert(error instanceof ArchiveError && error.code === code); return; }
  throw new Error(`Expected ${code}`);
}
Deno.test('archive commits only after Storage download and exact canonical roundtrip', async () => {
  const f = await fixture(); const result = await archiveOneBatch(f.admin, 1);
  assert(result.status === 'COMMITTED' && result.archivedCount === 1);
  assert(f.calls.map((call) => call.name).join(',') === 'proesc_prepare_receipt_archive_service,upload,download,proesc_commit_receipt_archive_service');
  assert(f.calls.at(-1)?.args?.p_verified_payload_text === f.source.payloadText);
  assert(!JSON.stringify(result).includes('request_id'));
});
Deno.test('retry verifies existing immutable object without replacing it', async () => {
  const f = await fixture();
  const encoded = await encodeArchive({ ...f.source, sha256: f.source.payloadSha256 });
  f.state.object = encoded.compressed;
  const original = f.state.object;
  await archiveOneBatch(f.admin);
  assert(f.state.object === original && f.calls.at(-1)?.name === 'proesc_commit_receipt_archive_service');
});
Deno.test('missing downloaded object keeps all database rows', async () => {
  const f = await fixture(); f.state.unavailable = true;
  await rejects(() => archiveOneBatch(f.admin), 'ARCHIVE_DOWNLOAD_FAILED');
  assert(!f.calls.some((call) => call.name.includes('commit')));
});
Deno.test('corrupt pre-existing object cannot be overwritten or committed', async () => {
  const f = await fixture(); f.state.object = new Uint8Array([1, 2, 3]);
  await rejects(() => archiveOneBatch(f.admin), 'ARCHIVE_INVALID_GZIP');
  assert(!f.calls.some((call) => call.name.includes('commit')));
});
Deno.test('public bucket is refused before selecting sensitive data', async () => {
  const f = await fixture(); f.state.public = true;
  await rejects(() => archiveOneBatch(f.admin), 'ARCHIVE_BUCKET_NOT_PRIVATE');
  assert(f.calls.length === 0);
});
Deno.test('archive worker rejects missing and user credentials before any work', async () => {
  const f = await fixture(); const handler = createArchiveHandler(f.admin);
  for (const token of ['', 'user-fixture', 'anon-fixture']) {
    const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { authorization: `Bearer ${token}` } }));
    assert(response.status === 403);
  }
  assert(f.calls.length === 0);
});
Deno.test('failed SQL secret authorization cannot select rows or access Storage', async () => {
  const f = await fixture(); f.state.denyAuth = true;
  const response = await createArchiveHandler(f.admin)(new Request('https://example.invalid', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) }, body: '{}',
  }));
  assert(response.status === 403 && f.calls.length === 1 && f.calls[0].name === 'proesc_sync_runtime_service');
});
Deno.test('worker failure exposes only a stable code, never backend details', async () => {
  const f = await fixture(); f.state.commitError = true;
  const response = await createArchiveHandler(f.admin)(new Request('https://example.invalid', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) }, body: '{"limit":1}',
  }));
  assert(response.status === 409 && await response.text() === '{"error":"ARCHIVE_COMMIT_FAILED"}');
});
Deno.test('confirmed serialization conflict abandons only a still prepared batch', async () => {
  const f = await fixture(); f.state.commitError = true; f.state.commitCode = '40001';
  await rejects(() => archiveOneBatch(f.admin), 'ARCHIVE_BATCH_RETRY_REQUIRED');
  assert(f.calls.at(-2)?.name === 'proesc_receipt_archive_status_service');
  assert(f.calls.at(-1)?.name === 'proesc_abort_receipt_archive_service');
  assert(f.state.object !== null);
});
Deno.test('already committed or ambiguous commit is never aborted', async () => {
  for (const code of ['40001', '57014', '']) {
    const f = await fixture(); f.state.commitError = true; f.state.commitCode = code; f.state.batchStatus = 'COMMITTED';
    await rejects(() => archiveOneBatch(f.admin), 'ARCHIVE_COMMIT_FAILED');
    assert(!f.calls.some((call) => call.name === 'proesc_abort_receipt_archive_service'));
  }
});
Deno.test('private one-row pilot restores only the verified downloaded receipt after commit', async () => {
  const f = await fixture(); const result = await archiveOneBatch(f.admin, 1, { verifyRestore: true });
  assert('restored' in result && result.restored === true);
  assert(f.calls.at(-2)?.name === 'proesc_commit_receipt_archive_service');
  assert(f.calls.at(-1)?.name === 'proesc_restore_receipt_archive_service');
  assert(f.calls.at(-1)?.args?.p_payload_text === f.source.payloadText);
  assert(!JSON.stringify(result).includes('request_id'));
});
Deno.test('restore pilot cannot run on multiple rows in handler or worker', async () => {
  const f = await fixture();
  await rejects(() => archiveOneBatch(f.admin, 2, { verifyRestore: true }), 'ARCHIVE_RESTORE_PROBE_REQUIRES_ONE_ROW');
  assert(f.calls.length === 0);
  const response = await createArchiveHandler(f.admin)(new Request('https://example.invalid', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) }, body: '{"limit":2,"verifyRestore":true}',
  }));
  assert(response.status === 400 && Number(f.calls.length) === 1 && f.calls[0].name === 'proesc_sync_runtime_service');
});
Deno.test('restore pilot refuses an older multi-row prepared batch before upload or commit', async () => {
  const f = await fixture(); f.source.rowCount = 2;
  await rejects(() => archiveOneBatch(f.admin, 1, { verifyRestore: true }), 'ARCHIVE_RESTORE_PROBE_REQUIRES_ONE_ROW');
  assert(f.calls.length === 1 && f.calls[0].name === 'proesc_prepare_receipt_archive_service');
});
