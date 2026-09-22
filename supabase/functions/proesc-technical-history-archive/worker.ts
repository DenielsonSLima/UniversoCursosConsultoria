import type { ArchiveAdmin } from '../proesc-history-archive/worker.ts';
import {
  ArchiveError, encodeTechnicalArchive, MAX_TECHNICAL_BYTES, MAX_TECHNICAL_RUNS,
  sha256, TECHNICAL_BUCKET, verifyTechnicalArchive, type TechnicalArchiveSource,
} from './codec.ts';

export type TechnicalPrepared = TechnicalArchiveSource & {
  status: 'PREPARED'; leaseToken: string; formatVersion: number; bucket: string; objectPath: string;
};

export async function archiveTechnicalBatch(admin: ArchiveAdmin, limit = MAX_TECHNICAL_RUNS, verifyRestore = false) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TECHNICAL_RUNS || (verifyRestore && limit !== 1)) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_LIMIT');
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
  const committed = await admin.rpc('proesc_commit_technical_archive_service', {
    p_batch_id: source.batchId, p_lease_token: source.leaseToken, p_verified_payload_text: verifiedText,
    p_compressed_sha256: downloadedHash, p_compressed_bytes: bytes.byteLength,
  });
  if ((committed.error as { code?: string } | null)?.code === '40001') {
    const current = await admin.rpc('proesc_technical_archive_state_service', {
      p_batch_id: source.batchId, p_lease_token: source.leaseToken, p_abort: false,
    });
    if (!current.error && (current.data as { status?: string } | null)?.status === 'PREPARED') {
      await admin.rpc('proesc_technical_archive_state_service', {
        p_batch_id: source.batchId, p_lease_token: source.leaseToken, p_abort: true,
      });
    }
    throw new ArchiveError('TECHNICAL_ARCHIVE_SOURCE_CHANGED');
  }
  const result = committed.data as { status?: string; runCount?: number; archivedRuns?: number } | null;
  if (committed.error || result?.status !== 'COMMITTED' || result.runCount !== source.runCount
    || !Number.isSafeInteger(result.archivedRuns) || result.archivedRuns! < 0 || result.archivedRuns! > source.runCount) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_COMMIT_FAILED');
  }
  let restored = false;
  if (verifyRestore) {
    const runId = (JSON.parse(verifiedText) as { runs: Array<{ runId: string }> }).runs[0].runId;
    const restore = await admin.rpc('proesc_restore_technical_archive_service', {
      p_run_id: runId, p_payload_text: verifiedText,
    });
    const status = restore.data as { restored?: boolean; runId?: string } | null;
    if (restore.error || status?.restored !== true || status.runId !== runId) {
      throw new ArchiveError('TECHNICAL_ARCHIVE_RESTORE_FAILED');
    }
    restored = true;
  }
  return { status: 'COMMITTED' as const, archivedRuns: result.archivedRuns!, runCount: source.runCount,
    compressedBytes: bytes.byteLength, ...(verifyRestore ? { restored } : {}) };
}

export async function drainTechnicalArchive(
  admin: ArchiveAdmin, limit = 25, maxBatches = 1, verifyRestore = false,
  now: () => number = () => performance.now(),
) {
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 5 || (verifyRestore && maxBatches !== 1)) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_LIMIT');
  }
  const started = now();
  let batches = 0; let archivedRuns = 0; let compressedBytes = 0;
  let lastStatus = 'EMPTY'; let restored = false;
  // Reserve a full batch of bounded network calls; never begin fresh work at the deadline.
  // The entrypoint additionally aborts all calls at the request's 100-second deadline.
  while (batches < maxBatches && (batches === 0 || now() - started <= 5000)) {
    const result = await archiveTechnicalBatch(admin, limit, verifyRestore);
    lastStatus = result.status;
    if (result.status === 'EMPTY') break;
    batches++;
    archivedRuns += result.archivedRuns ?? 0;
    compressedBytes += result.compressedBytes ?? 0;
    restored = restored || result.restored === true;
  }
  return { lastStatus, batches, archivedRuns, compressedBytes, ...(verifyRestore ? { restored } : {}) };
}
