import { rpcWithArchiveReplay, type ArchiveReplayAdmin } from '../_shared/proesc-archive-replay.ts';
import { encodeArchive, sha256 } from './codec.ts';

function assert(ok: unknown, message = 'Assertion failed'): asserts ok { if (!ok) throw new Error(message); }
async function fixture() {
  const batchId = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const payloadText = '{"formatVersion": 1, "rows": [{"request_id": "22222222-2222-4222-8222-222222222222", "response": {"result": "UNCHANGED"}}]}';
  const hash = await sha256(new TextEncoder().encode(payloadText));
  const encoded = await encodeArchive({ batchId, payloadText, rowCount: 1, sha256: hash });
  const manifest = { batchId, requestId, bucket: 'proesc-history', objectPath: encoded.objectPath,
    payloadSha256: hash, compressedSha256: encoded.compressedSha256, rowCount: 1, formatVersion: 1 };
  const args = { p_actor_id: 'authorized-fixture', p_request_id: requestId, p_payload: { mode: 'AUTO' } };
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const state = { restored: false, missing: false, deny: false, rejectIntent: false, repeatCold: false };
  const admin: ArchiveReplayAdmin = {
    rpc(name, input) {
      calls.push({ name, args: input });
      if (name === 'proesc_restore_receipt_archive_service') {
        assert(input.p_payload_text === payloadText); state.restored = true;
        return Promise.resolve({ data: { restored: true, requestId }, error: null });
      }
      if (state.deny) return Promise.resolve({ data: null, error: { code: '42501' } });
      if (state.restored && !state.repeatCold) return Promise.resolve(state.rejectIntent
        ? { data: null, error: { code: '22023' } } : { data: { result: 'UNCHANGED', replayed: true }, error: null });
      return Promise.resolve({ data: null, error: { code: 'PZ001', details: JSON.stringify(manifest) } });
    },
    storage: { from: () => ({ download() {
      calls.push({ name: 'download' });
      return Promise.resolve({ data: state.missing ? null : new Blob([encoded.compressed as BlobPart]), error: null });
    } }) },
  };
  return { admin, args, calls, state, manifest };
}
const rpc = 'proesc_apply_financial_snapshot_service';
Deno.test('cold replay rehydrates once and reinvokes exact original SQL arguments', async () => {
  const f = await fixture(); const result = await rpcWithArchiveReplay(f.admin, rpc, f.args);
  assert((result.data as { replayed: boolean }).replayed === true);
  assert(f.calls.map((call) => call.name).join(',') === `${rpc},download,proesc_restore_receipt_archive_service,${rpc}`);
  assert(f.calls[0].args === f.args && f.calls.at(-1)?.args === f.args);
});
Deno.test('unauthorized original SQL never triggers archive reads', async () => {
  const f = await fixture(); f.state.deny = true;
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args);
  assert((result.error as { code: string }).code === '42501' && f.calls.length === 1);
});
Deno.test('missing archive fails closed without restore or another financial execution', async () => {
  const f = await fixture(); f.state.missing = true;
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args);
  assert((result.error as { code: string }).code === 'PZ002');
  assert(f.calls.length === 2 && !f.state.restored);
});
Deno.test('manifest request substitution is rejected before download', async () => {
  const f = await fixture(); f.manifest.requestId = '33333333-3333-4333-8333-333333333333';
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args);
  assert((result.error as { code: string }).code === 'PZ002' && f.calls.length === 1);
});
Deno.test('original SQL still rejects changed actor/action/payload after restoration', async () => {
  const f = await fixture(); f.state.rejectIntent = true;
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args);
  assert((result.error as { code: string }).code === '22023');
});
Deno.test('repeated cold marker stops after one recovery attempt', async () => {
  const f = await fixture(); f.state.repeatCold = true;
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args);
  assert((result.error as { code: string }).code === 'PZ002' && f.calls.length === 4);
});
Deno.test('worker deadline during download prevents restore and financial retry', async () => {
  const f = await fixture(); const controller = new AbortController();
  const storage = f.admin.storage!;
  f.admin.storage = { from: (bucket) => ({ download: async (path) => {
    const result = await storage.from(bucket).download(path); controller.abort(); return result;
  } }) };
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args, controller.signal);
  assert((result.error as { code: string }).code === 'PZ002' && f.calls.length === 2);
});
Deno.test('unresponsive Storage has its own bounded deadline without caller signal', async () => {
  const f = await fixture();
  f.admin.storage = { from: () => ({ download: () => new Promise(() => {}) }) };
  const result = await rpcWithArchiveReplay(f.admin, rpc, f.args, undefined, { archiveTimeoutMs: 5 });
  assert((result.error as { code: string }).code === 'PZ002' && f.calls.length === 1 && !f.state.restored);
});
