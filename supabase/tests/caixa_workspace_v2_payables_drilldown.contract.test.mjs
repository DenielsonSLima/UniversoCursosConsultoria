import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../migrations/20260927230000_create_caixa_workspace_v2_payables_drilldown.sql',
  import.meta.url,
), 'utf8');
const start = migration.indexOf(
  'CREATE OR REPLACE FUNCTION public.list_caixa_workspace_v2_contas_pagar_secure(',
);
const end = migration.indexOf('$function$;', start);
const body = migration.slice(start, end);

test('drill-down possui assinatura, segurança e guarda antes das fontes', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(body, /p_company_id uuid,[\s\S]*p_polo_id uuid DEFAULT NULL/);
  assert.match(body, /p_filtro text DEFAULT 'COMPETENCIA'/);
  assert.match(body, /p_pagina integer DEFAULT 1/);
  assert.match(body, /p_tamanho_pagina integer DEFAULT 20/);
  assert.match(body, /p_snapshot_id text DEFAULT NULL/);
  assert.match(body, /STABLE[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(body, /auth\.uid\(\) IS NULL[\s\S]*public\.is_gestor\(\)/);
  assert.match(body, /gestor_has_any_global_module\(ARRAY\['caixa'\]\)/);
  assert.match(body, /gestor_has_any_global_module\(ARRAY\['financeiro'\]\)[\s\S]*gestor_has_effective_financeiro_tab\('despesas'\)/);
  assert.match(body, /gestor_has_any_module_for_polo\(ARRAY\['caixa'\], p_polo_id\)/);
  assert.match(body, /allPolos\/is_gestor_global é administrador global do sistema/);
  assert.ok(body.indexOf('auth.uid() IS NULL') < body.indexOf('FROM public.contas_pagar'));
  assert.ok(body.indexOf('authorized_polo.company_id') < body.indexOf('FROM public.contas_pagar'));
});

test('filtros, corte e agenda repetem a semântica do Workspace v2', () => {
  for (const filter of [
    'ATRASADAS', 'HOJE', 'PROXIMOS_7_DIAS', 'COMPETENCIA',
    'PAGAS_COMPETENCIA', 'A_VENCER_COMPETENCIA',
  ]) assert.ok(body.includes(`'${filter}'`));
  assert.match(body, /v_data_corte := least\(v_hoje, v_fim - 1\)/);
  assert.match(body, /'ATRASADAS' THEN aberta_no_corte[\s\S]*data_vencimento < v_data_corte/);
  assert.match(body, /'HOJE' THEN aberta_hoje AND data_vencimento = v_hoje/);
  assert.match(body, /'PROXIMOS_7_DIAS' THEN aberta_hoje[\s\S]*data_vencimento > v_hoje[\s\S]*data_vencimento <= v_hoje \+ 7/);
  assert.match(body, /'PAGAS_COMPETENCIA' THEN paga_no_corte/);
  assert.match(body, /'A_VENCER_COMPETENCIA' THEN aberta_no_corte[\s\S]*data_vencimento > v_data_corte/);
  assert.doesNotMatch(body, /\bCURRENT_DATE\b/);
});

test('fontes e valores preservam rateio, parcial e isolamento de empresa', () => {
  assert.match(body, /conta\.despesa_lancamento_id IS NULL/);
  assert.match(body, /conta\.emprestimo_parcela_id IS NULL/);
  assert.match(body, /despesa\.rateio_modo = 'SEM_RATEIO'/);
  assert.match(body, /'RATEIO:' \|\| rateio\.id::text/);
  assert.match(body, /rateio\.company_id = p_company_id/);
  assert.match(body, /parent_polo\.id = despesa\.polo_id[\s\S]*parent_polo\.company_id = p_company_id/);
  assert.match(body, /despesa\.rateio_modo IN \('TODOS', 'SELECIONADOS'\)/);
  assert.match(body, /greatest\(obrigacao\.valor_programado - CASE[\s\S]*THEN obrigacao\.valor_pago/);
  assert.match(body, /'Conta a pagar sem descrição'/);
  assert.match(body, /'Despesa sem descrição'/);
  assert.match(body, /'Rateio de despesa sem descrição'/);
  assert.match(body, /'valor_programado',[\s\S]*::text/);
  assert.match(body, /'valor_pago',[\s\S]*::text/);
  assert.match(body, /'saldo_aberto',[\s\S]*::text/);
  assert.match(body, /valor_pago_contextual/);
  assert.match(body, /data_pagamento_contextual/);
});

test('paginação e ACL são calculadas no banco com grants mínimos', () => {
  assert.match(body, /v_tamanho < 1 OR v_tamanho > 100/);
  assert.match(body, /row_number\(\) OVER/);
  assert.match(body, /pg_catalog\.string_agg\([\s\S]*ORDER BY item\.posicao/);
  assert.match(body, /p_snapshot_id <> v_snapshot_id[\s\S]*ERRCODE = '40001'/);
  assert.match(body, /'total_itens', v_total/);
  assert.match(body, /pg_catalog\.ceil\(v_total::numeric \/ v_tamanho\)/);
  assert.match(body, /'unidade_contagem', 'LINHA_ECONOMICA'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated, service_role/);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO anon/);
});
