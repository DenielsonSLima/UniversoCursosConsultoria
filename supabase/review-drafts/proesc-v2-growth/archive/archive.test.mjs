import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createLocalStore } from './local-store.mjs';
import { archiveSyntheticRecords, verifySyntheticArchive, restoreSyntheticArchive } from './archive.mjs';

const context = Object.freeze({
  syntheticOnly: true, tenantId: 'synthetic-unit', archiveId: 'synthetic-batch-01',
  sourceKind: 'invoice', normalizationVersion: 1,
  cutoff: '2026-10-08T00:00:00.000Z', createdAt: '2026-10-09T00:00:00.000Z',
});
const fixture = () => [
  { syntheticOnly: true, id: 'synthetic-invoice-b', tenantId: context.tenantId,
    runId: 'synthetic-run', kind: 'invoice', payload: { amount: '20.10', currency: 'BRL', state: 'OPEN' } },
  { syntheticOnly: true, id: 'synthetic-invoice-a', tenantId: context.tenantId,
    runId: 'synthetic-run', kind: 'invoice', payload: { amount: '10.00', currency: 'BRL', state: 'PAID' } },
];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'proesc-synthetic-archive-'));
  return { root, store: await createLocalStore(join(root, 'archives')) };
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('archive, verify and restore preserve exact JSON values, scope and provenance', async () => {
  const { root, store } = await setup();
  const input = fixture();
  const unchanged = structuredClone(input);
  const descriptor = await archiveSyntheticRecords(store, context, input);
  assert.deepEqual(input, unchanged);
  const { records, manifest } = await verifySyntheticArchive(store, descriptor);
  assert.deepEqual(records, input.toSorted((a, b) => a.id.localeCompare(b.id)));
  assert.equal(manifest.cleanupEnabled, false);
  assert.equal(manifest.recordCount, 2);
  const destination = await createLocalStore(join(root, 'restore'));
  const restored = await restoreSyntheticArchive(store, descriptor, destination, 'synthetic-restore.jsonl');
  assert.equal(restored.recordCount, 2);
  assert.equal(restored.cleanupEnabled, false);
  const output = await readFile(join(destination.root, 'synthetic-restore.jsonl'));
  assert.equal(hash(output), manifest.uncompressedSha256);
});

test('identical retries and input reordering reuse immutable files', async () => {
  const { store } = await setup();
  const first = await archiveSyntheticRecords(store, context, fixture());
  const second = await archiveSyntheticRecords(store, context, fixture().reverse());
  assert.deepEqual(first, second);
  assert.equal((await readdir(store.root)).length, 2);
});

test('changed content produces a distinct archive, preserving prior files', async () => {
  const { store } = await setup();
  const first = await archiveSyntheticRecords(store, context, fixture());
  const changed = fixture();
  changed[0].payload.amount = '20.11';
  const second = await archiveSyntheticRecords(store, context, changed);
  assert.notEqual(first.manifestName, second.manifestName);
  assert.equal((await readdir(store.root)).length, 4);
  assert.equal((await verifySyntheticArchive(store, first)).records[1].payload.amount, '20.10');
});

test('requires explicit synthetic mode, consistent tenant/kind and unique ids', async () => {
  const { store } = await setup();
  await assert.rejects(archiveSyntheticRecords(store, { ...context, syntheticOnly: false }, fixture()), /synthetic/);
  const otherTenant = fixture();
  otherTenant[0].tenantId = 'other-tenant';
  await assert.rejects(archiveSyntheticRecords(store, context, otherTenant), /scope/);
  const otherKind = fixture();
  otherKind[0].kind = 'payment';
  await assert.rejects(archiveSyntheticRecords(store, context, otherKind), /scope/);
  await assert.rejects(archiveSyntheticRecords(store, context, [fixture()[0], fixture()[0]]), /Duplicate/);
  assert.equal((await readdir(store.root)).length, 0);
});

test('enforces record, uncompressed and compressed limits before writing', async () => {
  const { store } = await setup();
  await assert.rejects(archiveSyntheticRecords(store, context, fixture(), { maxRecords: 1 }), /count/);
  await assert.rejects(archiveSyntheticRecords(store, context, fixture(), { maxUncompressedBytes: 10 }), /Uncompressed/);
  await assert.rejects(archiveSyntheticRecords(store, context, fixture(), { maxCompressedBytes: 10 }), /Compressed/);
  assert.equal((await readdir(store.root)).length, 0);
});

test('refuses non-JSON values rather than silently losing information', async () => {
  const { store } = await setup();
  for (const value of [undefined, NaN, Infinity, -0, 1n, new Date(), Array(2)]) {
    const rows = fixture();
    rows[0].payload.invalid = value;
    await assert.rejects(archiveSyntheticRecords(store, context, rows), /JSON/);
  }
  assert.equal((await readdir(store.root)).length, 0);
});

