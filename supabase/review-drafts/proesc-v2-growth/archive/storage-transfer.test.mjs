import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createLocalStore } from './local-store.mjs';
import { verifySyntheticArchive } from './archive.mjs';
import { createSupabasePrivateStore } from './supabase-store.mjs';
import { publishSyntheticArchive, restoreStorageSyntheticArchive } from './storage-transfer.mjs';
import { CONFIG, RECORDS, transferFixture } from './storage-http-fixture.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function replaceManifest(mock, receipt, bytes, compressed = gzipSync(bytes, { level: 6 })) {
  const result = { ...receipt,
    manifestObjectName: `${receipt.archiveId}.${hash(compressed)}.manifest.json.gz`,
    manifestCompressedSha256: hash(compressed), manifestCompressedBytes: compressed.length,
    manifestJsonSha256: hash(bytes), manifestJsonBytes: bytes.length,
  };
  mock.objects.set(result.manifestObjectName, compressed);
  return result;
}
async function destinations(root) {
  return { staging: await createLocalStore(join(root, 'download')), destination: await createLocalStore(join(root, 'restore')) };
}

test('end-to-end synthetic archive traverses HTTP upload/readback and verified restore', async () => {
  const fixture = await transferFixture();
  const { local, descriptor, remote, root, mock } = fixture;
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  assert.equal(receipt.manifestJsonSha256, descriptor.manifestSha256);
  assert.deepEqual(receipt.storageScope, remote.scope);
  assert.equal(receipt.cleanupEnabled, false);
  assert.equal(mock.objects.size, 2);
  const uploaded = mock.calls.filter((call) => call.method === 'POST');
  assert.ok(uploaded[0].pathname.endsWith('.jsonl.gz'));
  assert.ok(uploaded[1].pathname.endsWith('.manifest.json.gz'));
  const { staging, destination } = await destinations(root);
  const result = await restoreStorageSyntheticArchive(remote, receipt, staging, destination, 'synthetic-restored.jsonl');
  const restored = await readFile(join(destination.root, result.name), 'utf8');
  assert.deepEqual(restored.trimEnd().split('\n').map(JSON.parse), RECORDS);
  assert.equal(result.recordCount, 1);
  assert.equal(result.cleanupEnabled, false);
  assert.deepEqual((await verifySyntheticArchive(local, descriptor)).records, RECORDS);
});

test('retry after a manifest upload interruption reuses verified data and completes once', async () => {
  let failManifest = true;
  const fixture = await transferFixture({ intercept: (call) => {
    if (failManifest && call.method === 'POST' && call.pathname.endsWith('.manifest.json.gz')) {
      throw new Error('Synthetic interrupted manifest response');
    }
  } });
  const { local, descriptor, remote, mock } = fixture;
  await assert.rejects(publishSyntheticArchive(local, descriptor, remote), { code: 'TRANSPORT_UNCONFIRMED' });
  assert.equal(mock.objects.size, 1);
  assert.ok([...mock.objects.keys()].every((name) => name.endsWith('.jsonl.gz')));
  failManifest = false;
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  assert.equal(receipt.manifestJsonSha256, descriptor.manifestSha256);
  assert.equal(mock.objects.size, 2);
});

test('object readback failure prevents manifest upload and preserves all source data', async () => {
  const fixture = await transferFixture({ intercept: (call) => {
    if (call.method === 'GET' && call.pathname.endsWith('.jsonl.gz')) return new Response('corrupt');
  } });
  const { local, descriptor, remote, mock } = fixture;
  await assert.rejects(publishSyntheticArchive(local, descriptor, remote), { code: 'IMMUTABLE_READBACK_MISMATCH' });
  assert.equal(mock.calls.filter((call) => call.method === 'POST' && call.pathname.endsWith('.manifest.json.gz')).length, 0);
  assert.deepEqual((await verifySyntheticArchive(local, descriptor)).records, RECORDS);
});

test('wrong tenant or bound remote receipt fails before credentials or HTTP', async () => {
  const fixture = await transferFixture();
  const { local, descriptor, remote, mock, root } = fixture;
  await assert.rejects(publishSyntheticArchive(local, { ...descriptor, tenantId: 'other' }, remote), /scope/);
  assert.equal(mock.calls.length, 0);
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  const before = mock.calls.length;
  for (const changed of [{ bucket: 'other' }, { namespace: 'other' }, { projectRef: 'bbbbbbbbbbbbbbbbbbbb' }, { prefix: 'other' }]) {
    await assert.rejects(restoreStorageSyntheticArchive(remote, {
      ...receipt, storageScope: { ...receipt.storageScope, ...changed },
    }, staging, destination, 'result.jsonl'), /destination mismatch/);
  }
  assert.equal(mock.calls.length, before);
});

