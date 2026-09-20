import { ArchiveError, encodeArchive, MAX_ARCHIVE_BYTES, sha256, verifyArchive } from './codec.ts';

function assert(ok: unknown, message = 'Assertion failed'): asserts ok { if (!ok) throw new Error(message); }
async function rejects(run: () => Promise<unknown>, code: string) {
  try { await run(); } catch (error) {
    assert(error instanceof ArchiveError && error.code === code, `Expected ${code}`); return;
  }
  throw new Error(`Expected rejection ${code}`);
}
const batchId = '11111111-1111-4111-8111-111111111111';
async function source(payloadText = '{"formatVersion": 1, "rows": [{"id": "fixture", "response": {"result": "UNCHANGED", "note": "ação"}}]}') {
  return { batchId, payloadText, rowCount: 1, sha256: await sha256(new TextEncoder().encode(payloadText)) };
}

Deno.test('archive preserves canonical SQL whitespace, Unicode and exact response', async () => {
  const original = await source();
  const encoded = await encodeArchive(original);
  const restored = await verifyArchive(encoded.compressed, { ...original, compressedSha256: encoded.compressedSha256 });
  assert(restored === original.payloadText);
  assert(encoded.objectPath === `receipts/v1/${batchId}.json.gz`);
});
Deno.test('source checksum or count mismatch cannot reach upload', async () => {
  const original = await source();
  await rejects(() => encodeArchive({ ...original, sha256: '0'.repeat(64) }), 'ARCHIVE_SOURCE_MISMATCH');
  await rejects(() => encodeArchive({ ...original, rowCount: 2 }), 'ARCHIVE_INVALID_ROWS');
});
Deno.test('download checksum and manifest content are independently verified', async () => {
  const original = await source(); const encoded = await encodeArchive(original);
  await rejects(() => verifyArchive(encoded.compressed, { ...original, compressedSha256: '0'.repeat(64) }), 'ARCHIVE_DOWNLOAD_MISMATCH');
  await rejects(() => verifyArchive(encoded.compressed, { ...original, sha256: '0'.repeat(64) }), 'ARCHIVE_CONTENT_MISMATCH');
  await rejects(() => verifyArchive(encoded.compressed, { ...original, rowCount: 2 }), 'ARCHIVE_INVALID_ROWS');
});
Deno.test('oversized source and compressed object are rejected', async () => {
  const original = await source();
  await rejects(() => encodeArchive({ ...original, payloadText: 'x'.repeat(MAX_ARCHIVE_BYTES + 1) }), 'ARCHIVE_TOO_LARGE');
  await rejects(() => verifyArchive(new Uint8Array(MAX_ARCHIVE_BYTES + 1), original), 'ARCHIVE_TOO_LARGE');
});
Deno.test('inflation is bounded even when gzip object is small', async () => {
  const large = new TextEncoder().encode('x'.repeat(MAX_ARCHIVE_BYTES + 1));
  const bytes = new Uint8Array(await new Response(new Blob([large]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const hash = await sha256(large);
  await rejects(() => verifyArchive(bytes, { rowCount: 1, sha256: hash }), 'ARCHIVE_TOO_LARGE');
});
