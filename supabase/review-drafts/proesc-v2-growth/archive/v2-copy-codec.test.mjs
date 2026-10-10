import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { encodeV2Copy, decodeV2CopyManifest, decodeV2CopyPayload, snapshotReceipt, sha256 } from './v2-copy-codec.mjs';
import { copyExportFixture, createV2CopyHttpFixture, BATCH, NORMALIZED } from './v2-copy-fixture.mjs';

const scope = () => createV2CopyHttpFixture().remote.scope;
const recalculate = (source) => ({ ...source, payloadSha256: sha256(Buffer.from(source.payloadText)), rawBytes: Buffer.byteLength(source.payloadText) });
const changePayload = (source, change) => {
  const payload = JSON.parse(source.payloadText); change(payload);
  return recalculate({ ...source, payloadText: JSON.stringify(payload) });
};

test('copy codec preserves PostgreSQL UTF8 bytes and exact opaque financial JSON', async () => {
  const source = copyExportFixture();
  const bundle = await encodeV2Copy(source, BATCH, scope());
  const manifest = await decodeV2CopyManifest(bundle.manifestCompressed, bundle.receipt);
  const restored = await decodeV2CopyPayload(bundle.compressed, manifest);
  assert.equal(restored.toString(), source.payloadText);
  assert.equal(JSON.parse(restored).rows[0].normalizedJson, NORMALIZED);
  assert.ok(NORMALIZED.includes('9007199254740993'));
  assert.ok(NORMALIZED.includes('1234567890.12345678901234567890'));
  assert.equal('syntheticOnly' in bundle.receipt, false);
  assert.equal(bundle.receipt.copyOnly, true);
  assert.equal(bundle.receipt.format, 'proesc-v2-copy-receipt-v1');
  const again = await encodeV2Copy(source, BATCH, scope());
  assert.deepEqual(again, bundle);
});

test('source rejects wrong approved batch, scope, fields, hashes and limits', async () => {
  const source = copyExportFixture();
  for (const change of [{ batchId: '00000000-0000-0000-0000-000000000099' }, { projectRef: 'bbbbbbbbbbbbbbbbbbbb' },
    { bucket: 'other' }, { namespace: 'other' }, { tenantId: '3' }, { rowCount: 0 }, { rawBytes: 1048577 },
    { payloadSha256: '0'.repeat(64) }, { payloadText: 'x'.repeat(1048577) }, { unexpected: 'field' },
    { format: 'proesc-synthetic-archive-v1' }, { payloadText: '\ud800' }]) {
    await assert.rejects(encodeV2Copy({ ...source, ...change }, BATCH, scope()));
  }
});

test('matching recomputed digest cannot hide wrong unit/run/ID/count inside payload', async () => {
  const source = copyExportFixture();
  for (const change of [(p) => { p.unitId = 'other'; }, (p) => { p.run.id = BATCH; },
    (p) => { p.run.status = 'RUNNING'; }, (p) => { p.run.finished_at = null; },
    (p) => { p.rows[0].observation.id = BATCH; }, (p) => { p.rows[0].observation.run_id = BATCH; },
    (p) => { p.rows[0].observation.unit_id = 'other'; }, (p) => { p.rows[0].observation.result = 'STAGED'; },
    (p) => { p.rows[0].normalizedJson = { unsafeNumber: 123 }; }, (p) => { p.rows = []; },
    (p) => { p.normalizationVersion = 2; }]) {
    await assert.rejects(encodeV2Copy(changePayload(source, change), BATCH, scope()));
  }
  await assert.rejects(encodeV2Copy(recalculate({ ...source, payloadText: source.payloadText + '\n' }), BATCH, scope()));
});

test('selection requires sorted distinct UUIDs and bounded row count', async () => {
  const source = copyExportFixture();
  for (const observationIds of [[], [BATCH, BATCH], [source.observationIds[0], BATCH], ['not-uuid'], Array(101).fill(BATCH), new Array(1)]) {
    await assert.rejects(encodeV2Copy({ ...source, observationIds, rowCount: observationIds.length }, BATCH, scope()));
  }
});

test('source accessors are rejected without invocation and caller mutations cannot change compression', async () => {
  const source = copyExportFixture();
  let reads = 0;
  const evil = { ...source };
  Object.defineProperty(evil, 'payloadText', { enumerable: true, get() { reads++; return source.payloadText; } });
  await assert.rejects(encodeV2Copy(evil, BATCH, scope()), { code: 'ACCESSOR_REJECTED' });
  assert.equal(reads, 0);
  const expected = source.payloadText;
  const pending = encodeV2Copy(source, BATCH, scope());
  source.payloadText = 'changed'; source.observationIds[0] = BATCH;
  const result = await pending;
  assert.equal(gunzipSync(result.compressed).toString(), expected);
  const manifest = await decodeV2CopyManifest(result.manifestCompressed, result.receipt);
  assert.notEqual(manifest.observationIds[0], BATCH);
});

