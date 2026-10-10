import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishV2Copy, restoreV2Copy } from './v2-copy-transfer.mjs';
import { runV2CopyBatch } from './v2-copy-worker.mjs';
import { createV2CopyRestoreStore } from './v2-copy-local-store.mjs';
import { copyExportFixture, createV2CopyHttpFixture, BATCH } from './v2-copy-fixture.mjs';

const ack = () => ({ batchId: BATCH, status: 'COPY_RECEIPT_RECORDED', copyOnly: true });
async function destination() { return createV2CopyRestoreStore(await mkdtemp(join(tmpdir(), 'proesc-v2-copy-test-'))); }
function workerDependencies(mock, changes = {}) {
  return { remote: mock.remote, exportBatch: async () => copyExportFixture(), recordReceipt: async () => ack(), ...changes };
}

test('V2 export passes gzip-only HTTP/readback, catalog acknowledgement and exact local restoration', async () => {
  const mock = createV2CopyHttpFixture(), source = copyExportFixture(), calls = [];
  const result = await runV2CopyBatch(BATCH, workerDependencies(mock, {
    exportBatch: async (batch, { signal }) => { assert.equal(signal.aborted, false); calls.push(['export', batch]); return source; },
    recordReceipt: async (batch, receipt, { signal }) => {
      assert.equal(signal.aborted, false); calls.push(['record', batch]);
      assert.equal(mock.objects.size, 2);
      for (const name of [receipt.objectName, receipt.manifestObjectName]) {
        assert.ok(mock.calls.some((call) => call.method === 'GET' && call.pathname.endsWith(name)));
      }
      return ack();
    },
  }));
  assert.deepEqual(calls, [['export', BATCH], ['record', BATCH]]);
  assert.deepEqual(result.catalog, ack());
  assert.equal(result.receipt.copyOnly, true);
  assert.equal(Object.keys(result.receipt).length, 15);
  const posts = mock.calls.filter((call) => call.method === 'POST');
  assert.ok(posts[0].pathname.endsWith('.jsonl.gz'));
  assert.ok(posts[1].pathname.endsWith('.manifest.json.gz'));
  assert.ok(posts.every((call) => call.request.headers['content-type'] === 'application/gzip'));
  const local = await destination();
  const restored = await restoreV2Copy(mock.remote, result.receipt, local, 'restored.json');
  assert.equal(await readFile(join(local.root, restored.name), 'utf8'), source.payloadText);
  assert.equal(restored.payloadSha256, source.payloadSha256);
  assert.equal(restored.rawBytes, source.rawBytes);
  assert.equal(restored.rowCount, source.rowCount);
  assert.equal(restored.copyOnly, true);
});

test('OFF or invalid scope gates worker before export RPC or credentials', async () => {
  for (const config of [{ enabled: false }, { namespace: 'other' }, { bucket: 'other' }, { maxObjectBytes: 6291456 }]) {
    const mock = createV2CopyHttpFixture({ config }); let exported = 0;
    await assert.rejects(runV2CopyBatch(BATCH, workerDependencies(mock, { exportBatch: async () => { exported++; return copyExportFixture(); } })));
    assert.equal(exported, 0); assert.equal(mock.calls.length, 0); assert.equal(mock.credentialCalls.length, 0);
  }
});

test('wrong RPC batch or malformed export is rejected before HTTP/catalog', async () => {
  const mock = createV2CopyHttpFixture(); let recorded = 0;
  await assert.rejects(runV2CopyBatch(BATCH, workerDependencies(mock, {
    exportBatch: async () => ({ ...copyExportFixture(), batchId: '00000000-0000-0000-0000-000000000099' }),
    recordReceipt: async () => { recorded++; return ack(); },
  })), { code: 'BATCH_OR_RUN_MISMATCH' });
  assert.equal(mock.calls.length, 0); assert.equal(recorded, 0);
});

