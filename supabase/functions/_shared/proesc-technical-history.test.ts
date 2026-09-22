import { deepStrictEqual as assertEquals } from 'node:assert/strict';
import { encodeTechnicalArchive, sha256 } from '../proesc-technical-history-archive/codec.ts';
import { readProescTechnicalHistory, type TechnicalHistoryAdmin } from './proesc-technical-history.ts';
import { ProescError } from '../proesc-api/contract.ts';

async function assertRejects(work: () => Promise<unknown>, expected: typeof ProescError) {
  try { await work(); } catch (error) {
    if (!(error instanceof expected)) throw error;
    return error;
  }
  throw new Error('Expected rejection');
}

const actor = '11111111-1111-4111-8111-111111111111';
const run = '22222222-2222-4222-8222-222222222222';
const batch = '33333333-3333-4333-8333-333333333333';
const polo = '44444444-4444-4444-8444-444444444444';
const result = (poloId: string | null = null) => ({
  runId: run, poloId, items: [{ run_id: run, polo_id: polo }], http: [], reusedCounts: [],
});

async function fixture(onlyReused = false) {
  const reusedCounts = onlyReused ? [{ run_id: run, polo_id: polo, class_id: actor,
    reused_count: 20, first_checked_at: '2026-09-21T01:00:00Z', last_checked_at: '2026-09-21T01:00:20Z' }] : [];
  const payloadText = JSON.stringify({ formatVersion: 1, kind: 'proesc-technical-history',
    runs: [{ runId: run, items: onlyReused ? null : { run_id: run, row_count: 1, records: [{ polo_id: polo }] },
      http: null, reusedCounts }] });
  const payloadSha256 = await sha256(new TextEncoder().encode(payloadText));
  const encoded = await encodeTechnicalArchive({ batchId: batch, payloadText, payloadSha256, runCount: 1 });
  return { payloadText, reusedCounts, bytes: encoded.compressed, manifest: {
    status: 'COMMITTED', batchId: batch, formatVersion: 1, bucket: 'proesc-history',
    objectPath: encoded.objectPath, payloadSha256, compressedSha256: encoded.compressedSha256, runCount: 1,
  } };
}
function mock(
  responses: Array<{ data: unknown; error: unknown }>,
  bytes: Uint8Array = new Uint8Array(), downloadError: unknown = null,
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const downloads: string[] = [];
  const admin: TechnicalHistoryAdmin = {
    rpc(name, args) { calls.push({ name, args }); return Promise.resolve(responses.shift()!); },
    storage: { from(bucket) { return { download(path) {
      downloads.push(bucket + '/' + path);
      return Promise.resolve({ data: new Blob([Uint8Array.from(bytes)]), error: downloadError });
    } }; } },
  };
  return { admin, calls, downloads };
}

Deno.test('hot history needs one authorized SQL call and no archive access', async () => {
  const m = mock([{ data: result(), error: null }]);
  assertEquals(await readProescTechnicalHistory(m.admin, actor, { runId: run }), {
    ...result(), httpMetricsScope: 'GLOBAL_SHARED_WORKER',
  });
  assertEquals(m.downloads, []);
  assertEquals(m.calls[0].args, { p_actor_id: actor, p_run_id: run, p_polo_id: null, p_payload_text: null });
});

Deno.test('invalid run/scope never reaches privileged SQL', async () => {
  const m = mock([]);
  await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run, poloId: 'invalid' }), ProescError);
  assertEquals(m.calls.length, 0);
});

Deno.test('authorization failure occurs before any private Storage download', async () => {
  const m = mock([{ data: null, error: { code: '42501', details: 'private details' } }]);
  const error = await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run }), ProescError);
  assertEquals(error.status, 403);
  assertEquals(m.downloads, []);
  assertEquals(error.message.includes('private details'), false);
});

Deno.test('cold detail verifies bytes and reauthorizes through scoped SQL', async () => {
  const f = await fixture();
  const m = mock([{ data: { archive: f.manifest }, error: null }, { data: result(polo), error: null }], f.bytes);
  const output = await readProescTechnicalHistory(m.admin, actor, { runId: run, poloId: polo,
    actorId: 'forged', payloadText: 'ignored untrusted body' });
  assertEquals(output, { ...result(polo), httpMetricsScope: 'GLOBAL_SHARED_WORKER' });
  assertEquals(m.calls.length, 2);
  assertEquals(m.calls[1].args, {
    p_actor_id: actor, p_run_id: run, p_polo_id: polo, p_payload_text: f.payloadText,
  });
  assertEquals('archive' in output, false);
});

Deno.test('archived no-op totals stay aggregate and never fabricate new evidence items', async () => {
  const f = await fixture(true);
  const detail = { runId: run, poloId: polo, items: [], http: [], reusedCounts: f.reusedCounts };
  const m = mock([{ data: { archive: f.manifest }, error: null }, { data: detail, error: null }], f.bytes);
  const output = await readProescTechnicalHistory(m.admin, actor, { runId: run, poloId: polo });
  assertEquals(output.items, []);
  assertEquals(output.reusedCounts, f.reusedCounts);
  assertEquals(m.calls[1].args.p_payload_text, f.payloadText);
});

Deno.test('archive from another bucket/path is rejected without download', async () => {
  const f = await fixture();
  const m = mock([{ data: { archive: { ...f.manifest, objectPath: 'receipts/v1/wrong.json.gz' } }, error: null }]);
  await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run }), ProescError);
  assertEquals(m.downloads, []);
});

Deno.test('corrupt compressed archive cannot reach SQL hydration', async () => {
  const f = await fixture();
  const corrupted = f.bytes.slice(); corrupted[corrupted.length - 1] ^= 1;
  const m = mock([{ data: { archive: f.manifest }, error: null }], corrupted);
  await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run }), ProescError);
  assertEquals(m.calls.length, 1);
});

Deno.test('Storage failure fails closed without fabricating empty history', async () => {
  const f = await fixture();
  const m = mock([{ data: { archive: f.manifest }, error: null }], f.bytes, new Error('storage internal URL'));
  const error = await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run }), ProescError);
  assertEquals(error.status, 503);
  assertEquals(error.message.includes('storage internal URL'), false);
});

Deno.test('scope revoked during archive download prevents response', async () => {
  const f = await fixture();
  const m = mock([{ data: { archive: f.manifest }, error: null },
    { data: null, error: { code: '42501' } }], f.bytes);
  const error = await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run }), ProescError);
  assertEquals(error.status, 403);
  assertEquals(m.calls.length, 2);
});

Deno.test('SQL response identity mismatch is rejected', async () => {
  const m = mock([{ data: { ...result(), runId: batch }, error: null }]);
  await assertRejects(() => readProescTechnicalHistory(m.admin, actor, { runId: run }), ProescError);
});

Deno.test('bounded read expires stalled SQL without indefinite Edge execution', async () => {
  const admin: TechnicalHistoryAdmin = { rpc() { return new Promise(() => undefined); } };
  const error = await assertRejects(
    () => readProescTechnicalHistory(admin, actor, { runId: run }, { timeoutMs: 1 }), ProescError,
  );
  assertEquals(error.status, 503);
});
