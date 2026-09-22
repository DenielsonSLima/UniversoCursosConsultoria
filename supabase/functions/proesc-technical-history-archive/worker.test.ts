import { encodeTechnicalArchive, sha256 } from './codec.ts';
import { createTechnicalArchiveHandler } from './handler.ts';
import { archiveTechnicalBatch, drainTechnicalArchive } from './worker.ts';
import { assert, fixture, rejects } from './fixtures.test.ts';

Deno.test('technical commit occurs only after complete immutable Storage roundtrip', async () => {
  const f = await fixture(); const result = await archiveTechnicalBatch(f.admin, 1);
  assert(result.status === 'COMMITTED' && result.archivedRuns === 1);
  assert(f.calls.map((call) => call.name).join(',') === 'proesc_prepare_technical_archive_service,upload,download,proesc_commit_technical_archive_service');
  assert(f.calls.at(-1)?.args?.p_verified_payload_text === f.source.payloadText);
});
Deno.test('technical retry verifies existing object and never overwrites it', async () => {
  const f = await fixture(); f.state.object = (await encodeTechnicalArchive(f.source)).compressed;
  const original = f.state.object; await archiveTechnicalBatch(f.admin);
  assert(f.state.object === original && f.state.committed);
});
Deno.test('missing or corrupt technical objects cannot authorize source removal', async () => {
  const missing = await fixture(); missing.state.unavailable = true;
  await rejects(() => archiveTechnicalBatch(missing.admin), 'TECHNICAL_ARCHIVE_DOWNLOAD_FAILED');
  assert(!missing.state.committed);
  const corrupt = await fixture(); corrupt.state.object = new Uint8Array([1, 2, 3]);
  await rejects(() => archiveTechnicalBatch(corrupt.admin), 'TECHNICAL_ARCHIVE_INVALID_GZIP');
  assert(!corrupt.state.committed);
});
Deno.test('public technical archive bucket fails closed before database preparation', async () => {
  const f = await fixture(); f.state.public = true;
  await rejects(() => archiveTechnicalBatch(f.admin), 'TECHNICAL_ARCHIVE_BUCKET_NOT_PRIVATE');
  assert(f.calls.length === 0);
});
Deno.test('changed SQL source aborts only a still prepared technical batch', async () => {
  const f = await fixture(); f.state.commitError = '40001';
  await rejects(() => archiveTechnicalBatch(f.admin), 'TECHNICAL_ARCHIVE_SOURCE_CHANGED');
  assert(f.state.batchStatus === 'ABORTED' && !f.state.committed);
  const committed = await fixture(); committed.state.commitError = '40001'; committed.state.batchStatus = 'COMMITTED';
  await rejects(() => archiveTechnicalBatch(committed.admin), 'TECHNICAL_ARCHIVE_SOURCE_CHANGED');
  assert(!committed.calls.some((call) => call.args?.p_abort));
});
Deno.test('technical pilot restores verified original run only after commit', async () => {
  const f = await fixture(true); const result = await archiveTechnicalBatch(f.admin, 1, true);
  assert(result.status === 'COMMITTED' && result.restored);
  assert(f.calls.at(-1)?.name === 'proesc_restore_technical_archive_service');
  assert(f.calls.at(-1)?.args?.p_payload_text === f.source.payloadText);
});
Deno.test('HTTP-only run retains its complete evidence without invented item scope', async () => {
  const f = await fixture(); const document = JSON.parse(f.source.payloadText);
  document.runs[0].items = null;
  f.source.payloadText = JSON.stringify(document);
  f.source.payloadSha256 = await sha256(new TextEncoder().encode(f.source.payloadText));
  const result = await archiveTechnicalBatch(f.admin, 1, true);
  assert(result.status === 'COMMITTED' && result.restored);
  assert(f.calls.at(-1)?.args?.p_payload_text === f.source.payloadText);
});
Deno.test('technical pilot restoration failure is reported, never silently successful', async () => {
  const f = await fixture(); f.state.restoreFailure = true;
  await rejects(() => archiveTechnicalBatch(f.admin, 1, true), 'TECHNICAL_ARCHIVE_RESTORE_FAILED');
});
Deno.test('oversized technical batches shrink without losing an individual record', async () => {
  const f = await fixture(); f.state.oversizedAbove = 3;
  await archiveTechnicalBatch(f.admin);
  assert(f.calls.filter((call) => call.name.includes('prepare')).map((call) => call.args?.p_limit).join(',') === '25,12,6,3');
  assert(f.calls.find((call) => call.name.includes('commit'))?.args?.p_verified_payload_text === f.source.payloadText);
});
Deno.test('empty technical backlog performs no upload and bounded drain stops at maximum', async () => {
  const empty = await fixture(); empty.state.empty = true;
  const result = await drainTechnicalArchive(empty.admin, 25, 5);
  assert(result.batches === 0 && !empty.calls.some((call) => call.name === 'upload'));
  const f = await fixture(); assert((await drainTechnicalArchive(f.admin, 1, 2)).batches === 2);
  await rejects(() => drainTechnicalArchive(f.admin, 1, 6), 'TECHNICAL_ARCHIVE_INVALID_LIMIT');
});
Deno.test('drain reserves a complete batch budget instead of beginning near the deadline', async () => {
  const f = await fixture(); let elapsed = 0;
  const result = await drainTechnicalArchive(f.admin, 1, 5, false, () => { const value = elapsed; elapsed += 6000; return value; });
  assert(result.batches === 1);
});
Deno.test('technical worker rejects unauthenticated callers and malformed bounds', async () => {
  const f = await fixture(); const handler = createTechnicalArchiveHandler(f.admin);
  assert((await handler(new Request('https://example.invalid', { method: 'POST' }))).status === 403);
  assert(f.calls.length === 0);
  for (const body of ['{"limit":26}', '{"maxBatches":6}', '{"limit":2,"verifyRestore":true}', '{"objectPath":"anything"}']) {
    assert((await handler(new Request('https://example.invalid', { method: 'POST', body,
      headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) } }))).status === 400);
  }
  assert(!f.calls.some((call) => call.name.includes('prepare')));
});
Deno.test('technical worker cannot select data after failed secret authorization', async () => {
  const f = await fixture(); f.state.denyAuth = true;
  const response = await createTechnicalArchiveHandler(f.admin)(new Request('https://example.invalid', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) }, body: '{}',
  }));
  assert(response.status === 403 && f.calls.length === 1);
});
Deno.test('technical errors return stable codes without SQL details or payloads', async () => {
  const f = await fixture(); f.state.commitError = 'XX000';
  const response = await createTechnicalArchiveHandler(f.admin)(new Request('https://example.invalid', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) }, body: '{}',
  }));
  assert(response.status === 409 && await response.text() === '{"error":"TECHNICAL_ARCHIVE_COMMIT_FAILED"}');
});
