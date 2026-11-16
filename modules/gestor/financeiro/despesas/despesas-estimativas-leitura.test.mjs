import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
let temporary;
let modules;
let calls = [];
let responses = new Map();
const client = { rpc: async (name, params) => {
  calls.push({ name, params });
  assert.ok(responses.has(name), `RPC inesperada: ${name}`);
  return responses.get(name);
} };

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'despesas-estimativas-leitura-'));
  globalThis.__expenseEstimatesReadClient = client;
  const output = join(temporary, 'contracts.cjs');
  await build({ stdin: { contents: `
    export { default as React } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
    export { mapLancamento } from './modules/gestor/financeiro/despesas/despesas.mapper';
    export { enrichDespesasEstimativas } from './modules/gestor/financeiro/despesas/despesas-estimativas-leitura.service';
    export { getDespesasSummary, getDespesasGroupSummary } from './modules/gestor/financeiro/despesas/despesas-resumos.service';
    export { getDespesasVencidas } from './modules/gestor/financeiro/despesas/despesas-vencidas.service';
    export { default as DespesaTable } from './modules/gestor/financeiro/despesas/components/DespesaTable';
    export { default as DespesaCard } from './modules/gestor/financeiro/despesas/components/DespesaCard';
    export { default as DespesasSummaryCards } from './modules/gestor/financeiro/despesas/components/DespesasSummaryCards';
    export { getDespesaEstimativaLabel } from './modules/gestor/financeiro/despesas/components/despesaPresentation';
  `, resolveDir: root, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'fake-client', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fake' }));
    builder.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({
      contents: 'export const supabase = globalThis.__expenseEstimatesReadClient;', loader: 'js',
    }));
  } }] });
  modules = require(output);
});

