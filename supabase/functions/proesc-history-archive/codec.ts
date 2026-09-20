export const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;

export class ArchiveError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export type ArchiveSource = {
  batchId: string;
  payloadText: string;
  rowCount: number;
  sha256: string;
};

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Bound both compressed input and inflated output; never materialize an unbounded stream.
export async function readBounded(stream: ReadableStream<Uint8Array>, limit = MAX_ARCHIVE_BYTES): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) throw new ArchiveError('ARCHIVE_TOO_LARGE');
      parts.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

function validateRows(text: string, expectedCount: number): void {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new ArchiveError('ARCHIVE_INVALID_JSON'); }
  const envelope = parsed as { formatVersion?: unknown; rows?: unknown } | null;
  if (!envelope || envelope.formatVersion !== 1) throw new ArchiveError('ARCHIVE_INVALID_FORMAT');
  const rows = envelope.rows;
  if (!Array.isArray(rows) || rows.length !== expectedCount || expectedCount < 1
    || rows.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
    throw new ArchiveError('ARCHIVE_INVALID_ROWS');
  }
}

export async function encodeArchive(source: ArchiveSource) {
  if (!uuid.test(source.batchId) || !digest.test(source.sha256) || !Number.isSafeInteger(source.rowCount)) {
    throw new ArchiveError('ARCHIVE_INVALID_MANIFEST');
  }
  const raw = new TextEncoder().encode(source.payloadText);
  if (raw.byteLength > MAX_ARCHIVE_BYTES) throw new ArchiveError('ARCHIVE_TOO_LARGE');
  validateRows(source.payloadText, source.rowCount);
  if (await sha256(raw) !== source.sha256) throw new ArchiveError('ARCHIVE_SOURCE_MISMATCH');
  const compressed = await readBounded(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')));
  return {
    compressed, compressedSha256: await sha256(compressed), rawBytes: raw.byteLength,
    objectPath: `receipts/v1/${source.batchId}.json.gz`,
  };
}

export async function verifyArchive(
  compressed: Uint8Array,
  expected: Pick<ArchiveSource, 'rowCount' | 'sha256'> & { compressedSha256?: string },
): Promise<string> {
  if (compressed.byteLength > MAX_ARCHIVE_BYTES) throw new ArchiveError('ARCHIVE_TOO_LARGE');
  if (!digest.test(expected.sha256) || !Number.isSafeInteger(expected.rowCount)) {
    throw new ArchiveError('ARCHIVE_INVALID_MANIFEST');
  }
  if (expected.compressedSha256 && await sha256(compressed) !== expected.compressedSha256) {
    throw new ArchiveError('ARCHIVE_DOWNLOAD_MISMATCH');
  }
  let raw: Uint8Array;
  try {
    raw = await readBounded(new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')));
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('ARCHIVE_INVALID_GZIP');
  }
  if (await sha256(raw) !== expected.sha256) throw new ArchiveError('ARCHIVE_CONTENT_MISMATCH');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new ArchiveError('ARCHIVE_INVALID_UTF8'); }
  validateRows(text, expected.rowCount);
  return text;
}
