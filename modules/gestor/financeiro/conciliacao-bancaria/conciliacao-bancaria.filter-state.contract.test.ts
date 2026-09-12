import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [queryHook, fetcher, panel, tab, receiptFetcher, receiptFilters, receiptRows] = await Promise.all([
  readFile(new URL('./hooks/useBaneseConciliacaoQueries.ts', import.meta.url), 'utf8'),
  readFile(new URL('./conciliacao-bancaria.fetch.ts', import.meta.url), 'utf8'),
  readFile(new URL('./components/ConciliacaoOrigemBaixaPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./ConciliacaoBancariaTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./conciliacao-recebimentos.fetch.ts', import.meta.url), 'utf8'),
  readFile(new URL('./components/ConciliacaoRecebimentoFilters.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./components/ConciliacaoRecebimentoRows.tsx', import.meta.url), 'utf8'),
]);
const transactionsPanel = await readFile(
  new URL('./components/ConciliacaoTransactionsPanel.tsx', import.meta.url),
  'utf8',
);

test('troca de status e canal nunca reaproveita linhas do filtro anterior', () => {
  assert.match(queryHook, /search\.trim\(\),\s*status,\s*canal,/);
  assert.match(queryHook, /fetchConciliacaoListData\(\{[\s\S]*status,[\s\S]*canal,/);
  assert.doesNotMatch(queryHook, /keepPreviousData|placeholderData/);
});

test('troca de filtro refaz somente a lista e não as consultas auxiliares', () => {
  const overviewQuery = queryHook.match(
    /const overviewDataQuery = useQuery\(\{([\s\S]*?)\n {2}\}\);/,
  )?.[1] || '';
  const overviewQueryKey = overviewQuery.match(
    /queryKey:\s*\[([\s\S]*?)\],\s*queryFn:/,
  )?.[1] || '';

  assert.match(overviewQuery, /CONCILIACAO_OVERVIEW_QUERY_KEY/);
  assert.match(overviewQuery, /fetchConciliacaoOverviewData/);
  assert.doesNotMatch(overviewQueryKey, /\bstatus\b|\bcanal\b|\bsearch\b|\bpage\b|\bpageSize\b/);
  assert.match(overviewQuery, /retry: false/);
  assert.match(overviewQuery, /enabled: Boolean\(activeEnvironment\) && diagnosticsEnabled/);
});

test('diagnóstico pesado só é habilitado pela aba correspondente', () => {
  const diagnosticsQuery = queryHook.match(
    /const diagnosticsDataQuery = useQuery\(\{([\s\S]*?)\n {2}\}\);/,
  )?.[1] || '';

  assert.match(diagnosticsQuery, /conciliacaoBancariaTransacoes/);
  assert.match(diagnosticsQuery, /fetchConciliacaoDiagnosticsData/);
  assert.match(diagnosticsQuery, /enabled: Boolean\(activeEnvironment\) && diagnosticsEnabled/);
  assert.match(tab, /diagnosticsEnabled: activeSubTab === 'diagnostico'/);
});

test('timeout do diagnóstico não derruba a lista e aparece como erro parcial', () => {
  assert.match(fetcher, /export const fetchConciliacaoListData/);
  assert.match(fetcher, /export const fetchConciliacaoOverviewData/);
  assert.match(fetcher, /export const fetchConciliacaoDiagnosticsData/);
  assert.doesNotMatch(fetcher, /if \(transactionsResult\.error\) throw/);
  assert.match(fetcher, /error: errors\.length > 0 \? errors\.join/);
  assert.match(tab, /Diagnóstico parcialmente indisponível/);
  assert.match(tab, /isUnavailable=\{Boolean\(queries\.transactionsError\)\}/);
  assert.match(transactionsPanel, /Histórico temporariamente indisponível/);
});

test('falha dos indicadores não é apresentada silenciosamente como zero', () => {
  assert.match(queryHook, /overviewDataQuery\.isError/);
  assert.match(queryHook, /indicadores consolidados da conciliação estão temporariamente indisponíveis/);
  assert.match(tab, /Indicadores temporariamente indisponíveis/);
  assert.match(tab, /queries\.overviewError/);
});

test('realtime agrupa recebíveis sem assinar tabelas auxiliares de alto custo', () => {
  assert.doesNotMatch(queryHook, /table: 'payment_gateway_transactions'/);
  assert.doesNotMatch(queryHook, /table: 'payment_gateway_cnab_files'/);
  assert.match(queryHook, /contas_receber[\s\S]*scheduleReceivablesInvalidation/);
  assert.match(queryHook, /poloId \? `polo_id=eq\.\$\{poloId\}` : undefined/);
  assert.doesNotMatch(queryHook, /gateway_provider=eq\.banese_card/);
  assert.match(queryHook, /filter: receivablesRealtimeFilter/);
  assert.match(queryHook, /REALTIME_INVALIDATION_DEBOUNCE_MS = 2_000/);
  assert.match(queryHook, /window\.setTimeout\([\s\S]*REALTIME_INVALIDATION_DEBOUNCE_MS/);
  assert.match(queryHook, /void invalidateActiveList\(\)/);
  assert.match(queryHook, /invalidateConciliacao[\s\S]*invalidateListAndOverview\(\)[\s\S]*invalidateDiagnostics\(\)/);
});

test('visão de recebimentos abre em Pago e envia escopo, período e paginação à RPC', () => {
  assert.match(tab, /useState<string>\('PAGO'\)/);
  assert.match(tab, /status !== 'PAGO'[\s\S]*setSettlementStartDate\(''\)[\s\S]*setSettlementEndDate\(''\)/);
  assert.match(receiptFilters, /disabled=\{!settlementFilterEnabled\}/);
  assert.match(receiptFetcher, /list_financial_reconciliation_secure/);
  assert.match(receiptFetcher, /p_polo_id: params\.poloId \|\| null/);
  assert.match(receiptFetcher, /p_payment_start: params\.settlementStartDate \|\| null/);
  assert.match(receiptFetcher, /p_payment_end: params\.settlementEndDate \|\| null/);
  assert.match(receiptFetcher, /p_environment: params\.environment/);
});

test('detalhe exibe a conta recebedora sem repetir empresa e polo já selecionados', () => {
  assert.match(receiptRows, /field\('Conta recebedora'/);
  assert.doesNotMatch(receiptRows, /field\(\s*'Empresa \/ polo'/);
});

test('todos os status usam a mesma RPC sem fallback parcial Banese', () => {
  const listFetcher = fetcher.split('export const fetchConciliacaoListData')[1].split('export const fetchConciliacaoOverviewData')[0];
  assert.match(listFetcher, /return fetchFinancialReceipts\(params\)/);
  assert.doesNotMatch(listFetcher, /\.from\(|\.range\(|Math\./);
  assert.match(receiptFetcher, /p_source_system: params\.sourceSystem/);
  assert.match(receiptFetcher, /p_status: params\.status/);
  assert.match(receiptFetcher, /totalPages: receiptNumber\(payload\.total_pages/);
  assert.doesNotMatch(fetcher, /PGRST202/);
});

test('painel informa consulta automática sem comando manual em lote', () => {
  assert.match(panel, /Banese e Proesc/);
  assert.doesNotMatch(panel, /Webhooks|Worker de Conciliação|Sincronizar Visíveis|Mercado Pago/);
  assert.doesNotMatch(tab, /Atualizar Dados/);
  assert.match(receiptFilters, /Todas|Banese|Proesc/);
  assert.match(queryHook, /sourceSystem,/);
});
