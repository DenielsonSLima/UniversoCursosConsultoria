import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';
import { makeCaixaReportFixture } from './caixa-report.fixture.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.CAIXA_UI_JSDOM_PATH || process.env.CAIXA_JSDOM_PATH || 'jsdom');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');

test('modal em tela cheia troca os dois PDFs do mesmo snapshot, baixa o blob exibido e descarta gerações antigas', async () => {
  const dom = new JSDOM('<!doctype html><button id="origin">PDF</button><div id="root"></div>', { url: 'http://localhost/' });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'URL', 'IS_REACT_ACT_ENVIRONMENT', '__caixaPdfTest'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globals.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] }));
  const f = globalThis.__caixaPdfTest = { reads: [], builds: [], downloads: [], created: [], revoked: [], report: makeCaixaReportFixture() };
  URL.createObjectURL = blob => { const url = `blob:synthetic-${f.created.length}`; f.created.push({ blob, url }); return url; };
  URL.revokeObjectURL = url => f.revoked.push(url);
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Rede não permitida neste smoke.'); };
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./CaixaReportPreviewModal.tsx', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', '@tanstack/react-query'], plugins: [{ name: 'controlled-report', setup(plugin) {
      plugin.onResolve({ filter: /caixa-report\.service$/ }, () => ({ path: 'service', namespace: 'fixture' }));
      plugin.onResolve({ filter: /caixa-report\.pdf$/ }, () => ({ path: 'pdf', namespace: 'fixture' }));
      plugin.onResolve({ filter: /download-pdf-blob$/ }, () => ({ path: 'download', namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: ({
        service: `const f=globalThis.__caixaPdfTest;export const caixaReportQueryKey=(p,c)=>['caixa-report','monthly',p||'todos',c];export const caixaReportQueryOptions=(p,c,enabled)=>({queryKey:caixaReportQueryKey(p,c),enabled,retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:false,queryFn:async()=>{f.reads.push({p,c});return f.report}});`,
        pdf: `const f=globalThis.__caixaPdfTest;export const buildCaixaReportPdf=(report,progress,kind)=>new Promise((done,fail)=>f.builds.push({report,progress,kind,done,fail}));export const buildCaixaReportFileName=(c,s,k)=>c+'-'+s+'-'+k+'.pdf';export const getCaixaReportPdfErrorMessage=e=>e.message;`,
        download: `export const downloadPdfBlob=(blob,fileName)=>globalThis.__caixaPdfTest.downloads.push({blob,fileName});`,
      })[args.path] }));
    } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let props = { open: true, poloId: 'polo-a', competencia: '2026-08', onClose: () => {} };
  const render = changes => act(async () => { props = { ...props, ...changes }; root.render(React.createElement(QueryClientProvider,
    { client }, React.createElement(module.exports.CaixaReportPreviewModal, props))); });
  const waitFor = async (condition, message) => {
    for (let index = 0; !condition() && index < 80; index++) await act(async () => { await setTimeout(5); });
    assert(condition(), message);
  };
  const click = async label => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    assert(button, label); await act(async () => button.click()); };
  const finish = async (index, content) => { const blob = new Blob([content], { type: 'application/pdf' });
    await act(async () => f.builds[index].done(blob)); await waitFor(() => document.querySelector('iframe'), 'Prévia pronta'); return blob; };
  try {
    document.getElementById('origin').focus();
    await render({}); await waitFor(() => f.builds.length === 1, 'Completo inicia automaticamente');
    assert(document.querySelector('[role="dialog"]').classList.contains('h-[100dvh]'));
    assert.equal(document.body.style.overflow, 'hidden'); assert.equal(f.builds[0].kind, 'COMPLETO');
    const first = await finish(0, 'complete-one');
    await click('Baixar PDF'); assert.equal(f.downloads.at(-1).blob, first);
    assert.match(document.querySelector('iframe').title, /completa/);
    await click('Resumido'); await waitFor(() => f.builds.length === 2, 'Resumido inicia');
    assert.equal(document.querySelector('iframe'), null, 'O PDF anterior não aparece sob o novo tipo');
    await click('Completo'); await waitFor(() => f.builds.length === 3, 'Nova geração Completo');
    await act(async () => f.builds[1].done(new Blob(['late-summary'])));
    assert.equal(document.querySelector('iframe'), null, 'Resposta antiga é descartada');
    const complete = await finish(2, 'complete-two');
    assert.equal(f.reads.length, 1, 'Os dois tipos compartilham uma consulta e o mesmo snapshot');
    assert(f.builds.every(call => call.report === f.builds[0].report));
    await click('Baixar PDF'); assert.equal(f.downloads.at(-1).blob, complete);
    await click('Resumido'); await waitFor(() => f.builds.length === 4, 'Resumo atual');
    const concise = await finish(3, 'summary-current');
    await click('Baixar PDF'); assert.equal(f.downloads.at(-1).blob, concise);
    assert.match(f.downloads.at(-1).fileName, /RESUMIDO\.pdf$/); assert.match(document.querySelector('iframe').title, /resumida/);
    f.report = globalThis.structuredClone(f.report); f.report.resumo.meta.escopoRotulo = 'Polo B';
    await render({ poloId: 'polo-b' });
    assert.equal(document.querySelector('iframe'), null, 'Trocar escopo não exibe o documento do polo anterior');
    await waitFor(() => f.builds.length === 5, 'Novo escopo possui novo snapshot');
    assert.equal(f.reads.length, 2); assert.notEqual(f.builds[4].report, f.builds[0].report);
    await render({ open: false });
    await act(async () => f.builds[4].done(new Blob(['late-closed'])));
    assert.equal(document.querySelector('[role="dialog"]'), null); assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement.id, 'origin');
    assert(f.created.every(({ url }) => f.revoked.includes(url)), 'URLs de prévia são liberadas');
    await render({ open: true }); await waitFor(() => f.builds.length === 6, 'Reabertura consulta snapshot atual');
    assert.equal(f.builds[5].kind, 'COMPLETO', 'O padrão de reabertura preserva o relatório completo');
    await act(async () => f.builds[5].fail(new Error('O conteúdo não cabe nas duas páginas.')));
    await waitFor(() => document.querySelector('[role="alert"]'), 'Falha explícita de composição');
    assert.equal(document.querySelector('iframe'), null);
    assert([...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Baixar PDF').disabled);
    const completeTab = document.querySelector('[data-kind="COMPLETO"]');
    assert.equal(completeTab.tabIndex, 0);
    await act(async () => completeTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    assert.equal(document.activeElement.dataset.kind, 'RESUMIDO');
    assert.equal(document.activeElement.getAttribute('aria-selected'), 'true');
    assert.equal(completeTab.tabIndex, -1);
    assert.equal(networkCalls, 0);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
