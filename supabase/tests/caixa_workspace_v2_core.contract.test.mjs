import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrations = [
  '20260927203000_create_caixa_workspace_v2_core.sql',
  '20260927214500_fix_caixa_workspace_v2_rateio_payment_quality.sql',
].map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
const migration = migrations.join('\n');

const signature = 'internal_contas.get_caixa_workspace_v2_core(';
const functionStart = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
const functionEnd = migration.indexOf('$function$;', functionStart);
const body = migration.slice(functionStart, functionEnd);

test('core v2 é privado, estável e não concede EXECUTE a clientes', () => {
  assert.ok(functionStart >= 0);
  assert.ok(functionEnd > functionStart);
  assert.match(body, /p_polo_id uuid DEFAULT NULL/);
  assert.match(body, /p_competencia date DEFAULT pg_catalog\.timezone\([\s\S]*'America\/Maceio'/);
  assert.match(body, /p_meses_historico integer DEFAULT 6/);
  assert.match(body, /RETURNS jsonb[\s\S]*LANGUAGE plpgsql[\s\S]*STABLE[\s\S]*SECURITY INVOKER/);
  assert.match(body, /SET search_path TO ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION internal_contas\.get_caixa_workspace_v2_core\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION internal_contas\.get_caixa_workspace_v2_core\([\s\S]*TO postgres/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION internal_contas\.get_caixa_workspace_v2_core\([\s\S]*TO (?:anon|authenticated|service_role)/);
});

test('payload declara shape v2, seções e indisponibilidade sem inventar zero', () => {
  for (const key of [
    'versao', 'meta', 'regras', 'secoes',
  ]) {
    assert.ok(body.includes(`'${key}'`), `Campo obrigatório ausente: ${key}`);
  }
  for (const key of [
    'competencia', 'periodo_inicio', 'periodo_fim_exclusivo', 'data_corte',
    'data_institucional', 'timezone', 'snapshot_id', 'gerado_em', 'escopo_tipo',
    'polo_id', 'meses_historico', 'criterio_posicao', 'criterio_historico',
    'criterio_realizado',
  ]) {
    assert.ok(body.includes(`'${key}'`), `Metadado obrigatório ausente: ${key}`);
  }
  assert.match(body, /'versao', 2/);
  assert.match(body, /v_snapshot_id text := 'caixa-v2-' \|\| pg_catalog\.md5/);
  assert.match(body, /'criterio_historico', 'POSICAO_REEXPRESSA_NO_CORTE'/);
  assert.match(body, /v_indisponivel jsonb := pg_catalog\.jsonb_build_object\([\s\S]*'disponivel', false,[\s\S]*'completo', false,[\s\S]*'motivo', 'ETAPA_POSTERIOR',[\s\S]*'observacao',[\s\S]*'dados', NULL/);
  assert.match(body, /'secoes',[\s\S]*'compromissos',[\s\S]*'dados',[\s\S]*'contas_a_pagar',[\s\S]*'agenda_financeira'/);
  assert.match(body, /v_fontes_pagar jsonb := '\[[\s\S]*public\.contas_pagar[\s\S]*\]'::jsonb;/);
  assert.ok((body.match(/'fontes_consideradas'/g) || []).length >= 4);
  assert.ok((body.match(/'fontes_indisponiveis'/g) || []).length >= 4);
  assert.match(body, /'motivo', CASE[\s\S]*THEN NULL[\s\S]*ELSE 'DADOS_INCOMPLETOS'/);
  assert.match(body, /'motivos_incompletude',[\s\S]*CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA/);
});

test('datas, cortes e valores monetários são canônicos no banco', () => {
  assert.match(body, /v_hoje date := pg_catalog\.timezone\([\s\S]*'America\/Maceio'/);
  assert.match(body, /'month', coalesce\([\s\S]*p_competencia,[\s\S]*pg_catalog\.timezone\('America\/Maceio'/);
  assert.match(body, /v_data_corte := least\(v_hoje, v_fim - 1\)/);
  assert.match(body, /'timezone', 'America\/Maceio'/);
  assert.match(body, /'data_institucional', pg_catalog\.to_char\(v_hoje/);
  assert.doesNotMatch(body, /\bCURRENT_DATE\b/);
  assert.ok(
    (body.match(/pg_catalog\.round\(metricas\.[a-z_]+, 2\)::text/g) || []).length >= 4,
    'KPIs monetários devem sair como texto decimal calculado no banco',
  );
  assert.match(body, /pg_catalog\.round\(agenda_metricas\.hoje_valor, 2\)::text/);
  assert.match(body, /pg_catalog\.round\([\s\S]*agenda_metricas\.sete_dias_valor, 2[\s\S]*\)::text/);
  assert.match(body, /pg_catalog\.generate_series\(0, 7\)/);
  assert.match(body, /SELECT \(v_hoje \+ serie\.indice\)::date AS data/);
  assert.match(body, /WHERE data > v_hoje AND data <= v_hoje \+ 7/);
});

test('aberto, realizado e rateio preservam regimes sem duplicação', () => {
  assert.match(body, /'compromissos_abertos_impactam_realizado', false/);
  assert.match(body, /'compromissos_abertos_impactam_posicoes', false/);
  assert.match(body, /'rateio_economico_duplica_baixa_fisica', false/);
  assert.match(body, /conta\.despesa_lancamento_id IS NULL/);
  assert.match(body, /conta\.emprestimo_parcela_id IS NULL/);
  assert.match(body, /despesa\.rateio_modo = 'SEM_RATEIO'/);
  assert.match(body, /FROM public\.despesas_lancamentos_rateios rateio/);
  assert.match(body, /despesa\.rateio_modo IN \('TODOS', 'SELECIONADOS'\)/);
  assert.match(body, /pg_catalog\.round\(coalesce\(rateio\.valor_total, 0\), 2\)/);
  assert.match(body, /greatest\(despesa\.created_at::date, rateio\.created_at::date\)/);
  assert.match(body, /WHEN rateio\.status = 'PAGO' THEN coalesce\(rateio\.valor_total, 0\)[\s\S]*ELSE 0/);
  assert.match(body, /titulos AS MATERIALIZED \([\s\S]*pg_catalog\.bool_and\(paga_no_corte\)/);
  assert.match(body, /count\(DISTINCT chave\)/);
  assert.match(body, /obrigacao\.status IN \('PENDENTE', 'VENCIDO', 'ESTORNADO'\)/);
  assert.match(body, /obrigacao\.status = 'PAGO'[\s\S]*obrigacao\.data_pagamento > v_data_corte/);
});

test('entradas inválidas e qualidade de dados permanecem explícitas', () => {
  assert.match(body, /v_competencia > pg_catalog\.date_trunc\('month', v_hoje\)/);
  assert.match(body, /v_meses_historico < 1 OR v_meses_historico > 12/);
  assert.match(body, /FROM public\.polos polo[\s\S]*polo\.status = 'ativo'/);
  assert.match(body, /obrigacoes_sem_vencimento/);
  assert.match(body, /obrigacoes_sem_data_registro/);
  assert.match(body, /pagamentos_sem_data/);
  assert.match(body, /pagamentos_sem_valor/);
  assert.match(body, /PAGAMENTOS_SEM_VALOR/);
  assert.match(body, /rateio\.status = 'PAGO' AND rateio\.valor_total IS NULL/);
  assert.match(body, /pagamentos_parciais_sem_estado/);
  assert.match(body, /PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO/);
  assert.doesNotMatch(body, /coalesce\(conta\.valor_pago, conta\.valor/);
  assert.doesNotMatch(body, /coalesce\(despesa\.valor_pago, despesa\.valor/);
  assert.match(body, /'historico_contas_pagar_completo', v_historico_completo/);
});
