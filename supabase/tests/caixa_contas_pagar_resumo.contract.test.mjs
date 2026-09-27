import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../migrations/20260927160000_create_caixa_contas_pagar_resumo.sql', import.meta.url),
  'utf8',
);

const functionStart = migration.indexOf(
  'CREATE OR REPLACE FUNCTION public.get_caixa_contas_pagar_resumo_secure(',
);
const functionEnd = migration.indexOf('$function$;', functionStart);
const body = migration.slice(functionStart, functionEnd);

test('RPC possui assinatura, segurança e autorização canônicas', () => {
  assert.ok(functionStart >= 0);
  assert.ok(functionEnd > functionStart);
  assert.match(body, /p_polo_id uuid DEFAULT NULL,[\s\S]*p_competencia date DEFAULT pg_catalog\.timezone\([\s\S]*'America\/Maceio'/);
  assert.match(body, /RETURNS jsonb[\s\S]*LANGUAGE plpgsql[\s\S]*STABLE[\s\S]*SECURITY DEFINER/);
  assert.match(body, /SET search_path TO ''/);
  assert.match(body, /coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'service_role'/);
  assert.match(body, /gestor_has_any_global_module\(ARRAY\['caixa'\]\)/);
  assert.match(body, /gestor_has_any_global_module\(ARRAY\['financeiro'\]\)[\s\S]*gestor_has_effective_financeiro_tab\('despesas'\)/);
  assert.match(body, /gestor_has_any_module_for_polo\(ARRAY\['caixa'\], p_polo_id\)/);
  assert.match(body, /gestor_has_any_module_for_polo\([\s\S]*ARRAY\['financeiro'\], p_polo_id[\s\S]*gestor_has_effective_financeiro_tab\('despesas'\)/);
  assert.ok(body.indexOf('gestor_has_any_global_module') < body.indexOf('FROM public.contas_pagar'));
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated, service_role/);
});

test('fontes econômicas não duplicam títulos físicos nem financiamento', () => {
  assert.match(body, /FROM public\.contas_pagar conta/);
  assert.match(body, /conta\.despesa_lancamento_id IS NULL/);
  assert.match(body, /conta\.emprestimo_parcela_id IS NULL/);
  assert.match(body, /FROM public\.despesas_lancamentos despesa[\s\S]*despesa\.rateio_modo = 'SEM_RATEIO'/);
  assert.match(body, /FROM public\.despesas_lancamentos_rateios rateio[\s\S]*despesa\.rateio_modo IN \('TODOS', 'SELECIONADOS'\)/);
  assert.match(body, /'DESPESA:' \|\| despesa\.id::text/);
  assert.match(body, /round\(coalesce\(rateio\.valor_total, 0\), 2\)/);
  assert.match(body, /greatest\(despesa\.created_at::date, rateio\.created_at::date\)/);
  assert.match(body, /titulos AS MATERIALIZED \([\s\S]*bool_and\([\s\S]*status = 'PAGO'/);
  assert.match(body, /titulo\.totalmente_pago_no_corte[\s\S]*titulo\.data_quitacao >= v_competencia/);
  assert.match(body, /count\(DISTINCT chave\)/);
  assert.match(body, /despesa\.excluido_em IS NULL/);
  assert.match(body, /conta\.status <> 'CANCELADO'/);
  assert.match(body, /despesa\.status <> 'CANCELADO'/);
  assert.match(body, /rateio\.status <> 'CANCELADO'/);
  assert.match(body, /obrigacao\.status IN \('PENDENTE', 'VENCIDO', 'ESTORNADO'\)/);
  assert.doesNotMatch(body, /status NOT IN \('CANCELADO', 'ESTORNADO'\)/);
  assert.doesNotMatch(body, /FROM public\.emprestimo/);
});

test('corte histórico recompõe aberto e usa desembolso real', () => {
  assert.match(body, /v_hoje date := pg_catalog\.timezone\([\s\S]*'America\/Maceio'/);
  assert.match(body, /'month', coalesce\(p_competencia, v_hoje\)/);
  assert.match(body, /v_data_corte := least\(v_hoje, v_fim - 1\)/);
  assert.doesNotMatch(body, /\bCURRENT_DATE\b/);
  assert.match(body, /conta\.valor_pago, conta\.valor/);
  assert.match(body, /despesa\.valor_pago, despesa\.valor/);
  assert.match(body, /despesa\.created_at::date/);
  assert.match(body, /greatest\(despesa\.created_at::date, rateio\.created_at::date\)/);
  assert.match(body, /obrigacao\.data_registro <= v_data_corte/);
  assert.doesNotMatch(body, /despesa\.data_lancamento/);
  assert.match(body, /obrigacao\.data_registro <= v_data_corte/);
  assert.match(body, /obrigacao\.status = 'PAGO'[\s\S]*obrigacao\.data_pagamento > v_data_corte/);
  assert.match(body, /status = 'PAGO'[\s\S]*data_registro <= v_data_corte[\s\S]*data_pagamento >= v_competencia[\s\S]*data_pagamento <= v_data_corte/);
  assert.match(body, /aberta_no_corte AND data_vencimento < v_data_corte/);
  assert.match(body, /aberta_no_corte[\s\S]*data_vencimento >= greatest\(v_competencia, v_data_corte\)/);
});

test('JSON v1 fecha KPIs e agenda diária sem sobrepor hoje', () => {
  for (const key of [
    'versao', 'competencia', 'periodo_inicio', 'periodo_fim_exclusivo',
    'data_corte', 'escopo_tipo', 'polo_id', 'criterio', 'contas_competencia',
    'pagas_competencia', 'a_vencer_competencia', 'em_atraso',
    'data_mais_antiga', 'agenda_financeira', 'hoje', 'proximos_sete_dias', 'dias',
  ]) {
    assert.ok(body.includes(`'${key}'`), `Campo obrigatório ausente: ${key}`);
  }
  assert.match(body, /'criterio', 'POSICAO_REEXPRESSA_NO_CORTE'/);
  assert.match(body, /pg_catalog\.generate_series\(0, 7\)/);
  assert.match(body, /agenda_por_dia AS \([\s\S]*GROUP BY dia\.data/);
  assert.match(body, /FROM agenda_por_dia item/);
  assert.match(body, /data_vencimento = v_data_corte/);
  assert.match(body, /data_vencimento > v_data_corte[\s\S]*data_vencimento <= v_data_corte \+ 7/);
  assert.match(body, /'periodo_inicio', pg_catalog\.to_char\(v_data_corte \+ 1/);
  assert.match(body, /'periodo_fim_exclusivo', pg_catalog\.to_char\(v_data_corte \+ 8/);
  assert.ok((body.match(/round\(metricas\.[a-z_]+, 2\)::text/g) || []).length >= 6);
});
