import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { build } from 'esbuild';
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const quota = extra => Object.assign(new Error('Quota'), { status: 429, code: 'RATE_LIMITED', beforeDispatch: true, ...extra });

test('only proven pre-dispatch quota repeats the same explicit command after Retry-After; cancellation and ambiguity stop it', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-command-quota-'));
  try {
    const bundle = resolve(temp, 'test.mjs');
    const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/emissao/nfse-command-quota-retry.ts')],
      bundle: true, write: false, format: 'esm', platform: 'node', outfile: bundle });
    await writeFile(bundle, compiled.outputFiles[0].contents);
    const { runNfseCommandWithQuotaRetry } = await import(pathToFileURL(bundle).href);
    const request = { requestId: 'synthetic-request', previewId: 'synthetic-preview', cancelPreviewId: 'synthetic-cancellation' };
    const calls = [], delays = [], waiting = [];
    let release;
    const response = { state: 'AUTHORIZED' };
    const result = runNfseCommandWithQuotaRetry(async () => {
      calls.push(request);
      if (calls.length === 1) throw quota({ retryAfterMs: 120_000 });
      return response;
    }, { signal: new AbortController().signal, attemptTimeoutMs: 10,
      onWaiting: value => waiting.push(value), wait: async delay => { delays.push(delay); await new Promise(resolve => { release = resolve; }); } });
    await wait(20);
    assert.equal(calls.length, 1, 'A quota wait outlives the per-attempt deadline without starting another POST.');
    assert.deepEqual(delays, [120_000]);
    release(); assert.deepEqual(await result, { result: response, quotaDeferred: true });
    assert.equal(calls.length, 2); assert.equal(calls[0], calls[1]); assert.deepEqual(waiting, [true, false]);

    for (const failure of [quota({ beforeDispatch: false }), quota({ beforeDispatch: undefined }),
      quota({ code: 'GATEWAY_RATE_LIMITED' }), new Error('Ambiguous response')]) {
      let sent = 0;
      await assert.rejects(runNfseCommandWithQuotaRetry(async () => { sent++; throw failure; }, {
        signal: new AbortController().signal, onWaiting: () => assert.fail('An ambiguous outcome cannot schedule a retry.'),
      }));
      assert.equal(sent, 1);
    }
    let timed = 0;
    await assert.rejects(runNfseCommandWithQuotaRetry(() => { timed++; return new Promise(() => {}); }, {
      signal: new AbortController().signal, attemptTimeoutMs: 5, onWaiting: () => assert.fail('Timeout cannot repeat a POST.'),
    }));
    assert.equal(timed, 1);

    let accepted = 0;
    const controller = new AbortController();
    const cancelled = runNfseCommandWithQuotaRetry(async () => { accepted++; throw quota(); }, {
      signal: controller.signal, onWaiting: () => {}, wait: async (delay, signal) => {
        assert.equal(delay, 60_000, 'A structured quota wait is at least one minute.');
        await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new globalThis.DOMException('Closed', 'AbortError')), { once: true }));
      },
    });
    await wait(0); controller.abort();
    await assert.rejects(cancelled, error => error.name === 'AbortError');
    assert.equal(accepted, 1, 'Closing the visible intent cancels the waiting retry.');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