after(async () => {
  delete globalThis.__expenseEstimatesReadClient;
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

const row = (overrides = {}) => ({
  id: 'expense-1', polo_id: 'polo-1', descricao: 'ENERGIA', tipo: 'DESPESA_FIXA',
  status: 'VENCIDO', valor: 300, valor_base: 300, data_vencimento: '2026-10-10',
  valor_estimado: true, valor_estimado_original: '300.00', valor_estimado_versao: 0,
  created_at: '2026-10-01T12:00:00Z', ...overrides,
});

test('leitura batch preserva metadados da origem em rateio e rejeita metadado ausente', async () => {
  calls = [];
  responses = new Map([['get_despesas_estimativas_secure', { error: null, data: [
    { id: 'share-1', despesa_lancamento_id: 'expense-1', valor_estimado: true,
      valor_estimado_original: '300.00', valor_estimado_versao: 2, valor_confirmado_em: null },
  ] }]]);
  const result = await modules.enrichDespesasEstimativas([{ id: 'share-1', valor: 100 }]);
  const mapped = modules.mapLancamento({ ...row(), ...result[0], is_rateio_derivado: true });
  assert.equal(mapped.valor, 100);
  assert.equal(mapped.valorEstimadoOriginal, 300);
  assert.equal(mapped.valorEstimadoVersao, 2);
  assert.equal(mapped.despesaLancamentoId, 'expense-1');
  assert.match(modules.getDespesaEstimativaLabel(mapped), /Cota estimada original/);
  assert.deepEqual(calls[0].params.p_despesa_ids, ['share-1']);
  await assert.rejects(modules.enrichDespesasEstimativas([{ id: 'other' }]), /conferir as estimativas/);
});

test('previsão passada permanece fatura a confirmar na tabela e cartão', () => {
  const item = modules.mapLancamento(row());
  for (const Component of [modules.DespesaTable, modules.DespesaCard]) {
    const html = modules.renderToStaticMarkup(modules.React.createElement(Component,
      { item, items: [item], contas: [], onPagar() {} }));
    assert.match(html, /Fatura a confirmar/);
    assert.match(html, /Valor estimado|Estimado/);
    assert.match(html, /Estimativa original/);
    assert.doesNotMatch(html, />\s*Vencido</);
  }
});

test('valor confirmado conserva estimativa original e apresenta status real', () => {
  const item = modules.mapLancamento(row({ valor: '347.82', valor_base: '347.82',
    valor_confirmado_em: '2026-11-15T20:00:00Z', valor_confirmado_por: 'actor', valor_estimado_versao: 1 }));
  const html = modules.renderToStaticMarkup(modules.React.createElement(modules.DespesaTable,
    { items: [item], contas: [] }));
  assert.match(html, /Valor confirmado/);
  assert.match(html, /347,82/);
  assert.match(html, /300,00/);
  assert.match(html, />\s*Vencido</);
  assert.doesNotMatch(html, /Fatura a confirmar/);
});

test('cancelamento preserva valor estimado sem inventar confirmação da fatura', () => {
  const item = modules.mapLancamento(row({ status: 'CANCELADO' }));
  for (const Component of [modules.DespesaTable, modules.DespesaCard]) {
    const html = modules.renderToStaticMarkup(modules.React.createElement(Component, { item, items: [item], contas: [] }));
    assert.match(html, /Valor estimado/);
    assert.match(html, /Cancelado/);
    assert.doesNotMatch(html, /Valor confirmado|Fatura a confirmar/);
  }
  assert.match(modules.getDespesaEstimativaLabel(item), /Valor estimado/);
});

test('sem cobrança mostra mês zerado e preserva estimativa sem aparentar pagamento', () => {
  const item = modules.mapLancamento(row({ status:'CANCELADO',valor_sem_cobranca_em:'2026-11-15T22:00:00Z' }));
  for (const Component of [modules.DespesaTable,modules.DespesaCard]) {
    const html = modules.renderToStaticMarkup(modules.React.createElement(Component,{ item,items:[item],contas:[] }));
    assert.match(html,/Sem cobrança/);
    assert.match(html,/Cobrança do mês/);
    assert.match(html,/0,00/);
    assert.match(html,/Estimativa original/);
    assert.doesNotMatch(html,/Valor pago|Pago:|Fatura a confirmar|Valor confirmado/);
  }
});

test('baixa única canônica mostra os mesmos detalhes do legado; múltiplas e rateio preservam histórico', () => {
  const raw = row({ status:'PAGO',valor_estimado:false,valor_estimado_original:null,
    valor_pago:300,data_pagamento:'2026-11-10',forma_pagamento:'PIX',
    conta_bancaria_nome:'BANCO SINTÉTICO • CONTA QA',pagamento_unico:true,
    payment_summary:{ originalAmount:'300.00',previouslyPaid:'300.00',remainingBefore:'0.00',status:'PAGO',hasEvents:true },
  });
  const render = item => modules.renderToStaticMarkup(modules.React.createElement(modules.DespesaCard,
    { item,contas:[],onPagar() {} }));
  const single = render(modules.mapLancamento(raw));
  assert.match(single,/Valor pago/); assert.match(single,/Forma de pagamento/);
  assert.match(single,/BANCO SINTÉTICO/); assert.match(single,/10\/11\/2026/);
  assert.match(single,/Histórico/); assert.doesNotMatch(single,/Saldo:/);
  const multiple = render(modules.mapLancamento({ ...raw,pagamento_unico:false }));
  assert.match(multiple,/Saldo:/); assert.doesNotMatch(multiple,/BANCO SINTÉTICO|Forma de pagamento/);
  const derived = render(modules.mapLancamento({ ...raw,is_rateio_derivado:true }));
  assert.doesNotMatch(derived,/BANCO SINTÉTICO|Conta de saída/);
});

test('resumo usa separação e vencidos do servidor, sem recompor saldos no cliente', async () => {
  calls = [];
  responses = new Map([
    ['get_despesas_economicas_summary_secure', { data: [{ total_value: '1200.00', paid_value: '220.00',
      pending_value: '980.00', vencidos_count: 7 }], error: null }],
    ['get_despesas_estimativas_resumo_secure', { data: { estimated_value: '300.00', estimated_count: 1,
      confirmed_pending_value: '680.00', vencidos_count: 2, groups: [] }, error: null }],
  ]);
  const summary = await modules.getDespesasSummary({ tipo: 'DESPESA_FIXA', poloId: 'polo-1', search: 'energia' });
  assert.deepEqual(summary, { totalValue: 1200, paidValue: 220, pendingValue: 980,
    vencidosCount: 2, estimatedValue: 300, estimatedCount: 1, confirmedPendingValue: 680 });
  assert.equal(calls[1].params.p_search, 'energia');
  const html = modules.renderToStaticMarkup(modules.React.createElement(modules.DespesasSummaryCards,
    { summary, poloId: 'polo-1', pending: false, failed: false }));
  assert.match(html, /A pagar confirmado/);
  assert.match(html, /680,00/);
  assert.match(html, /300,00/);
});

test('agrupamento casa estimativas pela chave canônica, mesmo sem categoria', async () => {
  responses = new Map([
    ['get_despesas_economicas_group_summary_secure', { data: [
      { categoria_id: null, categoria_nome: 'Sem categoria', total_value: 300, paid_value: 0, item_count: 1 },
    ], error: null }],
    ['get_despesas_estimativas_resumo_secure', { data: { estimated_value: 300, estimated_count: 1,
      confirmed_pending_value: 0, vencidos_count: 0,
      groups: [{ grupo_chave: '__sem_categoria__', estimated_value: '300.00', estimated_count: 1 }] }, error: null }],
  ]);
  const [group] = await modules.getDespesasGroupSummary({ tipo: 'DESPESA_FIXA', poloId: 'polo-1' });
  assert.equal(group.estimatedValue, 300);
  assert.equal(group.estimatedCount, 1);
});

test('Outros Débitos mantém contrato original e falha de estimativas não inventa resumo', async () => {
  calls = [];
  responses = new Map([['get_despesas_summary', { data: [{ total_value: 10, pending_value: 10 }], error: null }]]);
  const result = await modules.getDespesasSummary({ tipo: 'OUTRO_DEBITO' });
  assert.equal(result.pendingValue, 10);
  assert.deepEqual(calls.map(call => call.name), ['get_despesas_summary']);
  responses.set('get_despesas_economicas_summary_secure', { data: [], error: null });
  responses.set('get_despesas_estimativas_resumo_secure', { data: null, error: { message: 'indisponível' } });
  await assert.rejects(modules.getDespesasSummary({ tipo: 'DESPESA_FIXA', poloId: 'polo-1' }),
    error => error.message === 'indisponível');
});

test('Vencidos usa um bundle autorizado e não envia o escopo novo para RPCs legadas', async () => {
  calls=[];
  responses=new Map([
    ['get_despesas_vencidas_secure',{ error:null,data:{ items:[row({ valor_estimado:false,status:'VENCIDO' })],
      summary:{ total_value:'300.00',paid_value:'100.00',pending_value:'200.00',vencidos_count:1 },
      groups:[{ grupo_chave:'2026-10',grupo_nome:'10/2026',total_value:'300.00',paid_value:'100.00',item_count:1 }],
    } }],
    ['get_despesas_estimativas_secure',{ error:null,data:[{ id:'expense-1',valor_estimado:false }] }],
  ]);
  const bundle=await modules.getDespesasVencidas({ tipo:'DESPESA_FIXA',poloId:'polo-1',statusScope:'vencidos',search:' energia ' },'mes');
  assert.equal(bundle.items[0].status,'VENCIDO'); assert.equal(bundle.summary.confirmedPendingValue,200);
  assert.equal(bundle.groups[0].groupKey,'2026-10');
  assert.deepEqual(calls.map(call=>call.name),['get_despesas_vencidas_secure','get_despesas_estimativas_secure']);
  assert.equal(calls[0].params.p_search,'energia'); assert.equal(calls[0].params.p_agrupamento,'mes');
  assert.equal(calls[0].params.p_status_scope,undefined);
});
