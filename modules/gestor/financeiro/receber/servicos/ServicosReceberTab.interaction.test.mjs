import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('services read canonical pages, recover in-flight realtime/reconnection and receive through the canonical partial-payment flow', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/service-receivables-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const f = globalThis.__serviceUi = { pages: [], summaries: [], channels: [], payments: [], callbacks: [], removed: 0, first: null,
    row: { id: id(1), poloId: id(2), poloNome: 'Unidade sintética', clienteNome: 'Parceiro sintético', descricao: 'Serviço sintético · 1/3',
      valor: 33.34, categoria: 'OUTROS_CREDITOS', dataVencimento: '2026-11-30', status: 'PENDENTE',
      nfseNumber: '7', nfseInstallmentNumber: 1, nfseInstallmentCount: 3, nfseFiscalCancelledAt: null } };
  const bundle = resolve(temp, 'test.mjs');
  await build({ entryPoints: [resolve(base, 'modules/gestor/financeiro/receber/servicos/ServicosReceberTab.tsx')], outfile: bundle,
    bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-services', setup(b) {
      b.onResolve({ filter: /servicos-receber\.service$/ }, () => ({ path: 'service', namespace: 'fixture' }));
      b.onResolve({ filter: /useFinanceiroSharedQueries$/ }, () => ({ path: 'shared', namespace: 'fixture' }));
      b.onResolve({ filter: /financial-payment\.service$/ }, () => ({ path: 'payment', namespace: 'fixture' }));
      b.onResolve({ filter: /\/FinancialPaymentModal$/ }, () => ({ path: 'modal', namespace: 'fixture' }));
      b.onResolve({ filter: /\/OtherCreditPaymentModal$/ }, () => ({ path: 'bolepix', namespace: 'fixture' }));
      b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: base, contents: ({
        service: `const f=globalThis.__serviceUi;export const serviceReceivablesService={page:async(filters,page,pageSize)=>{f.pages.push({filters,page,pageSize});if(f.pages.length===1)return new Promise(done=>{f.first=()=>done({rows:[{...f.row}],totalItems:1,page,pageSize})});return {rows:[{...f.row}],totalItems:1,page,pageSize}},summary:async filters=>{f.summaries.push(filters);return {allValue:33.34,receivedValue:10,pendingValue:23.34,overdueCount:0}}};`,
        shared: `export const useFinanceiroSharedQueries=()=>({accountsQuery:{data:[],isError:false}});`,
        payment: `export const confirmFinancialPayment=async(kind,input,fingerprint)=>{const f=globalThis.__serviceUi;f.payments.push({kind,input,fingerprint});f.row={...f.row,paymentSummary:{originalAmount:'33.34',previouslyPaid:'10.00',remainingBefore:'23.34',status:'PENDENTE',hasEvents:true}};return {success:true,paymentId:'synthetic-payment',preview:{status:'PENDENTE',paymentAmount:'10.00',remainingAfter:'23.34'}}};`,
        modal: `import React from 'react';export function FinancialPaymentModal(p){return React.createElement('section',{role:'dialog'},React.createElement('p',{},'Pagamento canônico '+p.sourceKind),React.createElement('button',{onClick:()=>p.onConfirm({input:{sourceId:p.sourceId,requestId:'same-attempt'},fingerprint:'bound-fingerprint'})},'Confirmar parcial sintético'));}`,
        bolepix: `export const OtherCreditPaymentModal=()=>null;`,
        supabase: `const f=globalThis.__serviceUi;export const supabase={channel(name){const channel={name,on(_kind,config,cb){f.callbacks.push({config,cb});return channel},subscribe(cb){channel.status=cb;return channel}};f.channels.push(channel);return channel},removeChannel(){f.removed++}};`,
      })[args.path] }));
    } }] });
  const { default: Tab } = await import(pathToFileURL(bundle).href);
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const settle = ms => act(async () => { await new Promise(done => setTimeout(done, ms || 30)); });
  const click = async label => { const node = [...document.querySelectorAll('button')].find(n => n.textContent === label); assert(node, label); await act(async () => node.click()); await settle(); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Tab, { poloId: id(2) }))));
    await settle(); assert.equal(f.pages.length, 1); assert(f.first);
    const event = f.callbacks[0]; assert.equal(event.config.filter, `polo_id=eq.${id(2)}`);
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180);
    await act(async () => f.first()); await settle(); await settle(50);
    assert(f.pages.length >= 2, 'An event during the initial read is followed by another canonical read');
    assert(document.body.textContent.includes('NFS-e nº 7')); assert(document.body.textContent.includes('Parcela 1/3'));
    const before = f.pages.length;
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(99) } })); await settle(180);
    assert.equal(f.pages.length, before, 'Other polos are ignored');
    await click('Receber'); assert(document.body.textContent.includes('Pagamento canônico RECEIVABLE'));
    await click('Confirmar parcial sintético'); await settle();
    assert.equal(f.payments.length, 1); assert.equal(f.payments[0].input.sourceId, id(1));
    assert(document.body.textContent.includes('Baixa parcial')); assert(document.body.textContent.includes('Receber saldo'));
    f.row = { ...f.row, nfseFiscalCancelledAt: '2026-11-12T22:00:00Z', status: 'SUSPENSO', nfseCancellationState: 'REVIEW_REQUIRED', nfseCancellationReason: 'PAYMENT_HISTORY' };
    await act(async () => f.channels[0].status('SUBSCRIBED')); await settle(180); await settle();
    assert(!document.body.textContent.includes('não cancela boletos automaticamente'));
    assert(!document.body.textContent.includes('O histórico financeiro foi preservado'));
    assert(document.body.textContent.includes('Revisar cancelamento')); assert(!document.body.textContent.includes('Receber saldo'));
    assert(document.body.textContent.includes('Existe baixa ou pagamento registrado'));
    f.row = { ...f.row, id: id(3), paymentSummary: undefined, nfseInstallmentNumber: 2, status: 'SUSPENSO', nfseCancellationState: 'PENDING', nfseCancellationReason: null };
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180); await settle();
    assert(document.body.textContent.includes('Cancelando cobrança')); assert(!document.body.textContent.includes('Receber saldo'));
    f.row = { ...f.row, status: 'CANCELADO', nfseCancellationState: 'CANCELLED' };
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180); await settle();
    assert(document.body.textContent.includes('CANCELADO'), 'Automatic cancellation is displayed from the canonical SQL state');
    await click('Recebidos'); assert.equal(f.pages.at(-1).filters.statusScope, 'RECEIVED');
    await act(async () => root.unmount()); const count = f.pages.length;
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180);
    assert.equal(f.pages.length, count); assert.equal(f.removed, 1);
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); delete globalThis.__serviceUi; await rm(temp, { recursive: true, force: true }); }
});