test('corrupt remote manifest cannot select another object or write restored records', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  mock.objects.set(receipt.manifestObjectName, Buffer.from('{"context":{"tenantId":"other"}}'));
  const { staging, destination } = await destinations(root);
  await assert.rejects(restoreStorageSyntheticArchive(remote, receipt, staging, destination, 'result.jsonl'), /checksum/);
  assert.equal((await readdir(staging.root)).length, 0);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('forged descriptor still cannot escape tenant, object name or archive byte limits', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const original = JSON.parse(gunzipSync(mock.objects.get(receipt.manifestObjectName)).toString());
  const { staging, destination } = await destinations(root);
  for (const change of [{ objectName: '../other-file' }, { compressedBytes: 90_000_000 },
    { context: { ...original.context, tenantId: 'other' } }]) {
    const bytes = Buffer.from(JSON.stringify({ ...original, ...change }));
    const forged = replaceManifest(mock, receipt, bytes);
    await assert.rejects(restoreStorageSyntheticArchive(remote, forged,
      staging, destination, 'result.jsonl'), /scope or size/);
  }
  assert.equal((await readdir(staging.root)).length, 0);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('corrupt remote compressed object is rejected before staging/restoration', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { manifest } = await verifySyntheticArchive(local, descriptor);
  mock.objects.set(manifest.objectName, Buffer.from('corrupt'));
  const { staging, destination } = await destinations(root);
  await assert.rejects(restoreStorageSyntheticArchive(remote, receipt, staging, destination, 'result.jsonl'), /checksum/);
  assert.equal((await readdir(staging.root)).length, 0);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('source integrity and storage-size budget are checked before first HTTP', async () => {
  const { local, descriptor, mock } = await transferFixture();
  const small = createSupabasePrivateStore({ ...CONFIG, maxObjectBytes: 10 }, mock);
  await assert.rejects(publishSyntheticArchive(local, descriptor, small), /Split archive/);
  assert.equal(mock.calls.length, 0);
  await writeFile(join(local.root, descriptor.manifestName), '{}');
  const remote = createSupabasePrivateStore(CONFIG, mock);
  await assert.rejects(publishSyntheticArchive(local, descriptor, remote), /checksum/);
  assert.equal(mock.calls.length, 0);
});

test('restore never overwrites a differing destination file or changes remote objects', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  await destination.putImmutable('occupied.jsonl', Buffer.from('synthetic existing file'));
  const posts = mock.calls.filter((call) => call.method === 'POST').length;
  await assert.rejects(restoreStorageSyntheticArchive(remote, receipt, staging, destination, 'occupied.jsonl'), /conflict/);
  assert.equal((await destination.read('occupied.jsonl', 100)).toString(), 'synthetic existing file');
  assert.equal(mock.calls.filter((call) => call.method === 'POST').length, posts);
  assert.equal(mock.objects.size, 2);
});

test('receipt contains only allowlisted metadata, no arbitrary descriptor secrets', async () => {
  const { local, descriptor, remote } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, { ...descriptor, accessToken: 'synthetic-do-not-echo' }, remote);
  assert.equal('accessToken' in receipt, false);
  assert.ok(!JSON.stringify(receipt).includes('synthetic-do-not-echo'));
});

test('publish snapshots descriptor and limits before the first asynchronous read', async () => {
  const { local, descriptor, remote, mock } = await transferFixture();
  const mutable = { ...descriptor };
  const limits = { maxRecords: 100 };
  let first = true;
  const mutatingLocal = { ...local, read: async (...args) => {
    const result = await local.read(...args);
    if (first) {
      first = false;
      mutable.manifestName = `foreign.${'a'.repeat(64)}.manifest.json`;
      mutable.manifestSha256 = 'a'.repeat(64);
      mutable.tenantId = 'other';
      limits.maxRecords = 0;
    }
    return result;
  } };
  const receipt = await publishSyntheticArchive(mutatingLocal, mutable, remote, limits);
  assert.equal(receipt.manifestJsonSha256, descriptor.manifestSha256);
  assert.equal(receipt.manifestObjectName, `${receipt.archiveId}.${receipt.manifestCompressedSha256}.manifest.json.gz`);
  assert.equal(receipt.tenantId, descriptor.tenantId);
  assert.ok(mock.objects.has(receipt.manifestObjectName));
  assert.ok(!mock.objects.has(mutable.manifestName));
});

test('restore snapshots descriptor, nested scope and limits before the first HTTP', async () => {
  const { local, descriptor, remote, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const mutable = { ...receipt, storageScope: { ...receipt.storageScope } };
  const limits = { maxRecords: 100 };
  const { staging, destination } = await destinations(root);
  let first = true;
  const mutatingRemote = { ...remote, read: async (...args) => {
    const result = await remote.read(...args);
    if (first) {
      first = false;
      mutable.manifestObjectName = `foreign.${'a'.repeat(64)}.manifest.json.gz`;
      mutable.manifestCompressedSha256 = 'a'.repeat(64);
      mutable.manifestJsonSha256 = 'a'.repeat(64);
      mutable.manifestJsonBytes = 1;
      mutable.manifestCompressedBytes = 1;
      mutable.archiveId = 'foreign';
      mutable.tenantId = 'other';
      mutable.storageScope.prefix = 'other';
      limits.maxRecords = 0;
    }
    return result;
  } };
  const result = await restoreStorageSyntheticArchive(mutatingRemote, mutable, staging, destination, 'result.jsonl', limits);
  assert.equal(result.recordCount, 1);
  assert.deepEqual((await readFile(join(destination.root, result.name), 'utf8')).trimEnd().split('\n').map(JSON.parse), RECORDS);
});

test('publish rejects a valid manifest under the wrong hash or archiveId filename before HTTP', async () => {
  const { local, descriptor, remote, mock } = await transferFixture();
  const manifest = await local.read(descriptor.manifestName, 64 * 1024);
  for (const name of [`synthetic-batch.${'a'.repeat(64)}.manifest.json`,
    `other-archive.${descriptor.manifestSha256}.manifest.json`]) {
    await local.putImmutable(name, manifest);
    await assert.rejects(publishSyntheticArchive(local, { ...descriptor, manifestName: name }, remote), /filename/);
  }
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.objects.size, 0);
});

test('restore rejects wrong manifest filename identity before downloading the payload', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  const before = mock.calls.length;
  const wrongHash = `synthetic-batch.${'a'.repeat(64)}.manifest.json.gz`;
  await assert.rejects(restoreStorageSyntheticArchive(remote, { ...receipt, manifestObjectName: wrongHash },
    staging, destination, 'result.jsonl'), /filename/);
  assert.equal(mock.calls.length, before);
  const wrongId = `other-archive.${receipt.manifestCompressedSha256}.manifest.json.gz`;
  mock.objects.set(wrongId, Buffer.from(mock.objects.get(receipt.manifestObjectName)));
  await assert.rejects(restoreStorageSyntheticArchive(remote, {
    ...receipt, archiveId: 'other-archive', manifestObjectName: wrongId,
  }, staging, destination, 'result.jsonl'), /filename identity/);
  assert.ok(mock.calls.slice(before).every((call) => !call.pathname.endsWith('.jsonl.gz')));
  assert.equal((await readdir(staging.root)).length, 0);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('gzip-only 4 MiB bucket receives both gzip objects and restores the original local manifest', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  assert.equal(remote.maxObjectBytes, 4 * 1024 * 1024);
  assert.equal(receipt.transferFormat, 'proesc-storage-transfer-v2');
  assert.equal(receipt.manifestJsonSha256, descriptor.manifestSha256);
  const compressed = mock.objects.get(receipt.manifestObjectName);
  const plain = gunzipSync(compressed);
  assert.equal(hash(compressed), receipt.manifestCompressedSha256);
  assert.equal(compressed.length, receipt.manifestCompressedBytes);
  assert.equal(hash(plain), receipt.manifestJsonSha256);
  assert.equal(plain.length, receipt.manifestJsonBytes);
  assert.ok(plain.equals(await local.read(descriptor.manifestName, 64 * 1024)));
  for (const { request } of mock.calls.filter((call) => call.method === 'POST')) {
    assert.equal(request.headers['content-type'], 'application/gzip');
    assert.equal(request.headers['content-encoding'], undefined);
    assert.ok(request.body.length <= 4 * 1024 * 1024);
  }
  const { staging, destination } = await destinations(root);
  await restoreStorageSyntheticArchive(remote, receipt, staging, destination, 'result.jsonl');
  assert.ok((await staging.read(descriptor.manifestName, 64 * 1024)).equals(plain));
  assert.deepEqual(await publishSyntheticArchive(local, descriptor, remote), receipt);
  assert.equal(mock.objects.size, 2);
});

test('v1 and invalid declared manifest limits are rejected before HTTP', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  const before = mock.calls.length;
  for (const changed of [{ transferFormat: 'proesc-storage-transfer-v1' },
    { manifestCompressedBytes: 65537 }, { manifestJsonBytes: 65537 },
    { manifestCompressedBytes: 0 }, { manifestJsonBytes: 0 },
    { manifestCompressedBytes: 1.5 }, { manifestJsonBytes: Number.POSITIVE_INFINITY }]) {
    await assert.rejects(restoreStorageSyntheticArchive(remote, { ...receipt, ...changed },
      staging, destination, 'result.jsonl'), /destination mismatch|configured limits/);
  }
  assert.equal(mock.calls.length, before);
});

