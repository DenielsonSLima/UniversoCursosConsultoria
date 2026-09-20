import { ArchiveError } from './codec.ts';
import { runArchiveDrain } from './drain.ts';
import type { ArchiveAdmin, archiveOneBatch } from './worker.ts';

function assert(ok: unknown, message = 'Assertion failed'): asserts ok { if (!ok) throw new Error(message); }
const admin = {} as ArchiveAdmin;
const committed = { status: 'COMMITTED', archivedCount: 500, rowCount: 500, rawBytes: 200000, compressedBytes: 70000 };
const empty = { status: 'EMPTY', archivedCount: 0 };
type RunBatch = typeof archiveOneBatch;

Deno.test('legacy invocation preserves the single-batch response and pilot options', async () => {
  let options: unknown;
  const expected = { ...committed, archivedCount: 1, rowCount: 1, restored: true };
  const result = await runArchiveDrain(admin, 1, 1, true, {
    runBatch: ((_admin, _limit, received) => { options = received; return Promise.resolve(expected); }) as RunBatch,
  });
  assert(result === expected && (options as { verifyRestore: boolean }).verifyRestore);
});
Deno.test('drain runs bounded sequential batches and stops when there is no more work', async () => {
  let calls = 0; let active = 0; let peak = 0;
  const runBatch: RunBatch = async (_admin, limit) => {
    assert(limit === 500); active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
    return ++calls === 3 ? empty : committed;
  };
  const result = await runArchiveDrain(admin, 500, 10, false, { runBatch });
  assert('lastStatus' in result && result.lastStatus === 'EMPTY' && result.batches === 2 && !result.hasMore);
  assert(result.archivedCount === 1000 && result.verifiedRawBytes === 400000 && peak === 1 && calls === 3);
});
Deno.test('second batch failure preserves completed counts and stops without retry', async () => {
  let calls = 0;
  const runBatch: RunBatch = () => {
    if (++calls === 2) throw new ArchiveError('ARCHIVE_COMMIT_FAILED');
    return Promise.resolve(committed);
  };
  const result = await runArchiveDrain(admin, 500, 10, false, { runBatch });
  assert('lastStatus' in result && result.lastStatus === 'FAILED' && result.batches === 1 && result.archivedCount === 500);
  assert(result.error === 'ARCHIVE_COMMIT_FAILED' && calls === 2 && result.hasMore);
});
Deno.test('deadline reserve stops before starting another batch', async () => {
  let elapsed = 0; let calls = 0;
  const runBatch: RunBatch = () => { calls++; elapsed += 26000; return Promise.resolve(committed); };
  const result = await runArchiveDrain(admin, 500, 10, false, { now: () => elapsed, runBatch });
  assert('lastStatus' in result && result.lastStatus === 'DEADLINE' && result.batches === 2 && calls === 2);
});
Deno.test('maximum batches stops even while eligible work remains', async () => {
  let calls = 0;
  const result = await runArchiveDrain(admin, 500, 10, false, {
    runBatch: () => { calls++; return Promise.resolve(committed); },
  });
  assert('lastStatus' in result && result.lastStatus === 'COMMITTED' && result.hasMore && result.batches === 10 && calls === 10);
});
Deno.test('multi-batch restore probe and invalid batch count are rejected before any work', async () => {
  for (const [count, restore] of [[2, true], [0, false], [11, false]] as const) {
    let called = false; let rejected = false;
    try { await runArchiveDrain(admin, 1, count, restore, {
      runBatch: () => { called = true; return Promise.resolve(empty); },
    }); } catch (error) { rejected = error instanceof ArchiveError; }
    assert(rejected && !called);
  }
});
