import type { ArchiveAdmin } from '../proesc-history-archive/worker.ts';
import { readProescTechnicalHistory } from '../_shared/proesc-technical-history.ts';
import {
  ArchiveError, encodeTechnicalArchive, MAX_TECHNICAL_BYTES, MAX_TECHNICAL_RUNS,
  sha256, TECHNICAL_BUCKET, verifyTechnicalArchive, type TechnicalArchiveSource,
} from './codec.ts';

export type TechnicalPrepared = TechnicalArchiveSource & {
  status: 'PREPARED'; leaseToken: string; formatVersion: number; bucket: string; objectPath: string;
};

function canonical(value: unknown, field = ''): string {
  if (typeof value === 'string' && ['recorded_at', 'first_checked_at', 'last_checked_at'].includes(field)) {
    const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    const milliseconds = Date.parse(value);
    if (instant && Number.isFinite(milliseconds)) {
      // Normalize only timezone notation; retain fractional precision beyond JavaScript milliseconds.
      value = new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', '')
        + `.${(instant[1] ?? '').padEnd(9, '0')}Z`;
    }
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, key)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

function verifyPilotHistory(payloadText: string, history: Awaited<ReturnType<typeof readProescTechnicalHistory>>) {
  const source = (JSON.parse(payloadText) as { runs: Array<{
    runId: string; items: { records: Record<string, unknown>[] } | null;
    http: { records: Record<string, unknown>[] } | null; reusedCounts: Record<string, unknown>[];
  }> }).runs[0];
  const items = (source.items?.records ?? []).map((item) => ({ ...item, run_id: source.runId }));
  const http = (source.http?.records ?? []).map((item) => ({ ...item, run_id: source.runId, error_code: null }));
  const exactSubset = (expected: unknown[], actual: unknown[], acceptExtra: (row: unknown) => boolean) => {
    const remaining = [...actual];
    for (const row of expected) {
      const at = remaining.findIndex((entry) => canonical(entry) === canonical(row));
      if (at < 0) throw new ArchiveError('TECHNICAL_ARCHIVE_PILOT_CONTENT_MISMATCH');
      remaining.splice(at, 1);
    }
    if (remaining.some((row) => !acceptExtra(row))) throw new ArchiveError('TECHNICAL_ARCHIVE_PILOT_CONTENT_MISMATCH');
  };
  exactSubset(items, history.items, (row) => {
    const result = (row as { result?: unknown } | null)?.result;
    return result === 'APPLIED' || result === 'REVIEW';
  });
  exactSubset(http, history.http, (row) => typeof (row as { error_code?: unknown } | null)?.error_code === 'string');
  exactSubset(source.reusedCounts, history.reusedCounts, () => false);
}

export async function archiveTechnicalBatch(
  admin: ArchiveAdmin, limit = MAX_TECHNICAL_RUNS, verifyRestore = false,
  pilotActorId?: string, pilotDeadline = performance.now() + 100000,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TECHNICAL_RUNS || (verifyRestore && limit !== 1)) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_LIMIT');
  }
  if (verifyRestore && (!pilotActorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pilotActorId))) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_PILOT_ACTOR_REQUIRED');
  }
  const bucketInfo = await admin.storage.getBucket(TECHNICAL_BUCKET);
  if (bucketInfo.error || !bucketInfo.data || bucketInfo.data.public !== false) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_BUCKET_NOT_PRIVATE');
  }
  let claimed = await admin.rpc('proesc_prepare_technical_archive_service', { p_limit: limit });
  // Bound oversized input before staging it; never truncate a run or its evidence.
  while ((claimed.error as { code?: string } | null)?.code === '54000' && limit > 1) {
    limit = Math.max(1, Math.floor(limit / 2));
    claimed = await admin.rpc('proesc_prepare_technical_archive_service', { p_limit: limit });
  }
  if (claimed.error) throw new ArchiveError('TECHNICAL_ARCHIVE_PREPARE_FAILED');
  if ((claimed.data as { status?: string } | null)?.status === 'EMPTY') return { status: 'EMPTY' as const, archivedRuns: 0 };
  const source = claimed.data as TechnicalPrepared;
  if (!source || source.status !== 'PREPARED' || source.formatVersion !== 1 || source.bucket !== TECHNICAL_BUCKET
    || typeof source.leaseToken !== 'string' || typeof source.payloadText !== 'string'
    || (verifyRestore && source.runCount !== 1)) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_PREPARE');
  }
  const encoded = await encodeTechnicalArchive(source);
  if (source.objectPath !== encoded.objectPath) throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_PATH');
  const bucket = admin.storage.from(TECHNICAL_BUCKET);
  const uploaded = await bucket.upload(source.objectPath, encoded.compressed, { contentType: 'application/gzip', upsert: false });
  // Upload retries may encounter an existing immutable object. Always download and verify it.
  const downloaded = await bucket.download(source.objectPath);
  if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_TECHNICAL_BYTES) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_DOWNLOAD_FAILED');
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const downloadedHash = await sha256(bytes);
  const verifiedText = await verifyTechnicalArchive(bytes, {
    runCount: source.runCount, payloadSha256: source.payloadSha256,
    compressedSha256: uploaded.error ? undefined : encoded.compressedSha256,
  });
  if (verifiedText !== source.payloadText) throw new ArchiveError('TECHNICAL_ARCHIVE_ROUNDTRIP_MISMATCH');
  // A pilot must leave time for commit, an authorized cold read, and restoration.
  // Refusing here leaves original SQL sources intact and the real prepared batch resumable.
  if (verifyRestore && pilotDeadline - performance.now() < 65000) throw new ArchiveError('TECHNICAL_ARCHIVE_PILOT_BUDGET');
  let committed;
  try {
    committed = await admin.rpc('proesc_commit_technical_archive_service', {
      p_batch_id: source.batchId, p_lease_token: source.leaseToken, p_verified_payload_text: verifiedText,
      p_compressed_sha256: downloadedHash, p_compressed_bytes: bytes.byteLength,
    });
  } catch { committed = { data: null, error: { code: 'TRANSPORT' } }; }
  let result = committed.data as { status?: string; runCount?: number; archivedRuns?: number; replayed?: boolean } | null;
  if (committed.error || result?.status !== 'COMMITTED' || result.runCount !== source.runCount
    || !Number.isSafeInteger(result.archivedRuns) || result.archivedRuns! < 0 || result.archivedRuns! > source.runCount) {
    // A timeout can lose the response after SQL committed. Inspect this exact batch once;
    // never start another prepare or assume that the source stayed in SQL.
    let current;
    try {
      current = await admin.rpc('proesc_technical_archive_state_service', {
        p_batch_id: source.batchId, p_lease_token: source.leaseToken, p_abort: false,
      });
    } catch { throw new ArchiveError('TECHNICAL_ARCHIVE_COMMIT_UNCERTAIN'); }
    const state = current.data as { status?: string; batchId?: string; runCount?: number;
      payloadSha256?: string; compressedSha256?: string; compressedBytes?: number } | null;
    if (current.error || !state || state.batchId !== source.batchId || state.runCount !== source.runCount
      || state.payloadSha256 !== source.payloadSha256) throw new ArchiveError('TECHNICAL_ARCHIVE_COMMIT_UNCERTAIN');
    if (state.status === 'COMMITTED') {
      if (state.compressedSha256 !== downloadedHash || state.compressedBytes !== bytes.byteLength) {
        throw new ArchiveError('TECHNICAL_ARCHIVE_COMMIT_UNCERTAIN');
      }
      result = { status: 'COMMITTED', runCount: source.runCount, archivedRuns: 0, replayed: true };
    } else if (state.status === 'PREPARED' && (committed.error as { code?: string } | null)?.code === '40001') {
      await admin.rpc('proesc_technical_archive_state_service', {
        p_batch_id: source.batchId, p_lease_token: source.leaseToken, p_abort: true,
      });
      throw new ArchiveError('TECHNICAL_ARCHIVE_SOURCE_CHANGED');
    } else if (state.status === 'PREPARED' || state.status === 'ABORTED') {
      throw new ArchiveError('TECHNICAL_ARCHIVE_COMMIT_FAILED');
    } else throw new ArchiveError('TECHNICAL_ARCHIVE_COMMIT_UNCERTAIN');
  }
  let restored = false;
  let readerVerified = false;
  let pilotRunId: string | undefined;
  if (verifyRestore) {
    const runId = (JSON.parse(verifiedText) as { runs: Array<{ runId: string }> }).runs[0].runId;
    pilotRunId = runId;
    let readerFailure: ArchiveError | null = null;
    try {
      const available = pilotDeadline - performance.now() - 20000;
      if (available <= 0) throw new ArchiveError('TECHNICAL_ARCHIVE_PILOT_BUDGET');
      const history = await readProescTechnicalHistory(admin, pilotActorId!, { runId }, { timeoutMs: Math.min(15000, available) });
      verifyPilotHistory(verifiedText, history);
      readerVerified = true;
    } catch (error) {
      readerFailure = error instanceof ArchiveError ? error : new ArchiveError('TECHNICAL_ARCHIVE_PILOT_READER_FAILED');
    } finally {
      try {
        const restore = await admin.rpc('proesc_restore_technical_archive_service', {
          p_run_id: runId, p_payload_text: verifiedText,
        });
        const status = restore.data as { restored?: boolean; runId?: string } | null;
        restored = !restore.error && status?.restored === true && status.runId === runId;
      } catch { restored = false; }
    }
    if (!restored) throw new ArchiveError('TECHNICAL_ARCHIVE_RESTORE_FAILED');
    if (readerFailure) throw readerFailure;
  }
  return { status: 'COMMITTED' as const, archivedRuns: result.archivedRuns!, runCount: source.runCount, replayed: result.replayed === true,
    compressedBytes: bytes.byteLength, ...(verifyRestore ? { restored, readerVerified, pilotRunId, pilotBatchId: source.batchId } : {}) };
}