test('both compressed and logical manifest digests are required before payload download', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  const before = mock.calls.length;
  const wrongCompressed = { ...receipt, manifestCompressedSha256: '0'.repeat(64),
    manifestObjectName: `${receipt.archiveId}.${'0'.repeat(64)}.manifest.json.gz` };
  mock.objects.set(wrongCompressed.manifestObjectName, mock.objects.get(receipt.manifestObjectName));
  for (const forged of [wrongCompressed, { ...receipt, manifestJsonSha256: '0'.repeat(64) },
    { ...receipt, manifestJsonBytes: receipt.manifestJsonBytes + 1 }]) {
    await assert.rejects(restoreStorageSyntheticArchive(remote, forged,
      staging, destination, 'result.jsonl'), /checksum or size/);
  }
  assert.ok(mock.calls.slice(before).every((call) => !call.pathname.endsWith('.jsonl.gz')));
  assert.equal((await readdir(staging.root)).length, 0);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('manifest gzip expansion is capped before parsing, payload download or staging', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  const bomb = Buffer.alloc(128 * 1024, 32);
  const forged = { ...replaceManifest(mock, receipt, bomb), manifestJsonBytes: 64 * 1024 };
  assert.ok(forged.manifestCompressedBytes < 1024);
  const before = mock.calls.length;
  await assert.rejects(restoreStorageSyntheticArchive(remote, forged,
    staging, destination, 'result.jsonl'), { code: 'ERR_BUFFER_TOO_LARGE' });
  assert.ok(mock.calls.slice(before).every((call) => !call.pathname.endsWith('.jsonl.gz')));
  assert.equal((await readdir(staging.root)).length, 0);
  assert.equal((await readdir(destination.root)).length, 0);
});

