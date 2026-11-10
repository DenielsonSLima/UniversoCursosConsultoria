import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const preflight = { checkedAt: new Date().toISOString(), environment: 'HOMOLOGACAO', referenceDate: '2026-11-01',
  checks: [{ code: 'MTLS', status: 'PASSED', message: 'Conexão verificada.' }],
  pilot: { available: true, reason: null }, certificateExpiresAt: '2027-01-01T00:00:00Z' };
const preview = { previewId: id(3), expiresAt: new Date(Date.now() + 600_000).toISOString(),
  capability: { available: true, reason: null }, payload: { synthetic: true, issuerName: 'Emitente de teste',
    issuerDocument: 'CNPJ sintético', recipientName: 'Tomador de teste', recipientDocument: 'CNPJ sintético',
    serviceDescription: 'Teste sem valor fiscal', nationalServiceCode: '080201', competence: '2026-11-10',
    serviceDate: '2026-11-10', serviceAmount: '1.00', opSimpNac: '3', issTreatment: 'TRIBUTAVEL' } };

test('homologation requires checks and review; lost issue response only permits reconciliation', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-homologation-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/homologacao/NfseHomologationPanel.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    outfile: bundle, loader: { '.css': 'empty' }, plugins: [{ name: 'no-live-client', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden in UI smoke")}});', loader: 'js',
      }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { default: Panel } = await import(pathToFileURL(bundle).href);
  const calls = [];
  let pendingIssue;
  const service = {
    preflight: async value => { calls.push({ action: 'check', scope: value }); return preflight; },
    preview: async (value, requestId) => { calls.push({ action: 'preview', scope: value, requestId }); return preview; },
    issue: async (value, requestId, previewId) => {
      calls.push({ action: 'issue', scope: value, requestId, previewId });
      return new Promise((resolve, reject) => { pendingIssue = { resolve, reject }; });
    },
    reconcile: async (value, requestId, previewId) => {
      calls.push({ action: 'reconcile', scope: value, requestId, previewId });
      return { state: 'AUTHORIZED', attemptId: id(4), number: '1', accessKey: '1'.repeat(50), message: 'Teste confirmado.' };
    },
  };
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.includes(text));
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  try {
    await act(async () => root.render(React.createElement(Panel, { scope, service })));
    assert.equal(calls.length, 0);
    assert.equal(button('Preparar nota').disabled, true);
    assert.equal(button('Emitir uma').disabled, true);
    await click(button('Verificar conexão'));
    assert(document.body.textContent.includes('Conexão verificada.'));
    assert.equal(button('Preparar nota').disabled, false);
    await click(button('Preparar nota'));
    assert(document.body.textContent.includes('Tomador de teste'));
    assert(document.body.textContent.includes('Optante pelo Simples Nacional · não MEI'));
    assert(document.body.textContent.includes('080201'));
    assert(document.body.textContent.includes('IBS/CBS'));
    assert.equal(button('Emitir uma').disabled, true);
    await click(document.querySelector('input[type="checkbox"]'));
    assert.equal(button('Emitir uma').disabled, false);
    const emit = button('Emitir uma');
    await act(async () => { emit.click(); emit.click(); }); await settle();
    assert.equal(calls.filter(call => call.action === 'issue').length, 1);
    assert.equal(button('Transmitindo').disabled, true);
    await act(async () => pendingIssue.reject(new Error('Falha sintética de comunicação'))); await settle();
    assert.equal(button('Emitir uma').disabled, true);
    assert.equal(button('Preparar novo').disabled, true);
    assert(document.body.textContent.includes('O envio ainda não tem resultado confirmado'));
    const stored = Object.values(dom.window.sessionStorage);
    const pendingStorageKey = dom.window.sessionStorage.key(0);
    assert.equal(stored.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(stored[0])).sort(), ['previewId', 'requestId']);
    await act(async () => root.render(React.createElement(Panel, { key: 'reopened', scope, service })));
    await settle();
    assert(document.body.textContent.includes('O envio ainda não tem resultado confirmado'));
    assert.equal(button('Preparar nota').disabled, true);
    await click(button('Consultar resultado'));
    const issue = calls.find(call => call.action === 'issue'), reconciliation = calls.find(call => call.action === 'reconcile');
    assert.equal(issue.requestId, calls.find(call => call.action === 'preview').requestId);
    assert.equal(issue.requestId, reconciliation.requestId); assert.equal(issue.previewId, reconciliation.previewId);
    assert(document.body.textContent.includes('Nota de teste autorizada'));
    assert.equal(button('Emitir uma').disabled, true);
    assert.equal(dom.window.sessionStorage.length, 0);
    await act(async () => root.render(React.createElement(Panel, { key: 'blocked', scope,
      service: { ...service, preflight: async () => ({ ...preflight, pilot: { available: false, reason: 'PREFLIGHT_BLOCKED' } }) } })));
    await click(button('Verificar conexão'));
    assert.equal(button('Preparar nota').disabled, true);
    let recoverPreflight = false;
    const preflightError = 'Não foi possível confirmar a verificação de acesso.';
    await act(async () => root.render(React.createElement(Panel, { key: 'failed-check', scope,
      service: { ...service, preflight: async () => {
        if (!recoverPreflight) throw new Error(preflightError);
        return preflight;
      } } })));
    await click(button('Verificar conexão'));
    assert(document.querySelector('.nfse-homologation [role="alert"]').textContent.includes(preflightError));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 4_700)); });
    assert.equal(document.querySelector('[aria-label="Notificações"]'), null);
    assert(document.querySelector('.nfse-homologation [role="alert"]').textContent.includes(preflightError));
    assert.equal(button('Verificar conexão').disabled, false);
    recoverPreflight = true;
    await click(button('Verificar conexão'));
    assert.equal(document.querySelector('.nfse-homologation [role="alert"]'), null);
    assert.equal(button('Preparar nota').disabled, false);
    const issuedBeforeRejection = calls.filter(call => call.action === 'issue').length;
    let rejectedReads = 0;
    dom.window.sessionStorage.setItem(pendingStorageKey, JSON.stringify({ requestId: id(40), previewId: id(41) }));
    await act(async () => root.render(React.createElement(Panel, { key: 'rejected-result', scope,
      service: { ...service, reconcile: async () => {
        rejectedReads++;
        return { state: 'REJECTED', attemptId: id(41), message: 'Teste rejeitado pela SEFIN: E0037.' };
      } } })));
    await settle(); await click(button('Consultar resultado'));
    assert(document.body.textContent.includes('E0037'));
    assert(document.body.textContent.includes('convênio do município emissor neste ambiente de homologação'));
    assert(document.body.textContent.includes('não comprova a situação em produção'));
    assert.equal(button('Emitir uma').disabled, true);
    await settle();
    assert.equal(rejectedReads, 1);
    assert.equal(calls.filter(call => call.action === 'issue').length, issuedBeforeRejection);
    const callCount = calls.length;
    await act(async () => root.render(React.createElement(Panel, { key: 'production', scope: { ...scope, environment: 'PRODUCAO' }, service })));
    assert(document.body.textContent.includes('somente em homologação'));
    assert.equal(button('Verificar conexão'), undefined); assert.equal(calls.length, callCount);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    await rm(temp, { recursive: true, force: true });
  }
});