test('strict receipts bind destination, names, both manifest identities and bounded sizes', async () => {
  const { receipt } = await encodeV2Copy(copyExportFixture(), BATCH, scope());
  for (const changed of [{ format: 'other' }, { copyOnly: false }, { extra: 'secret' }, { rawBytes: 1048577 },
    { manifestJsonBytes: 65537 }, { manifestCompressedBytes: 65537 }, { compressedBytes: 4194305 },
    { objectName: '../data.gz' }, { manifestObjectName: 'other.gz' }, { manifestJsonSha256: 'invalid' },
    { storageScope: { ...receipt.storageScope, tenantId: '9', prefix: 'proesc-v2-copy/9' } }]) {
    assert.throws(() => snapshotReceipt({ ...receipt, ...changed }, scope()));
  }
});

test('manifest and payload decompression are bounded even with internally matching forged digests', async () => {
  const bundle = await encodeV2Copy(copyExportFixture(), BATCH, scope());
  const bomb = gzipSync(Buffer.alloc(128 * 1024));
  const forged = snapshotReceipt({ ...bundle.receipt, manifestJsonBytes: 65536,
    manifestCompressedBytes: bomb.length, manifestCompressedSha256: sha256(bomb),
    manifestObjectName: `${BATCH}.${sha256(bomb)}.manifest.json.gz` }, scope());
  await assert.rejects(decodeV2CopyManifest(bomb, forged), { code: 'ERR_BUFFER_TOO_LARGE' });
  const manifest = await decodeV2CopyManifest(bundle.manifestCompressed, bundle.receipt);
  const payloadBomb = gzipSync(Buffer.alloc(2 * 1024 * 1024));
  await assert.rejects(decodeV2CopyPayload(payloadBomb, { ...manifest, rawBytes: 1048576,
    compressedBytes: payloadBomb.length, compressedSha256: sha256(payloadBomb),
    objectName: `${BATCH}.${sha256(payloadBomb)}.jsonl.gz` }), { code: 'ERR_BUFFER_TOO_LARGE' });
});

test('compressed and JSON manifest tamper fail independently', async () => {
  const bundle = await encodeV2Copy(copyExportFixture(), BATCH, scope());
  await assert.rejects(decodeV2CopyManifest(Buffer.from('corrupt'), bundle.receipt), { code: 'MANIFEST_COMPRESSED_INTEGRITY' });
  await assert.rejects(decodeV2CopyManifest(bundle.manifestCompressed, { ...bundle.receipt, manifestJsonSha256: '0'.repeat(64) }), {
    code: 'MANIFEST_JSON_INTEGRITY',
  });
  const changed = JSON.parse(gunzipSync(bundle.manifestCompressed)); changed.tenantId = '9';
  const plain = Buffer.from(JSON.stringify(changed)), zipped = gzipSync(plain);
  await assert.rejects(decodeV2CopyManifest(zipped, { ...bundle.receipt,
    manifestCompressedBytes: zipped.length, manifestCompressedSha256: sha256(zipped),
    manifestJsonBytes: plain.length, manifestJsonSha256: sha256(plain),
    manifestObjectName: `${BATCH}.${sha256(zipped)}.manifest.json.gz` }), { code: 'SCOPE_MISMATCH' });
});

test('public decoders enforce ceilings without relying on a prior bridge validation', async () => {
  const bundle = await encodeV2Copy(copyExportFixture(), BATCH, scope());
  const manifest = await decodeV2CopyManifest(bundle.manifestCompressed, bundle.receipt);
  await assert.rejects(decodeV2CopyManifest(bundle.manifestCompressed, {
    ...bundle.receipt, manifestJsonBytes: 65537,
  }), { code: 'RECEIPT_SIZE' });
  await assert.rejects(decodeV2CopyPayload(bundle.compressed, { ...manifest, rawBytes: 1102061 }), {
    code: 'INVALID_PAYLOAD_METADATA',
  });
  await assert.rejects(decodeV2CopyPayload(bundle.compressed, { ...manifest, compressedBytes: 4194305 }), {
    code: 'MANIFEST_COMPRESSED_METADATA',
  });
  let reads = 0;
  const receipt = { ...bundle.receipt };
  Object.defineProperty(receipt, 'storageScope', { enumerable: true, get() { reads++; return bundle.receipt.storageScope; } });
  await assert.rejects(decodeV2CopyManifest(bundle.manifestCompressed, receipt), { code: 'ACCESSOR_REJECTED' });
  assert.equal(reads, 0);
});

test('direct decoders snapshot descriptor and compressed bytes before asynchronous gunzip', async () => {
  const bundle = await encodeV2Copy(copyExportFixture(), BATCH, scope());
  const receipt = { ...bundle.receipt, storageScope: { ...bundle.receipt.storageScope } };
  const manifestBytes = Buffer.from(bundle.manifestCompressed);
  const pending = decodeV2CopyManifest(manifestBytes, receipt);
  manifestBytes.fill(0); receipt.manifestJsonBytes = 1; receipt.storageScope.tenantId = 'other';
  const manifest = await pending;
  const mutable = { ...manifest, observationIds: [...manifest.observationIds] };
  const bytes = Buffer.from(bundle.compressed), restored = decodeV2CopyPayload(bytes, mutable);
  bytes.fill(0); mutable.rawBytes = 1; mutable.observationIds[0] = BATCH;
  assert.equal((await restored).toString(), copyExportFixture().payloadText);
});