test('truncated gzip and joined gzip members cannot bypass bounded manifest decoding', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const original = await local.read(descriptor.manifestName, 64 * 1024);
  const zipped = mock.objects.get(receipt.manifestObjectName);
  const { staging, destination } = await destinations(root);
  const before = mock.calls.length;
  for (const compressed of [zipped.subarray(0, zipped.length - 4), Buffer.concat([zipped, gzipSync(Buffer.alloc(64 * 1024))])]) {
    const forged = replaceManifest(mock, receipt, original, compressed);
    await assert.rejects(restoreStorageSyntheticArchive(remote, forged, staging, destination, 'result.jsonl'));
  }
  assert.ok(mock.calls.slice(before).every((call) => !call.pathname.endsWith('.jsonl.gz')));
  assert.equal((await readdir(staging.root)).length, 0);
});

test('compressed manifest actual length is enforced even without Content-Length', async () => {
  const { local, descriptor, remote, mock, root } = await transferFixture();
  const receipt = await publishSyntheticArchive(local, descriptor, remote);
  const { staging, destination } = await destinations(root);
  const before = mock.calls.length;
  await assert.rejects(restoreStorageSyntheticArchive(remote, {
    ...receipt, manifestCompressedBytes: receipt.manifestCompressedBytes - 1,
  }, staging, destination, 'result.jsonl'), { code: 'RESPONSE_TOO_LARGE' });
  await assert.rejects(restoreStorageSyntheticArchive(remote, {
    ...receipt, manifestCompressedBytes: receipt.manifestCompressedBytes + 1,
  }, staging, destination, 'result.jsonl'), /compressed manifest checksum or size/);
  assert.ok(mock.calls.slice(before).every((call) => !call.pathname.endsWith('.jsonl.gz')));
  assert.equal((await readdir(staging.root)).length, 0);
});

test('manifest readback corruption never returns a trusted transfer receipt', async () => {
  const { local, descriptor, remote, mock } = await transferFixture({ intercept: (call) =>
    call.method === 'GET' && call.pathname.endsWith('.manifest.json.gz') ? new Response('corrupt') : undefined });
  await assert.rejects(publishSyntheticArchive(local, descriptor, remote), { code: 'IMMUTABLE_READBACK_MISMATCH' });
  assert.equal(mock.objects.size, 2); // Unconfirmed objects remain untouched; no cleanup is implied.
  assert.deepEqual((await verifySyntheticArchive(local, descriptor)).records, RECORDS);
});
