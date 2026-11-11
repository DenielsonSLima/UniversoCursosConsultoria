import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;
const { JSDOM } = await import(process.env.NFSE_TEST_JSDOM_MODULE || 'jsdom');
const directory = await mkdtemp(join(tmpdir(), 'nfse-issued-export-ui-'));
const base = new URL('./', import.meta.url);
const scope = { poloId: '00000000-0000-4000-8000-000000000001', contextKey: 'synthetic-context', environment: 'PRODUCAO', month: '2026-11' };
const filters = { search: '', dateFrom: '2026-11-01', dateTo: '2026-11-30', courseType: '', origin: '' };
const state = { scope, enabled: true, period: { filters, isSettling: false }, fail: false, pending: false, resolve: null,
  downloads: [], previews: [], revoked: [], calls: [], reports: [], blob: new Blob(['%PDF-synthetic'], { type: 'application/pdf' }) };
globalThis.__issuedExport = state;
const output = join(directory, 'entry.cjs');
await build({ entryPoints: [fileURLToPath(new URL('NfseIssuedExportAction.tsx', base))], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  outfile: output, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'issued-export-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(react|react-dom)(\/|$)/ }, args => ({ path: require.resolve(args.path), external: true }));
    const mocks = [
      [/NfseIssuedPeriodContext$/, 'export const useNfseIssuedPeriod=()=>globalThis.__issuedExport.period;'],
      [/nfse-issued-export\.service$/, `export async function fetchNfseIssuedExportReport(scope,filters,signal){const s=globalThis.__issuedExport;s.calls.push({scope,filters,signal});if(s.fail)throw Error('Falha sintética de consulta');if(s.pending)await new Promise(resolve=>s.resolve=resolve);return{scope,filters,rows:[],totalItems:0,totalAmount:'0.00',generatedAt:'2026-11-11T12:00:00Z'}}`],
      [/nfse-issued-export\.resources$/, 'export function prepareNfseIssuedExportPdf(report){const s=globalThis.__issuedExport;s.reports.push(report);return {blob:s.blob,fileName:"emitidas.pdf"}}'],
      [/download-pdf-blob$/, 'export function downloadPdfBlob(blob,fileName){globalThis.__issuedExport.downloads.push({blob,fileName})}'],
    ];
    mocks.forEach(([filter, contents], index) => {
      builder.onResolve({ filter }, () => ({ path: String(index), namespace: 'fixture' }));
      builder.onLoad({ filter: new RegExp(`^${index}$`), namespace: 'fixture' }, () => ({ contents, loader: 'js' }));
    });
  } }] });
const dom = new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>', { url: 'https://example.invalid', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'KeyboardEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.URL.createObjectURL = blob => { state.previews.push(blob); return `blob:synthetic-${state.previews.length}`; };
globalThis.URL.revokeObjectURL = url => state.revoked.push(url);
const Component = require(output).default;
const root = createRoot(document.getElementById('root'));
const button = label => [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label);
const render = async () => act(async () => { root.render(React.createElement(Component, { scope: state.scope, enabled: state.enabled })); });
const flush = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async target => { assert.ok(target); target.focus(); await act(async () => target.click()); await flush(); };

test('Exportar sits beside tabs, opens internal-model preview, downloads same Blob, closes and restores focus', async () => {
  const source = await readFile(new URL('../../EmissorNfsePage.tsx', base), 'utf8');
  assert.match(source, /nfse-tabs-with-actions[\s\S]*FinancialUnderlineTabs[\s\S]*tab === 'emitidas' && <NfseIssuedExportAction/);
  await render(); const opener = button('Exportar'); await click(opener);
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.match(document.querySelector('aside').textContent, /ModelosModelo interno/);
  assert.match(document.querySelector('iframe').title, /Modelo interno/);
  assert.equal(button('Baixar PDF').disabled, false);
  assert.deepEqual(state.calls.at(-1).filters, filters);
  await click(button('Baixar PDF'));
  assert.equal(state.downloads.at(-1).blob, state.previews.at(-1));
  assert.equal(state.downloads.at(-1).blob, state.blob);
  await click(button('Fechar exportação'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
  assert.notEqual(document.getElementById('root').getAttribute('aria-hidden'), 'true');
  assert.ok(state.revoked.length);
  await click(opener);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('failure blocks download, retries the complete report and handles empty results', async () => {
  state.fail = true; await click(button('Exportar'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Falha sintética/);
  assert.equal(button('Baixar PDF').disabled, true);
  state.fail = false; await click(button('Tentar novamente'));
  assert.ok(document.querySelector('iframe'));
  assert.equal(state.reports.at(-1).totalItems, 0);
  await click(button('Fechar exportação'));
});

test('closing while loading aborts stale work and does not create a later preview', async () => {
  state.pending = true; await click(button('Exportar'));
  assert.equal(button('Baixar PDF').disabled, true);
  const call = state.calls.at(-1), previewCount = state.previews.length;
  await click(button('Fechar exportação'));
  assert.equal(call.signal.aborted, true);
  state.pending = false; state.resolve(); await flush();
  assert.equal(state.previews.length, previewCount);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('scope, dates, permission and unsettled search guard export and stale modal', async () => {
  await click(button('Exportar'));
  state.enabled = false; await render(); await flush();
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(button('Exportar').disabled, true);
  state.enabled = true; await render(); assert.equal(document.querySelector('[role="dialog"]'), null);
  state.period = { filters: { ...filters, dateFrom: '2026-12-01' }, isSettling: false }; await render();
  assert.equal(button('Exportar').disabled, true);
  state.period = { filters, isSettling: true }; await render(); assert.equal(button('Exportar').disabled, true);
  state.period = { filters, isSettling: false }; state.scope = null; await render(); assert.equal(button('Exportar').disabled, true);
  state.scope = scope; await render(); await click(button('Exportar'));
  state.scope = { ...scope, environment: 'HOMOLOGACAO' }; await render(); await flush();
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test.after(async () => { await act(async () => root.unmount()); dom.window.close(); delete globalThis.__issuedExport; await rm(directory, { recursive: true, force: true }); });
