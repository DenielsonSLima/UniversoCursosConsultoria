import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('capacidade de cupons oculta backend ausente, isola identidade e recupera rede com retry limitado', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/coupon-availability-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://www.universocc.com.br/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  let response = { data: false, error: null }, calls = 0;
  globalThis.__couponAvailabilityTransport = {
    rpc(name) {
      assert.equal(name, 'ead_coupons_available'); calls++;
      const promise = Promise.resolve(response);
      promise.abortSignal = () => promise; return promise;
    },
  };
  let root, client;
  try {
    const outfile = resolve(temp, 'availability.mjs');
    const compiled = await build({ stdin: { resolveDir: base, contents: `
      export {useEadCouponsAvailability} from './modules/ead/cupons/hooks/useEadCouponsAvailability';
      export {shouldRetryEadCouponsAvailability} from './modules/ead/cupons/coupons-availability.service';` },
    bundle: true, write: false, outfile, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SUPABASE_URL: 'https://kfekgwyqozhicpfuunpo.supabase.co' }) },
    plugins: [{ name: 'isolated-availability-transport', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const supabase=globalThis.__couponAvailabilityTransport;' }));
    } }] });
    await writeFile(outfile, compiled.outputFiles[0].contents);
    const { useEadCouponsAvailability, shouldRetryEadCouponsAvailability } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1, gcTime: 0 } } });
    let available;
    function Harness({ context, enabled }) {
      available = useEadCouponsAvailability(context, enabled);
      return React.createElement('output', null, String(available));
    }
    root = createRoot(document.getElementById('root'));
    const settle = async () => act(async () => { await new Promise(done => setTimeout(done, 25)); });
    const render = async (context, enabled = true) => {
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { context, enabled }))));
      await settle(); await settle();
    };
    const refresh = async () => { await act(async () => client.invalidateQueries({ queryKey: ['ead-cupons', 'availability'] })); await settle(); };
    await render('aluno:synthetic-a');
    assert.equal(available, false);
    assert.equal(calls, 1, 'The authorized production environment checks the real server capability');
    response = { data: true, error: null }; await refresh();
    assert.equal(available, true);
    response = { data: false, error: null };
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { context: 'aluno:synthetic-b', enabled: true }))));
    assert.equal(available, false, 'A new identity never inherits the previous capability cache');
    await settle(); assert.equal(available, false);
    response = { data: 'true', error: null }; await refresh();
    assert.equal(available, false, 'Only a canonical boolean true enables coupons');
    response = { data: null, error: { code: 'PGRST202', message: 'RPC not installed' } };
    const missingCalls = calls; await refresh();
    assert.equal(available, false); assert.equal(calls, missingCalls + 1, 'Missing backend does not retry');
    response = { data: null, error: { code: 'NETWORK', message: 'Synthetic offline' } };
    const networkCalls = calls; await refresh();
    assert.equal(available, false); assert.equal(calls, networkCalls + 2, 'A transient network failure retries once');
    response = { data: true, error: null }; await refresh(); assert.equal(available, true);
    const disabledCalls = calls; await render('aluno:synthetic-b', false);
    assert.equal(available, false); assert.equal(calls, disabledCalls);
    dom.reconfigure({ url: 'https://outro-projeto.vercel.app/' });
    await render('aluno:synthetic-c');
    assert.equal(available, false); assert.equal(calls, disabledCalls, 'An unauthorized frontend cannot even query capability');
    assert.equal(shouldRetryEadCouponsAvailability(0, { code: '42501' }), false);
    assert.equal(shouldRetryEadCouponsAvailability(0, { code: '42883' }), false);
    assert.equal(shouldRetryEadCouponsAvailability(1, { code: 'NETWORK' }), false);
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear(); dom.window.close(); delete globalThis.__couponAvailabilityTransport;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temp, { recursive: true, force: true });
  }
});
