import { ArchiveError, encodeArchive, MAX_ARCHIVE_BYTES, sha256, verifyArchive } from './codec.ts';

export type RpcResult = { data: unknown; error: unknown };
export type ArchiveStorage = {
  getBucket(id: string): PromiseLike<{ data: { public: boolean } | null; error: unknown }>;
  createBucket(id: string, options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }): PromiseLike<{ error: unknown }>;
  from(id: string): {
    upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: unknown }>;
    download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
  };
};
export type ArchiveAdmin = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: ArchiveStorage;
};
type Prepared = {
  status: 'PREPARED'; batchId: string; leaseToken: string; formatVersion: number;
  bucket: string; objectPath: string; payloadText: string; payloadSha256: string; rowCount: number;
};

async function ensurePrivateBucket(storage: ArchiveStorage): Promise<void> {
  const existing = await storage.getBucket('proesc-history');
  if (existing.data) {
    if (existing.error || existing.data.public !== false) throw new ArchiveError('ARCHIVE_BUCKET_NOT_PRIVATE');
    return;
  }
  // Create only through the Storage API, never by modifying storage.objects/buckets in SQL.
  const created = await storage.createBucket('proesc-history', {
    public: false, fileSizeLimit: MAX_ARCHIVE_BYTES, allowedMimeTypes: ['application/gzip'],
  });
  // Re-read also handles simultaneous workers creating the same private bucket.
  const verified = await storage.getBucket('proesc-history');
  if (verified.error || !verified.data || verified.data.public !== false) {
    throw new ArchiveError(created.error ? 'ARCHIVE_BUCKET_UNAVAILABLE' : 'ARCHIVE_BUCKET_NOT_PRIVATE');
  }
}

export async function archiveOneBatch(admin: ArchiveAdmin, limit = 500, options: { verifyRestore?: boolean } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new ArchiveError('ARCHIVE_INVALID_LIMIT');
  if (options.verifyRestore && limit !== 1) throw new ArchiveError('ARCHIVE_RESTORE_PROBE_REQUIRES_ONE_ROW');
  await ensurePrivateBucket(admin.storage);
  const claimed = await admin.rpc('proesc_prepare_receipt_archive_service', { p_limit: limit });
  if (claimed.error) throw new ArchiveError('ARCHIVE_PREPARE_FAILED');
  if ((claimed.data as { status?: string } | null)?.status === 'EMPTY') return { status: 'EMPTY', archivedCount: 0 };
  const source = claimed.data as Prepared;
  if (!source || source.status !== 'PREPARED' || source.formatVersion !== 1 || source.bucket !== 'proesc-history'
    || typeof source.payloadText !== 'string' || typeof source.leaseToken !== 'string'
    || source.rowCount > 500 || new TextEncoder().encode(source.payloadText).byteLength > 1024 * 1024) {
    throw new ArchiveError('ARCHIVE_INVALID_PREPARE');
  }
  if (options.verifyRestore && source.rowCount !== 1) throw new ArchiveError('ARCHIVE_RESTORE_PROBE_REQUIRES_ONE_ROW');
  const encoded = await encodeArchive({ ...source, sha256: source.payloadSha256 });
  if (source.objectPath !== encoded.objectPath) throw new ArchiveError('ARCHIVE_INVALID_PATH');
  const bucket = admin.storage.from(source.bucket);
  // No overwrite: retries must prove the already uploaded immutable object has the same content.
  const uploaded = await bucket.upload(source.objectPath, encoded.compressed, { contentType: 'application/gzip', upsert: false });
  const downloaded = await bucket.download(source.objectPath);
  if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_ARCHIVE_BYTES) {
    throw new ArchiveError('ARCHIVE_DOWNLOAD_FAILED');
  }
  const downloadedBytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const downloadedSha256 = await sha256(downloadedBytes);
  const verifiedText = await verifyArchive(downloadedBytes, {
    rowCount: source.rowCount, sha256: source.payloadSha256,
    compressedSha256: uploaded.error ? undefined : encoded.compressedSha256,
  });
  if (verifiedText !== source.payloadText) throw new ArchiveError('ARCHIVE_ROUNDTRIP_MISMATCH');
  const committed = await admin.rpc('proesc_commit_receipt_archive_service', {
    p_batch_id: source.batchId, p_lease_token: source.leaseToken,
    p_verified_payload_text: verifiedText, p_compressed_sha256: downloadedSha256,
    p_compressed_bytes: downloadedBytes.byteLength,
  });
  if ((committed.error as { code?: string } | null)?.code === '40001') {
    const status = await admin.rpc('proesc_receipt_archive_status_service', {
      p_batch_id: source.batchId, p_lease_token: source.leaseToken,
    });
    const current = status.data as { status?: string; batchId?: string; payloadSha256?: string } | null;
    if (!status.error && current?.status === 'PREPARED' && current.batchId === source.batchId
      && current.payloadSha256 === source.payloadSha256) {
      const aborted = await admin.rpc('proesc_abort_receipt_archive_service', {
        p_batch_id: source.batchId, p_lease_token: source.leaseToken,
      });
      if (!aborted.error && (aborted.data as { status?: string } | null)?.status === 'ABORTED') {
        // Source rows and immutable object remain intact; a later invocation prepares a fresh batch.
        throw new ArchiveError('ARCHIVE_BATCH_RETRY_REQUIRED');
      }
    }
  }
  const result = committed.data as { status?: string; rowCount?: number; archivedCount?: number } | null;
  if (committed.error || result?.status !== 'COMMITTED' || result.rowCount !== source.rowCount
    || !Number.isSafeInteger(result.archivedCount) || result.archivedCount! < 0 || result.archivedCount! > source.rowCount) {
    throw new ArchiveError('ARCHIVE_COMMIT_FAILED');
  }
  let restored = false;
  if (options.verifyRestore) {
    // Private, one-row pilot. Restore validates full row equality in SQL and cannot apply money.
    const requestId = (JSON.parse(verifiedText) as { rows: Array<{ request_id?: string }> }).rows[0]?.request_id;
    if (source.rowCount !== 1 || typeof requestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new ArchiveError('ARCHIVE_VERIFY_RESTORE_FAILED');
    }
    const verification = await admin.rpc('proesc_restore_receipt_archive_service', {
      p_request_id: requestId, p_payload_text: verifiedText,
    });
    const status = verification.data as { restored?: boolean; requestId?: string } | null;
    if (verification.error || status?.restored !== true || status.requestId !== requestId) {
      throw new ArchiveError('ARCHIVE_VERIFY_RESTORE_FAILED');
    }
    restored = true;
  }
  return { status: 'COMMITTED', archivedCount: result.archivedCount, rowCount: source.rowCount,
    rawBytes: encoded.rawBytes, compressedBytes: downloadedBytes.byteLength,
    ...(options.verifyRestore ? { restored } : {}) };
}
