import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };

test('batch reviews each canonical note, pauses on uncertain result and reports final numbers in top-right toasts without repeating POST', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true }); const temp = await mkdtemp(resolve(base, 'tmp/nfse-batch-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const output = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Modal} from './modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal';
    export {default as Toasts,useToast} from './modules/gestor/components/ToastNotification';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'block-live', setup(builder) { builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});', loader: 'js' })); } }] });
  await writeFile(output, compiled.outputFiles[0].contents); const { Modal, Toasts, useToast } = await import(pathToFileURL(output).href);
  const inputs = [10, 11].map(n => ({ source: { kind: 'ACADEMIC_QUEUE', id: id(n) }, label: `ALUNO SINTÉTICO ${n}`, amount: '260.00' }));
  const payload = { issuerName: 'EMITENTE SINTÉTICO', issuerCnpj: '00000000000100', recipientName: 'ALUNO CANÔNICO', recipientDocument: '00000000000',
    modelId: id(3), modelVersion: 3, modelName: 'MODELO SINTÉTICO', amount: '260.00', competenceDate: '2026-11-10', serviceDate: '2026-11-10', series: '49998', nationalServiceCode: '080201',
    nbsCode: '122020000', serviceDescription: 'SERVIÇO SINTÉTICO', opSimpNac: '3', regApTribSN: '1', municipalityCode: '2803401', municipalRegistration: null };
  const calls = []; let lost = true;
  const authorized = previewId => ({ previewId, state: 'AUTHORIZED', message: 'Autorização sintética.', payload, number: previewId === id(30) ? '2' : '3', accessKey: '1'.repeat(50) });
  const service = {
    previewSource: async (...args) => { calls.push({ action: 'PREVIEW_QUEUE', args }); return { previewId: args[2].id === id(10) ? id(30) : id(31), state: 'PREVIEWED', payload,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), capability: { available: true, reason: null } }; },
    issue: async (...args) => { calls.push({ action: 'ISSUE', args }); if (lost) { lost = false; throw new Error('Resposta perdida'); } return authorized(args[2]); },
    reconcile: async (...args) => { calls.push({ action: 'RECONCILE', args }); return authorized(args[2]); },
  };
  function App() { const { toasts, removeToast, toast } = useToast(); return React.createElement(React.Fragment, null,
    React.createElement(Toasts, { toasts, onRemove: removeToast }), React.createElement(Modal, { scope, items: inputs, service, onClose() {}, onChanged() {}, onNotice: notice => toast[notice.type](notice.title, notice.message) })); }
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const button = text => [...document.querySelectorAll('button')].find(item => item.textContent.includes(text));
  const click = async item => { assert(item); await act(async () => item.click()); await settle(); };
  try {
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(App)))); await settle();
    assert.equal(calls.filter(call => call.action === 'PREVIEW_QUEUE').length, 2);
    assert.equal(calls.filter(call => call.action === 'ISSUE').length, 0, 'Opening a batch never dispatches');
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0);
    assert.equal(button('Emitir notas').disabled, false);
    assert.equal(document.querySelector('h2').textContent, 'Emitir notas');
    assert(button('Atualizar dados do lote'));
    assert([...document.querySelectorAll('details')].every(item => item.querySelector('summary').textContent === 'Ver dados da nota' && !item.open));
    const send = button('Emitir notas'); await act(async () => { send.click(); send.click(); }); await settle();
    assert.equal(calls.filter(call => call.action === 'ISSUE').length, 1); assert.equal(button('Emitir notas').disabled, true);
    assert(document.body.textContent.includes('Há resultado não confirmado'));
    const region = document.querySelector('[aria-label="Notificações"]'); assert(region); assert(region.className.includes('sm:right-6'));
    assert(region.textContent.includes('Lote pausado')); assert(!region.textContent.includes('autorizada'));
    await click(button('Consultar esta operação'));
    assert(!document.querySelector('[aria-label="Notificações"]').textContent.includes('NFS-e nº 2 autorizada'), 'Reading history is not a new issuance confirmation');
    assert(document.body.textContent.includes('NFS-e nº 2'));
    assert.equal(calls.filter(call => call.action === 'ISSUE').length, 1);
    await click(button('Emitir notas')); assert.equal(calls.filter(call => call.action === 'ISSUE').length, 2);
    assert(document.body.textContent.includes('2 de 2 nota(s) autorizada(s)'));
    assert(document.querySelector('[aria-label="Notificações"]').textContent.includes('NFS-e nº 3 autorizada'));
    for (let i = 0; i < window.sessionStorage.length; i++) assert.deepEqual(Object.keys(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(i)))).sort(), ['previewId', 'requestId']);
  } finally { await act(async () => root.unmount()); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
});
