import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [queryHook, fetcher, panel, tab] = await Promise.all([
  readFile(new URL('./hooks/useBaneseConciliacaoQueries.ts', import.meta.url), 'utf8'),
  readFile(new URL('./conciliacao-bancaria.fetch.ts', import.meta.url), 'utf8'),
  readFile(new URL('./components/ConciliacaoOrigemBaixaPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./ConciliacaoBancariaTab.tsx', import.meta.url), 'utf8'),
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

  assert.match(overviewQuery, /CONCILIACAO_OVERVIEW_QUERY_KEY/);
  assert.match(overviewQuery, /fetchConciliacaoOverviewData/);
  assert.doesNotMatch(overviewQuery, /\bstatus\b|\bcanal\b|\bsearch\b|\bpage\b|\bpageSize\b/);
  assert.match(overviewQuery, /retry: false/);
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

test('realtime separa diagnóstico e agrupa rajadas de recebíveis', () => {
  assert.match(queryHook, /payment_gateway_transactions[\s\S]*scheduleDiagnosticsInvalidation/);
  assert.match(queryHook, /contas_receber[\s\S]*scheduleReceivablesInvalidation/);
  assert.match(queryHook, /REALTIME_INVALIDATION_DEBOUNCE_MS = 2_000/);
  assert.match(queryHook, /window\.setTimeout\([\s\S]*REALTIME_INVALIDATION_DEBOUNCE_MS/);
  assert.match(queryHook, /invalidateConciliacao[\s\S]*invalidateListAndOverview\(\)[\s\S]*invalidateDiagnostics\(\)/);
});

test('painel descreve a conciliação Banese por worker sem prometer webhook inexistente', () => {
  assert.match(panel, /Worker de Conciliação em Segundo Plano/);
  assert.match(panel, /consulta a API Banese/);
  assert.doesNotMatch(panel, /Webhooks/);
  assert.match(panel, /parcelas pendentes visíveis/);
});
