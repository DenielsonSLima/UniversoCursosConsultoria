import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;
const { JSDOM } = await import(process.env.NFSE_TEST_JSDOM_MODULE || 'jsdom');
const directory = await mkdtemp(join(tmpdir(), 'nfse-model-export-ui-'));
const base = new URL('./', import.meta.url);
const fixtureOutput = join(directory, 'fixture.cjs');
await build({ entryPoints: [fileURLToPath(new URL('nfse-model-export.fixture.ts', base))], bundle: true,
  platform: 'node', format: 'cjs', outfile: fixtureOutput, logLevel: 'silent' });
const fixture = require(fixtureOutput);
const model = fixture.exportModelFixture();
const state = { model, scope: fixture.exportScope, issuer: { data: fixture.exportIssuer, isPending: false, isFetching: false, error: null, refetch: async () => {} },
  catalogs: { data: fixture.exportCatalogs, isPending: false, error: null, refetch: async () => {} },
  blob: new Blob(['%PDF-1.3\nsynthetic test'], { type: 'application/pdf' }), downloads: [], previews: [], reports: [], failPdf: false };
globalThis.__nfseExportHarness = state;
const output = join(directory, 'entry.cjs');
await build({ entryPoints: [fileURLToPath(new URL('../ModelosNfseTab.tsx', base))], bundle: true, platform: 'node', format: 'cjs',
  outfile: output, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'scoped-exports', setup(build) {
    build.onResolve({ filter: /^(react|react-dom)(\/|$)/ }, args => ({ path: require.resolve(args.path), external: true }));
    const mocks = [
      [/useNfseQueries$/, 'export const useNfseModels=()=>({data:{rows:[globalThis.__nfseExportHarness.model]},isPending:false,error:null});'],
      [/NfseTabContext$/, 'export const useNfseTabContext=()=>({scope:globalThis.__nfseExportHarness.scope});'],
      [/ToastNotification$/, 'export default()=>null;export const useToast=()=>({toasts:[],removeToast(){},toast:{success(){}}});'],
      [/NfseModelForm$/, 'export default()=>null;'],
      [/useNfseModelIssuerMetadata$/, 'export const useNfseModelIssuerMetadata=()=>globalThis.__nfseExportHarness.issuer;'],
      [/useNfseFiscalCatalogs$/, 'export const useNfseFiscalCatalogs=()=>globalThis.__nfseExportHarness.catalogs;'],
      [/nfse-model-export\.pdf$/, 'export function prepareNfseModelExportPdf(report){const s=globalThis.__nfseExportHarness;s.reports.push(report);if(s.failPdf)throw Error("synthetic");return{blob:s.blob,fileName:"relatorio.pdf"}}'],
      [/download-pdf-blob$/, 'export function downloadPdfBlob(blob,name){globalThis.__nfseExportHarness.downloads.push({blob,name})}'],
    ];
    mocks.forEach(([filter, contents], index) => {
      build.onResolve({ filter }, () => ({ path: String(index), namespace: 'report-mock' }));
      build.onLoad({ filter: new RegExp(`^${index}$`), namespace: 'report-mock' }, () => ({ contents, loader: 'js' }));
    });
  } }] });
const dom = new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>', { url: 'https://example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'KeyboardEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.URL.createObjectURL = blob => { state.previews.push(blob); return 'blob:synthetic-report'; };
globalThis.URL.revokeObjectURL = () => {};
const Component = require(output).default;
const root = createRoot(document.getElementById('root'));
const button = label => [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label);
const render = async () => act(async () => { root.render(React.createElement(Component)); });
const click = async target => { assert.ok(target); await act(async () => { target.click(); await new Promise(resolve => setTimeout(resolve, 10)); }); };
const flush = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });

test('Exportar opens the readonly preview, downloads its exact Blob and restores focus without changing the model', async () => {
  const original = JSON.stringify(model);
  await render();
  const opener = button(`Exportar modelo ${model.name}`);
  assert.ok(opener); assert.ok(button(`Editar modelo ${model.name}`));
  await click(opener); await flush();
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.match(document.querySelector('iframe').title, /Relatório do pré-modelo/);
  assert.equal(button('Baixar PDF').disabled, false);
  await click(button('Baixar PDF'));
  assert.equal(state.downloads.length, 1);
  assert.equal(state.downloads[0].blob, state.previews.at(-1));
  assert.equal(state.downloads[0].blob, state.blob);
  assert.equal(JSON.stringify(model), original);
  await click(button('Fechar exportação'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
  assert.notEqual(document.getElementById('root').getAttribute('aria-hidden'), 'true');
});

test('generation failure offers retry and scope absence prevents export', async () => {
  state.failPdf = true;
  await click(button(`Exportar modelo ${model.name}`)); await flush();
  assert.match(document.querySelector('[role="alert"]').textContent, /Não foi possível gerar/);
  assert.equal(button('Baixar PDF').disabled, true);
  state.failPdf = false;
  await click(button('Tentar novamente')); await flush();
  assert.ok(document.querySelector('iframe'));
  await click(button('Fechar exportação'));
  state.scope = null; await render();
  assert.equal(button(`Exportar modelo ${model.name}`).disabled, true);
});
test.after(async () => { await act(async () => root.unmount()); dom.window.close(); delete globalThis.__nfseExportHarness; await rm(directory, { recursive: true, force: true }); });
