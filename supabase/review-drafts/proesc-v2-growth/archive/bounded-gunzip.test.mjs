import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { boundedGunzip } from './bounded-gunzip.mjs';

test('streaming gunzip accepts exact output ceiling and rejects one byte above it', async () => {
  for (const maximum of [65536, 1048576]) {
    const exact = Buffer.alloc(maximum, 65);
    assert.deepEqual(await boundedGunzip(gzipSync(exact), maximum), exact);
    await assert.rejects(boundedGunzip(gzipSync(Buffer.alloc(maximum + 1, 65)), maximum), {
      code: 'ERR_BUFFER_TOO_LARGE',
    });
  }
});

test('streaming cap applies across concatenated gzip members and rejects malformed streams', async () => {
  const first = gzipSync(Buffer.alloc(40000)), second = gzipSync(Buffer.alloc(40000));
  await assert.rejects(boundedGunzip(Buffer.concat([first, second]), 65536), { code: 'ERR_BUFFER_TOO_LARGE' });
  await assert.rejects(boundedGunzip(first.subarray(0, first.length - 4), 65536));
  await assert.rejects(boundedGunzip(Buffer.from('not gzip'), 65536));
});

test('direct streaming helper validates input bounds and snapshots caller bytes', async () => {
  for (const maximum of [0, 1.5, 1048577, Number.POSITIVE_INFINITY]) {
    await assert.rejects(boundedGunzip(gzipSync(Buffer.from('test')), maximum), { code: 'INVALID_GUNZIP_LIMIT' });
  }
  await assert.rejects(boundedGunzip(Buffer.alloc(4194305), 65536), { code: 'INVALID_GUNZIP_LIMIT' });
  const compressed = gzipSync(Buffer.from('preserved'));
  const pending = boundedGunzip(compressed, 65536); compressed.fill(0);
  assert.equal((await pending).toString(), 'preserved');
});
