import { encodeTechnicalArchive, MAX_TECHNICAL_BYTES, sha256, verifyTechnicalArchive } from './codec.ts';
import { assert, fixture, makeDocument, rejects } from './fixtures.test.ts';

Deno.test('technical archive retains exact JSON, identities, timestamps and scoped reused counts', async () => {
  for (const reused of [false, true]) {
    const { source } = await fixture(reused);
    const encoded = await encodeTechnicalArchive(source);
    assert(await verifyTechnicalArchive(encoded.compressed, source) === source.payloadText);
    assert(encoded.objectPath.startsWith('technical/v1/') && encoded.rawBytes > encoded.compressed.byteLength);
  }
});
Deno.test('technical archive rejects source hash mismatch and tampered downloaded bytes', async () => {
  const { source } = await fixture();
  await rejects(() => encodeTechnicalArchive({ ...source, payloadSha256: '0'.repeat(64) }), 'TECHNICAL_ARCHIVE_SOURCE_MISMATCH');
  const encoded = await encodeTechnicalArchive(source);
  await rejects(() => verifyTechnicalArchive(encoded.compressed, { ...source, compressedSha256: '0'.repeat(64) }), 'TECHNICAL_ARCHIVE_DOWNLOAD_MISMATCH');
  await rejects(() => verifyTechnicalArchive(encoded.compressed, { ...source, payloadSha256: '0'.repeat(64) }), 'TECHNICAL_ARCHIVE_CONTENT_MISMATCH');
});
Deno.test('technical archive rejects duplicate run identity and incorrect per-run counts', async () => {
  const { source } = await fixture(); const document = makeDocument();
  document.runs.push(document.runs[0]);
  const duplicated = JSON.stringify(document);
  await rejects(() => encodeTechnicalArchive({ ...source, payloadText: duplicated, runCount: 2,
    payloadSha256: 'a'.repeat(64) }), 'TECHNICAL_ARCHIVE_INVALID_RUN');
  document.runs.pop(); document.runs[0].http.row_count = 2;
  await rejects(() => encodeTechnicalArchive({ ...source, payloadText: JSON.stringify(document) }), 'TECHNICAL_ARCHIVE_INVALID_RUN');
});
Deno.test('technical archive rejects path traversal and over-limit payload', async () => {
  const { source } = await fixture();
  await rejects(() => encodeTechnicalArchive({ ...source, batchId: '../receipts/elsewhere' }), 'TECHNICAL_ARCHIVE_INVALID_MANIFEST');
  await rejects(() => encodeTechnicalArchive({ ...source, payloadText: 'a'.repeat(MAX_TECHNICAL_BYTES + 1) }), 'TECHNICAL_ARCHIVE_TOO_LARGE');
});
Deno.test('technical archive bounds decompressed streams before creating large JSON', async () => {
  const raw = new TextEncoder().encode('a'.repeat(MAX_TECHNICAL_BYTES + 1));
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const payloadSha256 = await sha256(raw);
  await rejects(() => verifyTechnicalArchive(compressed, { runCount: 1, payloadSha256 }), 'ARCHIVE_TOO_LARGE');
});
