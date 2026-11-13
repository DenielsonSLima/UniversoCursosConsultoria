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

test('service workspace uses canonical summary, paged partner groups, table/cards and a guarded payment bridge without settlement', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/service-receivables-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT', '__serviceUi']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const f = globalThis.__serviceUi = { groups: [], pages: [], summaries: [], channels: [], payments: [], callbacks: [], removed: 0, first: null, opened: [],
    row: { id: id(1), clienteId: id(4), poloId: id(2), poloNome: 'Unidade sintética', clienteNome: 'Parceiro sintético', descricao: 'Serviço sintético · 1/27',
      valor: 260, categoria: 'OUTROS_CREDITOS', dataVencimento: '2026-11-30', status: 'PENDENTE', gatewayProvider: 'banese_card',
      operationCapabilities: { canSettle: true, canOpenExisting: true }, nfseNumber: '7', nfseInstallmentNumber: 1,
      nfseInstallmentCount: 27, nfseFiscalCancelledAt: null } };
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
        service: `const f=globalThis.__serviceUi;const payload=(page,pageSize)=>({groups:[{key:f.row.clienteId,label:f.row.clienteNome,itemCount:27,pendingCount:26,receivedCount:1,canceledCount:0,nextDue:'2026-11-30',first:{...f.row}}],totalItems:1,totalReceivables:27,page,pageSize});export const serviceReceivablesService={groups:async(filters,page,pageSize)=>{f.groups.push({filters,page,pageSize});if(f.groups.length===1)return new Promise(done=>{f.first=()=>done(payload(page,pageSize))});return payload(page,pageSize)},groupItems:async(filters,partnerId,page,pageSize)=>{f.pages.push({filters,partnerId,page,pageSize});return {rows:[{...f.row,nfseInstallmentNumber:page===1?1:26}],totalItems:27,page,pageSize}},summary:async filters=>{f.summaries.push(filters);return filters.statusScope==='UPCOMING'?{allCount:3,pendingCount:3,receivedCount:0,overdueCount:0,canceledCount:0,pendingValue:111,receivedValue:0,overdueValue:0,canceledValue:0,allValue:111}:{allCount:27,pendingCount:26,receivedCount:1,overdueCount:23,canceledCount:0,allValue:494,receivedValue:50,pendingValue:444,overdueValue:333,canceledValue:0}}};`,
        shared: `export const useFinanceiroSharedQueries=()=>({accountsQuery:{data:[],isError:false}});`,
        payment: `export const confirmFinancialPayment=async()=>{globalThis.__serviceUi.payments.push('FORBIDDEN');throw new Error('No settlement allowed in this smoke');};`,
        modal: `import React from 'react';export function FinancialPaymentModal(p){return React.createElement('section',{role:'dialog','data-readonly':String(p.readOnly)},React.createElement('p',{},'Pagamento canônico '+p.sourceKind+' '+p.sourceId),React.createElement('button',{onClick:p.onClose},'Fechar pagamento sintético'));}`,
        bolepix: `import React from 'react';export const OtherCreditPaymentModal=p=>{globalThis.__serviceUi.opened.push(p.receivableId);return React.createElement('section',{role:'dialog'},React.createElement('p',{},'Documento canônico'),React.createElement('button',{onClick:p.onClose},'Fechar documento sintético'));};`,
        supabase: `const f=globalThis.__serviceUi;export const supabase={channel(name){const channel={name,on(_kind,config,cb){f.callbacks.push({config,cb});return channel},subscribe(cb){channel.status=cb;return channel}};f.channels.push(channel);return channel},removeChannel(){f.removed++}};`,
      })[args.path] }));
    } }] });
  const { default: Tab } = await import(pathToFileURL(bundle).href);
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const settle = ms => act(async () => { await new Promise(done => setTimeout(done, ms || 30)); });
  const click = async label => { const node = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === label || n.textContent.trim().startsWith(label)); assert(node, label); await act(async () => node.click()); await settle(); };
  const expand = async () => { const node = [...document.querySelectorAll('button[aria-expanded]')].find(n => n.textContent.includes('Parceiro sintético')); assert(node); await act(async () => node.click()); await settle(); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Tab, { poloId: id(2) }))));
    await settle(); assert.equal(f.groups.length, 1); assert(f.first); assert.equal(f.pages.length, 0);
    assert.deepEqual(f.summaries.map(x => x.statusScope).sort(), ['ALL', 'UPCOMING']);
    assert(document.body.textContent.includes('Recebido')); assert(document.body.textContent.includes('A vencer')); assert(document.body.textContent.includes('Em atraso'));
    assert(!document.body.textContent.includes('Total lançado')); assert(!document.body.textContent.includes('aluno, turma'));
    const event = f.callbacks[0]; assert.equal(event.config.filter, `polo_id=eq.${id(2)}`);
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180);
    await act(async () => f.first()); await settle(); await settle(50);
    assert(f.groups.length >= 2, 'An event during the initial group read requires a trailing canonical read');
    assert.equal(f.pages.length, 0, 'Collapsed partner does not load individual installments');
    await expand(); assert.equal(f.pages.at(-1).partnerId, id(4)); assert.equal(f.pages.at(-1).pageSize, 25);
    assert(document.body.textContent.includes('NFS-e nº 7')); assert(document.body.textContent.includes('Parcela 1/27'));
    assert(document.querySelector('table').classList.contains('financial-receivables-table'));
    await click('Receber'); assert(document.body.textContent.includes('Pagamento canônico RECEIVABLE '+id(1)));
    assert.equal(document.querySelector('[role="dialog"]').dataset.readonly, 'false'); await click('Fechar pagamento sintético');
    await click('Abrir'); assert.equal(f.opened.at(-1), id(1)); await click('Fechar documento sintético');
    const next = document.querySelector('[aria-label="Próxima página das parcelas do parceiro"]'); assert(next); await act(async () => next.click()); await settle();
    assert.equal(f.pages.at(-1).page, 2); assert(document.body.textContent.includes('Parcela 26/27'));
    const beforeMode = f.pages.length;
    await act(async () => document.querySelector('[title="Cards"]').click()); await settle();
    assert.equal(document.querySelector('table'), null); assert(document.querySelector('.financial-data-card')); assert.equal(f.pages.length, beforeMode);
    const beforeForeign = f.groups.length;
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(99) } })); await settle(180);
    assert.equal(f.groups.length, beforeForeign, 'Other polos are ignored');
    f.row = { ...f.row, nfseNumber: '6', nfseFiscalCancelledAt: '2026-11-12T15:06:00Z', nfseCancellationState: 'REVIEW_REQUIRED', nfseCancellationReason: 'PAYMENT_HISTORY',
      paymentSummary: { originalAmount: '260.00', previouslyPaid: '60.00', remainingBefore: '200.00', status: 'PENDENTE', hasEvents: true } };
    await act(async () => f.channels[0].status('SUBSCRIBED')); await settle(180); await settle();
    assert(document.body.textContent.includes('Cancelamento financeiro requer revisão'));
    assert(![...document.querySelectorAll('button')].some(n => /^Receber/.test(n.textContent.trim())));
    await click('Histórico de pagamentos'); assert.equal(document.querySelector('[role="dialog"]').dataset.readonly, 'true'); await click('Fechar pagamento sintético');
    f.row = { ...f.row, paymentSummary: undefined, nfseCancellationState: null };
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180); await settle();
    assert(document.body.textContent.includes('NFS-e nº 6 cancelada. Novo recebimento indisponível.'));
    await click('A vencer'); assert.equal(f.groups.at(-1).filters.statusScope, 'UPCOMING');
    await click('Recebidos'); assert.equal(f.groups.at(-1).filters.statusScope, 'RECEIVED');
    assert.equal(f.payments.length, 0, 'Opening receive, history and document never confirms a settlement');
    await act(async () => root.unmount()); const count = f.groups.length + f.pages.length;
    await act(async () => event.cb({ new: { source_table: 'contas_receber', polo_id: id(2) } })); await settle(180);
    assert.equal(f.groups.length + f.pages.length, count); assert.equal(f.removed, 1);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close(); await rm(temp, { recursive: true, force: true });
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test('statement hook freezes filtered server snapshot/date, discards old scope and never creates a bank title', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/service-report-hook-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const keys = ['window', 'document', 'HTMLElement', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT', '__serviceReportTest'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] }));
  const f = globalThis.__serviceReportTest = { calls: [], writes: 0, current: null };
  const bundle = resolve(temp, 'test.mjs');
  const output = await build({ stdin: { contents: `import React from 'react';import {useServiceReceivablesReport} from './modules/gestor/financeiro/receber/servicos/useServiceReceivablesReport';export function Harness(p){const report=useServiceReceivablesReport(p.filters);globalThis.__serviceReportTest.current=report;return React.createElement('output',{},report.rows.length);}`,
    resolveDir: base, loader: 'tsx' }, outfile: bundle, write: false, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'statement-read-only', setup(b) {
      b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      b.onResolve({ filter: /components\/FinancialReportPreview$/ }, () => ({ path: 'badge', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'badge'
        ? `export const FinancialReportStatusBadge=()=>null;`
        : `const f=globalThis.__serviceReportTest;export const supabase={functions:{invoke(){f.writes++;throw new Error('No bank/write endpoint allowed');}},rpc(name,args){if(name!=='exportar_servicos_receber_secure')throw new Error('Only snapshot RPC allowed');let done;const promise=new Promise(resolve=>done=resolve);const call={name,args,done};f.calls.push(call);return {abortSignal(signal){call.signal=signal;return this;},retry(value){if(value!==false)throw new Error('No transport retry');return this;},then:promise.then.bind(promise)};}};` }));
    } }] });
  await (await import('node:fs/promises')).writeFile(bundle, output.outputFiles[0].contents);
  const { Harness } = await import(pathToFileURL(bundle).href);
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const filters = { poloId: id(2), search: ' Serviço 7 ', dueStart: '2026-11-01', dueEnd: '2026-11-30', statusScope: 'PENDING' };
  const render = value => act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { filters: value }))));
  const settle = () => act(async () => { await new Promise(done => setTimeout(done, 10)); });
  const payload = polo => ({ total_items: 2, generated_at: '2026-10-10T13:14:15Z',
    rows: [1, 2].map(n => ({ id: id(100 + n), polo_id: polo, cliente_id: id(4), descricao: `Serviço ${n}`,
      valor: n === 1 ? '50.00' : '70.00', data_vencimento: '2026-11-30', status: 'PENDENTE', nfse_number: '7' })),
    summary: { pending_count: 2, received_count: 0, canceled_count: 0, overdue_count: 0, all_count: 2,
      pending_value: '120.00', received_value: '0.00', canceled_value: '0.00', overdue_value: '0.00', all_value: '120.00' } });
  try {
    await render(filters);
    let old;
    await act(async () => { old = f.current.load().catch(error => error); });
    await settle(); assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].args, { p_polo_id: id(2), p_search: 'Serviço 7', p_due_start: '2026-11-01', p_due_end: '2026-11-30', p_status_scope: 'PENDING' });
    const next = { ...filters, poloId: id(3), statusScope: 'UPCOMING' };
    await render(next); await act(async () => f.calls[0].done({ data: payload(id(2)), error: null }));
    const stale = await old; assert.match(stale.message, /filtros mudaram/); assert.equal(f.current.rows.length, 0);
    let first, second;
    await act(async () => { first = f.current.load(); second = f.current.load(); });
    await settle(); assert.equal(f.calls.length, 2, 'TanStack deduplicates the same snapshot read');
    assert.equal(f.calls[1].args.p_status_scope, 'UPCOMING');
    await act(async () => { f.calls[1].done({ data: payload(id(3)), error: null }); await Promise.all([first, second]); });
    assert.equal(f.current.rows.length, 2); assert.equal(f.current.issuedAt.toISOString(), '2026-10-10T13:14:15.000Z');
    assert.equal(f.current.poloId, id(3)); assert(f.current.summaryCards.some(card => card.value.includes?.('120,00')));
    assert.equal(f.writes, 0);
    let limit;
    await act(async () => { limit = f.current.load().catch(error => error); }); await settle();
    await act(async () => f.calls[2].done({ data: null, error: { code: '54000', message: 'server cap' } }));
    assert.match((await limit).message, /Refine os filtros/); assert.equal(f.writes, 0);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close(); await rm(temp, { recursive: true, force: true });
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
