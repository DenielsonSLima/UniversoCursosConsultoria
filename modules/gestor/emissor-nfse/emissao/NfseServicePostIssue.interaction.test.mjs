import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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
const payload = n => ({ issuerName: 'EMITENTE SINTÉTICO', issuerCnpj: '00000000000100',
  recipientName: `PARCEIRO SINTÉTICO ${n}`, recipientDocument: '00000000000000', modelId: id(3), modelVersion: 1,
  modelName: 'MODELO SINTÉTICO', amount: '260.00', competenceDate: '2026-11-10', serviceDate: '2026-11-10',
  series: '49998', nationalServiceCode: '080201', nbsCode: '122020000', serviceDescription: 'SERVIÇO SINTÉTICO',
  opSimpNac: '3', regApTribSN: '1', municipalityCode: '2803401', municipalRegistration: null });
const result = n => ({ previewId: id(n + 20), state: 'AUTHORIZED', message: 'Autorização sintética.',
  payload: payload(n), number: String(n), accessKey: String(n % 10).repeat(50) });
const query = data => ({ data, error: null, isPending: false, isFetching: false, refetch: async () => {} });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
const tab = label => [...document.querySelectorAll('[role="tab"]')].find(item => item.textContent === label);
const click = async element => { assert(element); await act(async () => element.click()); await settle(); };

async function compile(temp) {
  const output = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Page} from './modules/gestor/emissor-nfse/EmissorNfsePage';
    export {default as Modal} from './modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';
    export {nfseQueryKeys} from './modules/gestor/emissor-nfse/queries/nfse.queryKeys';
    export {NfseAccessError} from './modules/gestor/emissor-nfse/services/nfse.errors';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output,
    loader: { '.css': 'empty' }, plugins: [{ name: 'isolated-post-issue', setup(builder) {
      // This suite tests post-authorization routing, not elapsed time. Real pacing
      // is covered by NfseBatchEmissionModal.interaction and batch core tests.
      builder.onLoad({ filter: /nfse-batch\.core\.ts$/ }, async args => ({ loader: 'ts',
        contents: (await readFile(args.path, 'utf8')).replace('options.commandIntervalMs ?? 8000', 'options.commandIntervalMs ?? 0')
          .replace('options.commandRestMs ?? (options.commandIntervalMs === 0 ? 0 : 5000)', 'options.commandRestMs ?? 0') }));
      const fixture = (filter, path) => builder.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
      fixture(/useNfseQueries$/, 'queries');
      fixture(/useNfseQueue$/, 'queue');
      fixture(/useNfsePartnerServices$/, 'services');
      fixture(/(?:useNfseRealtime|useNfseQueueRealtime|useNfsePartnerServicesRealtime|useNfseBatchRealtime)$/, 'realtime');
      fixture(/(?:PrepararNfseTab|PendentesNfseTab|CanceladasNfseTab|ErrosNfseTab|ModelosNfseTab|NfsePartnerServiceModal|NfseSourceEmissionModal|NfseIssuedTotalMetric|NfseIssuedExportAction|NfseEnvironmentStatus)$/, 'empty');
      fixture(/useNfseNationalHealth$/, 'health');
      fixture(/useNfseDownloads$/, 'downloads');
      fixture(/nfse-individual\.service$/, 'individual');
      fixture(/NfseXmlViewerModal$/, 'viewer');
      fixture(/lib\/supabase$/, 'blocked');
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: base, contents: ({
        queries: `import {useQuery} from '@tanstack/react-query';
          import {nfseQueryKeys} from './modules/gestor/emissor-nfse/queries/nfse.queryKeys';
          export const useNfseWorkspace=()=>globalThis.__postIssue.workspace();
          export const useNfseDocuments=(scope,filters,enabled)=>useQuery({queryKey:nfseQueryKeys.documents(scope,filters),
            enabled:!!scope&&enabled,retry:false,queryFn:()=>globalThis.__postIssue.documents(filters)});`,
        queue: 'export const useNfseQueue=()=>({data:{summary:{preparedCount:0}},error:null});',
        services: `export const useNfsePartnerServices=()=>globalThis.__postIssue.services();
          export const useRemoveNfsePartnerServices=()=>({isPending:false,mutateAsync:async()=>{throw new Error('Removal forbidden')}});`,
        realtime: `export const useNfseRealtime=()=>{}; export const useNfseQueueRealtime=()=>{};
          export const useNfsePartnerServicesRealtime=()=>{}; export const useNfseBatchRealtime=()=>{};`,
        empty: 'export default function Empty(){return null;}',
        health: 'export const useNfseNationalHealth=()=>({data:null,error:null});',
        downloads: 'export const useNfseDownloads=()=>({busy:false,message:null,error:null,cancel(){},download(){throw new Error("Download forbidden in navigation test")}});',
        individual: `export const nfseIndividualService={previewSource:(...args)=>globalThis.__postIssue.service.previewSource(...args),
          issue:(...args)=>globalThis.__postIssue.service.issue(...args),observe:(...args)=>globalThis.__postIssue.service.observe(...args),
          reconcile:(...args)=>globalThis.__postIssue.service.reconcile(...args)};`,
        viewer: `import React from 'react'; export default function Viewer(p){globalThis.__postIssue.opened.push(p.document);
          return React.createElement('div',{role:'dialog','aria-label':'Prévia da NFS-e'},
            React.createElement('p',null,'Prévia NFS-e '+p.document.number),React.createElement('button',{onClick:p.onClose},'Fechar prévia'));}`,
        blocked: 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});',
      })[args.path] }));
    } }] });
  await writeFile(output, compiled.outputFiles[0].contents);
  return import(pathToFileURL(output).href);
}