test('HTTP errors or corrupt readback never invoke receipt recording', async () => {
  for (const phase of ['upload', 'payloadRead', 'manifestRead']) {
    const mock = createV2CopyHttpFixture({ intercept: (call) => {
      if (phase === 'upload' && call.method === 'POST') return new Response('{}', { status: 503 });
      if (call.method === 'GET' && ((phase === 'payloadRead' && call.pathname.endsWith('.jsonl.gz'))
        || (phase === 'manifestRead' && call.pathname.endsWith('.manifest.json.gz')))) return new Response('corrupt');
    } });
    let recorded = 0;
    await assert.rejects(runV2CopyBatch(BATCH, workerDependencies(mock, { recordReceipt: async () => { recorded++; return ack(); } })));
    assert.equal(recorded, 0);
    assert.ok(mock.calls.every((call) => ['GET', 'POST'].includes(call.method)));
  }
});

test('uncertain upload is not retried and explicit replay verifies existing exact bytes', async () => {
  let interrupt = true, recorded = 0;
  const mock = createV2CopyHttpFixture({ intercept: (call, state) => {
    if (interrupt && call.method === 'POST') {
      interrupt = false; state.objects.set(call.pathname.split('/').at(-1), Buffer.from(call.request.body));
      throw new Error('Synthetic lost reply');
    }
  } });
  const dependencies = workerDependencies(mock, { recordReceipt: async () => { recorded++; return ack(); } });
  await assert.rejects(runV2CopyBatch(BATCH, dependencies), { code: 'TRANSPORT_UNCONFIRMED' });
  assert.equal(recorded, 0); assert.equal(mock.calls.filter((c) => c.method === 'POST').length, 1);
  const result = await runV2CopyBatch(BATCH, dependencies);
  assert.equal(recorded, 1); assert.equal(mock.objects.size, 2);
  assert.deepEqual((await runV2CopyBatch(BATCH, dependencies)).receipt, result.receipt);
  assert.equal(mock.objects.size, 2);
});

test('catalog error or false acknowledgement stays unconfirmed and never retries automatically', async () => {
  const mock = createV2CopyHttpFixture();
  for (const result of [null, {}, { ...ack(), batchId: 'other' }, { ...ack(), status: 'UNKNOWN' },
    { ...ack(), copyOnly: false }, { ...ack(), unexpected: 'extra' }]) {
    let attempts = 0;
    await assert.rejects(runV2CopyBatch(BATCH, workerDependencies(mock, { recordReceipt: async () => { attempts++; return result; } })), {
      code: 'CATALOG_UNCONFIRMED',
    });
    assert.equal(attempts, 1);
  }
  const error = await runV2CopyBatch(BATCH, workerDependencies(mock, {
    recordReceipt: async () => { throw new Error('synthetic-secret-do-not-echo'); },
  })).catch((value) => value);
  assert.equal(error.code, 'CATALOG_UNCONFIRMED'); assert.ok(!String(error).includes('synthetic-secret'));
  assert.equal(mock.objects.size, 2);
});

test('RPC deadlines abort callbacks and late export never starts upload', async () => {
  const mock = createV2CopyHttpFixture(); let signal, recorded = 0;
  await assert.rejects(runV2CopyBatch(BATCH, workerDependencies(mock, { rpcTimeoutMs: 10,
    exportBatch: async (_batch, options) => { signal = options.signal; await new Promise((r) => setTimeout(r, 30)); return copyExportFixture(); },
    recordReceipt: async () => { recorded++; return ack(); },
  })), { code: 'EXPORT_UNCONFIRMED' });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(signal.aborted, true); assert.equal(mock.calls.length, 0); assert.equal(recorded, 0);
});