test('detects compressed data corruption before restoring anything', async () => {
  const { root, store } = await setup();
  const descriptor = await archiveSyntheticRecords(store, context, fixture());
  const { manifest } = await verifySyntheticArchive(store, descriptor);
  const objectPath = join(store.root, manifest.objectName);
  const bytes = await readFile(objectPath);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(objectPath, bytes); // Deliberate corruption of a synthetic test fixture.
  const destination = await createLocalStore(join(root, 'restore'));
  await assert.rejects(restoreSyntheticArchive(store, descriptor, destination, 'result.jsonl'), /checksum/);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('detects manifest tampering and rejects a different tenant descriptor', async () => {
  const { store } = await setup();
  const descriptor = await archiveSyntheticRecords(store, context, fixture());
  await assert.rejects(verifySyntheticArchive(store, { ...descriptor, tenantId: 'other-tenant' }), /tenant/);
  await writeFile(join(store.root, descriptor.manifestName), '{}');
  await assert.rejects(verifySyntheticArchive(store, descriptor), /Manifest checksum/);
});

test('incomplete archive never exposes a committed manifest', async () => {
  const { store } = await setup();
  const failing = { ...store, putImmutable: async (name, bytes) => {
    if (name.endsWith('.manifest.json')) throw new Error('Simulated publication interruption');
    return store.putImmutable(name, bytes);
  } };
  await assert.rejects(archiveSyntheticRecords(failing, context, fixture()), /interruption/);
  assert.equal((await readdir(store.root)).filter((name) => name.endsWith('.manifest.json')).length, 0);
  const retry = await archiveSyntheticRecords(store, context, fixture());
  assert.equal((await verifySyntheticArchive(store, retry)).records.length, 2);
  assert.equal((await readdir(store.root)).length, 2);
});

test('failed object readback prevents manifest publication', async () => {
  const { store } = await setup();
  const failing = { ...store, read: async () => Buffer.from('corrupt synthetic readback') };
  await assert.rejects(archiveSyntheticRecords(failing, context, fixture()), /readback/);
  assert.equal((await readdir(store.root)).filter((name) => name.endsWith('.manifest.json')).length, 0);
});

test('restore is idempotent but will not overwrite a different existing file', async () => {
  const { root, store } = await setup();
  const descriptor = await archiveSyntheticRecords(store, context, fixture());
  const destination = await createLocalStore(join(root, 'restore'));
  await restoreSyntheticArchive(store, descriptor, destination, 'result.jsonl');
  assert.equal((await restoreSyntheticArchive(store, descriptor, destination, 'result.jsonl')).reused, true);
  await destination.putImmutable('occupied.jsonl', Buffer.from('preserve this synthetic file'));
  await assert.rejects(restoreSyntheticArchive(store, descriptor, destination, 'occupied.jsonl'), /conflict/);
  await assert.rejects(restoreSyntheticArchive(store, descriptor, store, 'same.jsonl'), /separate/);
});

test('local adapter rejects traversal, symlink object reads and symlink roots', async () => {
  const { root, store } = await setup();
  await assert.rejects(store.putImmutable('../escape', Buffer.from('x')), /Unsafe/);
  const outside = join(root, 'synthetic-outside.txt');
  await writeFile(outside, 'synthetic');
  await symlink(outside, join(store.root, 'link'));
  await assert.rejects(store.read('link', 100));
  await symlink(store.root, join(root, 'linked-root'));
  await assert.rejects(createLocalStore(join(root, 'linked-root')), /Symlink/);
});

test('decompression is bounded even when a forged manifest understates expansion', async () => {
  const { store } = await setup();
  const descriptor = await archiveSyntheticRecords(store, context, fixture());
  const { manifest } = await verifySyntheticArchive(store, descriptor);
  const compressed = gzipSync(Buffer.alloc(100_000, 'x'));
  manifest.compressedSha256 = hash(compressed);
  manifest.objectName = `${context.archiveId}.${manifest.compressedSha256}.jsonl.gz`;
  manifest.compressedBytes = compressed.length;
  manifest.uncompressedBytes = 100;
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await store.putImmutable(manifest.objectName, compressed);
  await store.putImmutable('forged.manifest.json', manifestBytes);
  await assert.rejects(verifySyntheticArchive(store, {
    manifestName: 'forged.manifest.json', manifestSha256: hash(manifestBytes), tenantId: context.tenantId,
  }, { maxUncompressedBytes: 2048 }));
});

test('concurrent archive attempts can retry safely without overwriting objects', async () => {
  const { store } = await setup();
  // A rival may see an incomplete, exclusively-created file and fail safely.
  // The retry after completion must resolve to the same immutable descriptor.
  await Promise.allSettled(Array.from({ length: 3 }, () => archiveSyntheticRecords(store, context, fixture())));
  const first = await archiveSyntheticRecords(store, context, fixture());
  const second = await archiveSyntheticRecords(store, context, fixture());
  assert.deepEqual(first, second);
  assert.equal((await readdir(store.root)).length, 2);
});

test('strict metadata rejects invalid dates, extra fields and non-string identifiers', async () => {
  const { store } = await setup();
  await assert.rejects(archiveSyntheticRecords(store, { ...context, cutoff: '2026-02-31T00:00:00.000Z' }, fixture()), /cutoff/);
  await assert.rejects(archiveSyntheticRecords(store, { ...context, token: 'synthetic-not-a-real-secret' }, fixture()), /context fields/);
  await assert.rejects(archiveSyntheticRecords(store, { ...context, tenantId: 123 }, fixture()), /tenantId/);
  const rows = fixture();
  rows[0].id = 123;
  await assert.rejects(archiveSyntheticRecords(store, context, rows), /scope/);
  assert.equal((await readdir(store.root)).length, 0);
});

test('caller metadata mutation during asynchronous compression cannot alter the manifest', async () => {
  const { store } = await setup();
  const mutable = { ...context };
  const pending = archiveSyntheticRecords(store, mutable, fixture());
  mutable.tenantId = 'other-tenant';
  const descriptor = await pending;
  assert.equal(descriptor.tenantId, context.tenantId);
  assert.equal((await verifySyntheticArchive(store, descriptor)).manifest.context.tenantId, context.tenantId);
});
