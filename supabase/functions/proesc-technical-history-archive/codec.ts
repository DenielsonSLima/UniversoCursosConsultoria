import { ArchiveError, readBounded, sha256 } from '../proesc-history-archive/codec.ts';

export { ArchiveError, sha256 };
export const TECHNICAL_BUCKET = 'proesc-history';
export const MAX_TECHNICAL_BYTES = 1024 * 1024;
export const MAX_TECHNICAL_RUNS = 25;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;

export type TechnicalArchiveSource = {
  batchId: string;
  payloadText: string;
  runCount: number;
  payloadSha256: string;
};

export function technicalObjectPath(batchId: string): string {
  if (!uuid.test(batchId)) throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_MANIFEST');
  return `technical/v1/${batchId}.json.gz`;
}

function validateEnvelope(text: string, runCount: number): void {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_JSON'); }
  const document = value as { formatVersion?: unknown; kind?: unknown; runs?: unknown } | null;
  if (!document || document.formatVersion !== 1 || document.kind !== 'proesc-technical-history'
    || !Array.isArray(document.runs) || !Number.isSafeInteger(runCount)
    || runCount < 1 || runCount > MAX_TECHNICAL_RUNS || document.runs.length !== runCount) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_FORMAT');
  }
  const ids = new Set<string>();
  for (const run of document.runs) {
    if (!run || typeof run !== 'object' || !uuid.test(run.runId)
      || ids.has(run.runId) || !Array.isArray(run.reusedCounts)
      || (!run.items && !run.http && run.reusedCounts.length === 0)) {
      throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_RUN');
    }
    ids.add(run.runId);
    if (run.reusedCounts.length > 60 || run.reusedCounts.some((entry: Record<string, unknown>) => !entry
      || entry.run_id !== run.runId || !uuid.test(String(entry.polo_id)) || !uuid.test(String(entry.class_id))
      || !Number.isSafeInteger(entry.reused_count) || Number(entry.reused_count) < 1 || Number(entry.reused_count) > 60)) {
      throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_RUN');
    }
    for (const [name, maximum] of [['items', 60], ['http', 256]] as const) {
      const packed = run[name];
      if (packed === null) continue;
      if (!packed || typeof packed !== 'object' || packed.run_id !== run.runId
        || !Array.isArray(packed.records) || !Number.isSafeInteger(packed.row_count)
        || packed.row_count < 1 || packed.row_count > maximum
        || packed.records.length !== packed.row_count) {
        throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_RUN');
      }
    }
  }
}

export async function encodeTechnicalArchive(source: TechnicalArchiveSource) {
  const objectPath = technicalObjectPath(source.batchId);
  if (!digest.test(source.payloadSha256)) throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_MANIFEST');
  const raw = new TextEncoder().encode(source.payloadText);
  if (raw.byteLength > MAX_TECHNICAL_BYTES) throw new ArchiveError('TECHNICAL_ARCHIVE_TOO_LARGE');
  validateEnvelope(source.payloadText, source.runCount);
  if (await sha256(raw) !== source.payloadSha256) throw new ArchiveError('TECHNICAL_ARCHIVE_SOURCE_MISMATCH');
  const compressed = await readBounded(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')), MAX_TECHNICAL_BYTES);
  return { objectPath, compressed, compressedSha256: await sha256(compressed), rawBytes: raw.byteLength };
}

export async function verifyTechnicalArchive(
  compressed: Uint8Array,
  expected: Pick<TechnicalArchiveSource, 'runCount' | 'payloadSha256'> & { compressedSha256?: string },
): Promise<string> {
  if (compressed.byteLength > MAX_TECHNICAL_BYTES) throw new ArchiveError('TECHNICAL_ARCHIVE_TOO_LARGE');
  if (!digest.test(expected.payloadSha256)) throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_MANIFEST');
  if (expected.compressedSha256 && await sha256(compressed) !== expected.compressedSha256) {
    throw new ArchiveError('TECHNICAL_ARCHIVE_DOWNLOAD_MISMATCH');
  }
  let raw: Uint8Array;
  try {
    raw = await readBounded(new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_TECHNICAL_BYTES);
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_GZIP');
  }
  if (await sha256(raw) !== expected.payloadSha256) throw new ArchiveError('TECHNICAL_ARCHIVE_CONTENT_MISMATCH');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new ArchiveError('TECHNICAL_ARCHIVE_INVALID_UTF8'); }
  validateEnvelope(text, expected.runCount);
  return text;
}
