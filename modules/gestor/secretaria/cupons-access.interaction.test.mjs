import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('Secretaria oferece cupons somente na Matriz e encerra a gestão ao trocar de polo ou permissão', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/cupons-access-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  let root, client, reads = 0;
  globalThis.__couponAccessTransport = {
    rpc(name) {
      assert.equal(name, 'ead_coupons_available'); reads++;
      const promise = Promise.resolve({ data: true, error: null });
      promise.abortSignal = () => promise; return promise;
    },
  };
  try {
    const outfile = resolve(temp, 'access.mjs');
    await build({ entryPoints: [resolve(base, 'modules/gestor/secretaria/SecretariaPage.tsx')], outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ DEV: true, VITE_EAD_COUPONS_ENABLED: 'true', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }) },
      plugins: [{ name: 'isolated-secretaria-access', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onResolve({ filter: /.*/ }, args => {
          if (!args.importer.endsWith('/SecretariaPage.tsx')) return;
          if (args.kind === 'dynamic-import') return { path: args.path.includes('cupons-ead') ? 'coupons' : 'other', namespace: 'fixture' };
          if (args.path.endsWith('secretaria-documentos.definitions')) return { path: 'definitions', namespace: 'fixture' };
          if (args.path.endsWith('secretaria-carteirinhas.service')) return { path: 'cards', namespace: 'fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: base, contents: {
          supabase: 'export const supabase=globalThis.__couponAccessTransport;',
          definitions: 'export const secretariaDocumentoDefinitions={};',
          cards: 'export const secretariaCarteirinhasWorkspaceQueryOptions=id=>({queryKey:["cards",id],queryFn:async()=>[]});',
          coupons: 'import React from "react"; export default props=>React.createElement("section",{"data-coupon-workspace":props.canManage,"data-polo":props.poloId},"Gestão de cupons autorizada");',
          other: 'import React from "react"; export default ()=>React.createElement("section",null,"Operação da Secretaria");',
        }[args.path] }));
      } }],
    });
    const { default: SecretariaPage } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    root = createRoot(document.getElementById('root'));
    const permissions = { modules: ['secretaria', 'financeiro'], financeiroTabs: [], allPolos: true };
    const settle = () => act(async () => { await new Promise(done => setTimeout(done, 25)); });
    const render = async props => {
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(SecretariaPage,
        { poloId: 'matriz-ficticia', gestorContextId: 'gestor-ficticio', gestorPermissions: permissions, ...props }))));
      await settle(); await settle();
    };
    const button = () => [...document.querySelectorAll('button')].find(item => item.textContent.includes('Cupons EAD'));
    await render({}); assert.equal(button(), undefined); assert.equal(reads, 0, 'Sem atributo canônico de Matriz não consulta capacidade');
    await render({ isMatriz: false, poloId: 'filial-ficticia' }); assert.equal(button(), undefined); assert.equal(reads, 0);
    await render({ isMatriz: true, gestorPermissions: { ...permissions, modules: ['secretaria'] } }); assert.equal(button(), undefined); assert.equal(reads, 0);
    await render({ isMatriz: true, poloId: null }); assert.equal(button(), undefined); assert.equal(reads, 0);
    await render({ isMatriz: true }); assert(button()); assert.equal(reads, 1);
    await act(async () => button().click()); await settle();
    assert.equal(document.querySelector('[data-coupon-workspace]')?.getAttribute('data-polo'), 'matriz-ficticia');
    await render({ isMatriz: false, poloId: 'filial-ficticia' });
    assert.equal(document.querySelector('[data-coupon-workspace]'), null);
    assert.equal(button(), undefined); assert(document.body.textContent.includes('Secretaria Digital'));
    await render({ isMatriz: true }); assert(button());
    await act(async () => button().click()); await settle();
    assert.equal(document.querySelector('[data-coupon-workspace]')?.getAttribute('data-coupon-workspace'), 'true');
    await render({ isMatriz: true, gestorPermissions: { ...permissions, modules: ['financeiro'] } });
    assert.equal(document.querySelector('[data-coupon-workspace]'), null); assert.equal(button(), undefined);
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear(); dom.window.close(); delete globalThis.__couponAccessTransport;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temp, { recursive: true, force: true });
  }
});