test('service authorization opens Issued and the last canonical preview only when the entire service batch finishes', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-service-post-issue-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const finished = [], sent = [], opened = [], filtersRead = [];
  let includeIssued = false;
  const rows = [10, 11].map(n => ({ id: id(n), partnerName: `PARCEIRO SINTÉTICO ${n}`, modelName: 'MODELO SINTÉTICO',
    serviceDescription: 'SERVIÇO SINTÉTICO', serviceDate: '2026-11-10', amount: '260.00', partnerType: 'PJ',
    canRemove: true, receivableAction: 'NONE', state: null }));
  const service = {
    previewSource: async (_scope, _requestId, source) => {
      const n = source.id === id(10) ? 10 : 11;
      return { previewId: id(n + 20), state: 'PREVIEWED', payload: payload(n),
        expiresAt: new Date(Date.now() + 60_000).toISOString(), capability: { available: true, reason: null } };
    },
    issue: async (_scope, _requestId, previewId) => new Promise(resolve => sent.push({ previewId, resolve })),
    observe: async () => { throw new Error('Unexpected observation'); },
    reconcile: async () => { throw new Error('Unexpected reconciliation'); },
  };
  const workspaceData = query({ summary: {}, classes: [], models: [], capabilities: {}, readiness: {} });
  const servicesData = query({ rows, totalAmount: '520.00', totalItems: 2, pageSize: 25 });
  globalThis.__postIssue = {
    service, opened, workspace: () => workspaceData, services: () => servicesData,
    documents: filters => { filtersRead.push(filters); return { rows: includeIssued ? [...finished] : [], page: 1, pageSize: 25, totalItems: includeIssued ? finished.length : 0 }; },
  };
  const { Page, Modal, NfseTabContext, nfseQueryKeys, NfseAccessError } = await compile(temp);
  const root = createRoot(document.getElementById('root'));
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 60_000 }, mutations: { gcTime: 0 } } });
  const oldFilterKey = nfseQueryKeys.documents(scope, { status: 'EMITIDA', issuedState: 'ACTIVE', search: 'ALUNO', origin: 'ALUNO', dateFrom: '2026-10-01', dateTo: '2026-10-31' });
  client.setQueryData(oldFilterKey, { rows: [], page: 1, pageSize: 25, totalItems: 0 });
  client.setQueryData(nfseQueryKeys.documents({ ...scope, month: '2026-10' }, { status: 'EMITIDA', issuedState: 'ACTIVE' }), { rows: [] });
  const wrap = children => React.createElement(QueryClientProvider, { client }, React.createElement(React.StrictMode, null, children));
  const complete = async n => {
    const authorized = result(n);
    finished.push({ id: authorized.previewId, operationId: authorized.previewId, sourceKind: 'PARTNER_SERVICE', sourceId: id(n),
      ...authorized, status: 'EMITIDA', studentName: payload(n).recipientName, classLabel: 'Serviço',
      modelLabel: payload(n).modelName, amount: '260.00', retryable: false, errorCode: null, errorMessage: null });
    await act(async () => sent.find(call => call.previewId === authorized.previewId).resolve(authorized)); await settle();
  };
  try {
    await act(async () => root.render(wrap(React.createElement(Page, { poloId: id(2), contextKey: id(1), isMatriz: true })))); await settle();
    await click(tab('Serviços'));
    await click(document.querySelector('input[aria-label="Selecionar serviços desta página"]'));
    await click(button('Emitir notas (2)'));
    assert.equal(sent.length, 1, 'One click begins the serial batch exactly once under StrictMode');
    await complete(10);
    assert.equal(sent.length, 2);
    assert.equal(tab('Serviços').getAttribute('aria-selected'), 'true');
    assert.equal(opened.length, 0, 'The first authorization must not interrupt the remaining service');
    await complete(11); await settle();
    assert.equal(tab('Emitidas').getAttribute('aria-selected'), 'true');
    assert.equal(document.querySelector('[aria-label="Fechar lote"]'), null, 'The issuance modal is closed');
    assert(document.querySelector('[aria-label="Prévia da NFS-e"]'));
    assert.equal(opened.at(-1).id, id(31)); assert.equal(opened.at(-1).number, '11');
    assert.equal(opened.at(-1).accessKey, result(11).accessKey);
    assert.equal(opened.at(-1).sourceKind, 'PARTNER_SERVICE'); assert.equal(opened.at(-1).sourceId, id(11));
    assert.equal(filtersRead.at(-1).search, ''); assert.equal(filtersRead.at(-1).origin, '');
    assert.deepEqual(client.getQueryData(oldFilterKey).rows, [], 'Old filtered Active cache is retained and cannot suppress a new authorization');
    assert.equal(document.querySelectorAll('.nfse-issued-rows tbody tr').length, 0, 'The preview opens even when the refreshed period list excludes the newly authorized note');
    await click(button('Fechar prévia'));
    await click(tab('Serviços')); await click(tab('Emitidas'));
    assert.equal(document.querySelector('[aria-label="Prévia da NFS-e"]'), null, 'A consumed authorization must not reopen on tab navigation');
    assert.equal(sent.length, 2, 'Navigating and previewing cannot issue another note');

    includeIssued = true;
    window.sessionStorage.clear(); finished.length = 0; sent.length = 0; opened.length = 0;
    await click(tab('Serviços'));
    await click(button('Emitir NFS-e'));
    assert.equal(sent.length, 1);
    await complete(10); await settle();
    assert.equal(tab('Emitidas').getAttribute('aria-selected'), 'true');
    assert.equal(opened.at(-1).id, id(30), 'Individual service issuance uses the same authorized preview flow');
    assert.equal(sent.length, 1);

    const activeKey = nfseQueryKeys.documents(scope, filtersRead.at(-1));
    await act(async () => client.setQueryData(activeKey, { rows: [], page: 1, pageSize: 25, totalItems: 0 })); await settle();
    assert.equal(document.querySelector('[aria-label="Prévia da NFS-e"]'), null, 'After a canonical row was observed, its later removal retains ordinary fail-closed behavior');
    const cancelled = { ...finished[0], state: 'CANCELLED', cancelPreviewId: id(99) };
    const cancelledKey = nfseQueryKeys.documents(scope, { status: 'EMITIDA', issuedState: 'CANCELLED' });
    await act(async () => { client.setQueryData(cancelledKey, { rows: [cancelled] });
      return client.invalidateQueries({ queryKey: cancelledKey, refetchType: 'none' }); }); await settle();
    assert.equal(opened.at(-1).state, 'CANCELLED', 'Canonical cancellation wins even from an invalidated cancelled projection');
    await act(async () => client.getQueryCache().find({ queryKey: activeKey, exact: true })
      .setState({ error: new NfseAccessError(), status: 'error' })); await settle();
    assert.equal(document.querySelector('[aria-label="Prévia da NFS-e"]'), null, 'Access denial must also hide the recent-authorization preview');

    for (const [label, kinds, override, operation] of [
      ['student', ['ACADEMIC_QUEUE'], {}],
      ['mixed', ['PARTNER_SERVICE', 'ACADEMIC_QUEUE'], {}],
      ['missing identity', ['PARTNER_SERVICE'], { accessKey: null }],
      ['rejected service', ['PARTNER_SERVICE'], { state: 'REJECTED', number: null, accessKey: null }],
      ['uncertain service', ['PARTNER_SERVICE'], { state: 'AWAITING_CONFIRMATION', number: null, accessKey: null }],
      ['known cancelled service', ['PARTNER_SERVICE'], {}, { state: 'CANCELLED', cancelPreviewId: id(99) }],
      ['cancellation discovered in result', ['PARTNER_SERVICE'], { cancelPreviewId: id(99) }],
    ]) {
      window.sessionStorage.clear();
      const callbacks = [];
      const inputs = kinds.map((kind, index) => ({ source: { kind, id: id(70 + index) }, label: label, amount: '260.00', operation }));
      const isolated = { ...service, previewSource: async (_scope, _request, source) => ({ previewId: id(source.id === id(70) ? 90 : 91),
        state: 'PREVIEWED', payload: payload(10), expiresAt: new Date(Date.now() + 60_000).toISOString(), capability: { available: true, reason: null } }),
      issue: async (_scope, _request, previewId) => ({ ...result(10), previewId, ...override }) };
      await act(async () => root.render(wrap(React.createElement(NfseTabContext.Provider, { value: { scope, canRead: true,
        onServiceAuthorized: (...args) => callbacks.push(args) } }, React.createElement(Modal, { key: label, scope, items: inputs,
          service: isolated, issueRequested: true, onClose() {}, onChanged() {} }))))); await settle();
      assert.equal(callbacks.length, 0, `${label} must keep the existing issuance flow`);
      assert(document.querySelector('[aria-label="Fechar lote"]'), `${label} must remain in the issuance modal`);
      assert(document.body.textContent.includes(override.state === 'REJECTED' ? 'com impedimento'
        : override.state === 'AWAITING_CONFIRMATION' ? 'Aguardando retorno fiscal'
          : `${kinds.length} de ${kinds.length} nota(s) autorizada(s)`));
    }
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close(); delete globalThis.__postIssue;
    await rm(temp, { recursive: true, force: true });
  }
});
