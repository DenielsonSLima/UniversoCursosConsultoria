import { ArchiveError } from './codec.ts';
import { archiveOneBatch, type ArchiveAdmin } from './worker.ts';

const DEADLINE_MS = 80000;
const BATCH_RESERVE_MS = 30000;
type Dependencies = { now?: () => number; runBatch?: typeof archiveOneBatch };

/** Separate SQL transactions and object verification for every batch; never parallelize writes.
 * The 30s reserve prevents starting more work close to the 80s invocation budget.
 * An in-flight batch finishes through the existing bounded SDK/SQL operations.
 */
export async function runArchiveDrain(
  admin: ArchiveAdmin, limit: number, maxBatches = 1, verifyRestore = false, dependencies: Dependencies = {},
) {
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 10) {
    throw new ArchiveError('ARCHIVE_INVALID_BATCH_COUNT');
  }
  if (verifyRestore && (maxBatches !== 1 || limit !== 1)) {
    throw new ArchiveError('ARCHIVE_RESTORE_PROBE_REQUIRES_ONE_ROW');
  }
  const runBatch = dependencies.runBatch ?? archiveOneBatch;
  // Preserve the established single-batch response exactly.
  if (maxBatches === 1) return await runBatch(admin, limit, { verifyRestore });
  const now = dependencies.now ?? (() => performance.now());
  const started = now();
  let batches = 0; let archivedCount = 0; let verifiedRawBytes = 0; let verifiedCompressedBytes = 0;
  let lastStatus: 'COMMITTED' | 'EMPTY' | 'DEADLINE' | 'FAILED' = 'DEADLINE';
  let errorCode: string | undefined;
  for (let index = 0; index < maxBatches; index++) {
    if (now() - started >= DEADLINE_MS - BATCH_RESERVE_MS) { lastStatus = 'DEADLINE'; break; }
    try {
      const result = await runBatch(admin, limit, { verifyRestore: false });
      if (result.status === 'EMPTY') { lastStatus = 'EMPTY'; break; }
      if (result.status !== 'COMMITTED' || !('rawBytes' in result) || !('compressedBytes' in result)) {
        throw new ArchiveError('ARCHIVE_INVALID_BATCH_RESULT');
      }
      batches++;
      archivedCount += result.archivedCount ?? 0;
      verifiedRawBytes += result.rawBytes;
      verifiedCompressedBytes += result.compressedBytes;
      lastStatus = 'COMMITTED';
    } catch (error) {
      lastStatus = 'FAILED';
      errorCode = error instanceof ArchiveError ? error.code : 'ARCHIVE_UNAVAILABLE';
      break;
    }
  }
  return { status: 'DRAINED', lastStatus, batches, archivedCount, verifiedRawBytes, verifiedCompressedBytes,
    hasMore: lastStatus !== 'EMPTY', ...(errorCode ? { error: errorCode } : {}) };
}
