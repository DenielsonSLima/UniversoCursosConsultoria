import type { ArchiveAdmin } from '../proesc-history-archive/worker.ts';
import { ArchiveError, sha256 } from './codec.ts';

export function assert(ok: unknown, message = 'Assertion failed'): asserts ok { if (!ok) throw new Error(message); }
export async function rejects(run: () => Promise<unknown>, code: string) {
  try { await run(); } catch (error) { assert(error instanceof ArchiveError && error.code === code, String(error)); return; }
  throw new Error(`Expected ${code}`);
}
export const runId = '22222222-2222-4222-8222-222222222222';
export const poloId = '44444444-4444-4444-8444-444444444444';
export const classId = '55555555-5555-4555-8555-555555555555';
export const makeDocument = (reusedOnly = false) => ({
  formatVersion: 1, kind: 'proesc-technical-history', runs: [{ runId,
    items: reusedOnly ? null : { run_id: runId, row_count: 1,
      records: [{ result: 'UNCHANGED', recorded_at: '2026-01-01T10:00:00Z' }],
      polo_ids: [poloId], original_snapshot_ids: [], scoped_counts: [], error_records: [],
      content_sha256: 'c'.repeat(64), packed_at: '2026-01-02T10:00:00Z' },
    http: { run_id: runId, row_count: 1, records: [{ http_status: 200, duration_ms: 37 }],
      content_sha256: 'd'.repeat(64), packed_at: '2026-01-02T10:00:00Z' },
    reusedCounts: reusedOnly ? [{ run_id: runId, polo_id: poloId, class_id: classId, reused_count: 60,
      first_checked_at: '2026-01-01T10:00:00Z', last_checked_at: '2026-01-01T10:00:30Z' }] : [],
  }],
});

export async function fixture(reusedOnly = false) {
  const batchId = '11111111-1111-4111-8111-111111111111';
  const payloadText = JSON.stringify(makeDocument(reusedOnly));
  const payloadSha256 = await sha256(new TextEncoder().encode(payloadText));
  const source = { status: 'PREPARED', batchId, leaseToken: '33333333-3333-4333-8333-333333333333',
    formatVersion: 1, bucket: 'proesc-history', objectPath: `technical/v1/${batchId}.json.gz`, payloadText, payloadSha256, runCount: 1 };
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const state = { object: null as Uint8Array | null, unavailable: false, public: false,
    commitError: '', batchStatus: 'PREPARED', denyAuth: false, empty: false, oversizedAbove: 25,
    restoreFailure: false, commitCount: 1, committed: false };
  const admin: ArchiveAdmin = {
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'proesc_sync_runtime_service') return Promise.resolve({
        data: state.denyAuth ? null : { actorId: poloId }, error: state.denyAuth ? { code: '42501' } : null,
      });
      if (name === 'proesc_prepare_technical_archive_service') return Promise.resolve(
        Number(args.p_limit) > state.oversizedAbove ? { data: null, error: { code: '54000' } }
          : { data: state.empty ? { status: 'EMPTY' } : source, error: null });
      if (name === 'proesc_technical_archive_state_service') {
        if (args.p_abort) state.batchStatus = 'ABORTED';
        return Promise.resolve({ data: { ...source, status: state.batchStatus }, error: null });
      }
      if (name === 'proesc_restore_technical_archive_service') return Promise.resolve({
        data: state.restoreFailure ? null : { restored: true, runId: args.p_run_id },
        error: state.restoreFailure ? { secret: 'never-return-me' } : null,
      });
      assert(name === 'proesc_commit_technical_archive_service');
      state.committed = !state.commitError;
      return Promise.resolve({ data: { status: 'COMMITTED', runCount: 1, archivedRuns: state.commitCount },
        error: state.commitError ? { secret: 'never-return-me', code: state.commitError } : null });
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
            error: state.unavailable ? { secret: 'never-return-me' } : null });
        },
      }),
    },
  };
  return { source, state, calls, admin };
}