test('catalog timeout may leave a committed receipt but remains unconfirmed until explicit replay', async () => {
  const mock = createV2CopyHttpFixture(); let stored, signal, attempts = 0;
  const recordReceipt = async (_batch, receipt, options) => {
    attempts++; signal = options.signal; stored ??= receipt;
    assert.deepEqual(receipt, stored);
    if (attempts === 1) await new Promise((r) => setTimeout(r, 30));
    return ack();
  };
  await assert.rejects(runV2CopyBatch(BATCH, workerDependencies(mock, { rpcTimeoutMs: 10, recordReceipt })), { code: 'CATALOG_UNCONFIRMED' });
  assert.equal(attempts, 1); assert.equal(signal.aborted, true); assert.equal(mock.objects.size, 2);
  const result = await runV2CopyBatch(BATCH, workerDependencies(mock, { recordReceipt }));
  assert.deepEqual(result.receipt, stored); assert.equal(attempts, 2); assert.equal(mock.objects.size, 2);
});

test('scope and receipt are snapshotted before asynchronous remote reads', async () => {
  const mock = createV2CopyHttpFixture();
  const receipt = await publishV2Copy(copyExportFixture(), mock.remote, BATCH);
  const mutable = { ...receipt, storageScope: { ...receipt.storageScope } };
  const remote = { ...mock.remote, read: async (...args) => {
    const result = await mock.remote.read(...args);
    mutable.manifestJsonBytes = 1; mutable.rawBytes = 1; mutable.storageScope.tenantId = 'other';
    return result;
  } };
  assert.equal((await restoreV2Copy(remote, mutable, await destination(), 'result.json')).rawBytes, receipt.rawBytes);
});

test('restore rejects wrong scope, corrupted manifest/payload and invalid destinations without writes', async () => {
  const mock = createV2CopyHttpFixture();
  const receipt = await publishV2Copy(copyExportFixture(), mock.remote, BATCH);
  const local = await destination(), before = mock.calls.length;
  await assert.rejects(restoreV2Copy(mock.remote, { ...receipt, storageScope: { ...receipt.storageScope, projectRef: 'bbbbbbbbbbbbbbbbbbbb' } }, local, 'result.json'));
  await assert.rejects(restoreV2Copy(mock.remote, receipt, local, '../result.json'));
  await assert.rejects(restoreV2Copy(mock.remote, receipt, { ...local, kind: 'synthetic-filesystem-only' }, 'result.json'));
  assert.equal(mock.calls.length, before);
  const manifest = mock.objects.get(receipt.manifestObjectName);
  mock.objects.set(receipt.manifestObjectName, Buffer.from('bad'));
  await assert.rejects(restoreV2Copy(mock.remote, receipt, local, 'result.json'), { code: 'MANIFEST_COMPRESSED_INTEGRITY' });
  mock.objects.set(receipt.manifestObjectName, manifest);
  mock.objects.set(receipt.objectName, Buffer.from('bad'));
  await assert.rejects(restoreV2Copy(mock.remote, receipt, local, 'result.json'), { code: 'COMPRESSED_INTEGRITY' });
  assert.deepEqual(await readdir(local.root), []);
});

test('local restore is immutable, idempotent and refuses symlinks and unbounded direct writes', async () => {
  const mock = createV2CopyHttpFixture();
  const receipt = await publishV2Copy(copyExportFixture(), mock.remote, BATCH), local = await destination();
  await restoreV2Copy(mock.remote, receipt, local, 'same.json');
  assert.equal((await restoreV2Copy(mock.remote, receipt, local, 'same.json')).reused, true);
  await local.putImmutable('occupied.json', Buffer.from('existing'));
  await assert.rejects(restoreV2Copy(mock.remote, receipt, local, 'occupied.json'));
  assert.equal(await readFile(join(local.root, 'occupied.json'), 'utf8'), 'existing');
  await writeFile(join(local.root, 'target.json'), 'target');
  await symlink(join(local.root, 'target.json'), join(local.root, 'link.json'));
  await assert.rejects(restoreV2Copy(mock.remote, receipt, local, 'link.json'));
  await assert.rejects(local.putImmutable('big.json', Buffer.alloc(1048577)));
  assert.equal(mock.objects.size, 2);
});