export async function drainTechnicalArchive(
  admin: ArchiveAdmin, limit = 25, maxBatches = 1, verifyRestore = false,
  now: () => number = () => performance.now(),
  pilotActorId?: string, pilotDeadline = performance.now() + 100000,
) {
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 5 || (verifyRestore && maxBatches !== 1)) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_LIMIT');
  }
  const started = now();
  let batches = 0; let archivedRuns = 0; let compressedBytes = 0;
  let lastStatus = 'EMPTY'; let restored = false; let replayed = false;
  let readerVerified = false; let pilotRunId: string | undefined; let pilotBatchId: string | undefined;
  // Reserve a full batch of bounded network calls; never begin fresh work at the deadline.
  // The entrypoint additionally aborts all calls at the request's 100-second deadline.
  while (batches < maxBatches && (batches === 0 || now() - started <= 5000)) {
    const result = await archiveTechnicalBatch(admin, limit, verifyRestore, pilotActorId, pilotDeadline);
    lastStatus = result.status;
    if (result.status === 'EMPTY') break;
    batches++;
    archivedRuns += result.archivedRuns ?? 0;
    compressedBytes += result.compressedBytes ?? 0;
    restored = restored || result.restored === true;
    replayed = replayed || result.replayed;
    readerVerified = result.readerVerified === true;
    pilotRunId = result.pilotRunId; pilotBatchId = result.pilotBatchId;
  }
  return { lastStatus, batches, archivedRuns, compressedBytes, replayed,
    ...(verifyRestore ? { restored, readerVerified, pilotRunId, pilotBatchId } : {}) };
}
