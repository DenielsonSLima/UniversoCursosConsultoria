import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const migration = (name: string) => readFileSync(resolve(root, 'supabase/migrations', name), 'utf8');

const core = migration('20260927030000_convenios_financeiros_core.sql');
const reads = migration('20260927030100_convenios_financeiros_reads.sql');
const mutations = migration('20260927030200_convenios_financeiros_mutations.sql');
const expenses = migration('20260927030300_convenios_financeiros_expenses_close.sql');
const expenseRead = migration('20260927030400_convenios_financeiros_expense_read.sql');
const caixa = migration('20260927030500_convenios_financeiros_caixa_realtime.sql');
const report = migration('20260927030600_convenios_financeiros_caixa_report_v7.sql');
const otherCredits = migration('20260927030700_convenios_financeiros_separate_other_credits.sql');
const fullAccessBackfill = migration('20260927030900_convenios_financeiros_full_access_backfill.sql');
const partnerHardening = migration('20260927133000_convenios_faculdades_parceiras.sql');
const partnerScope = migration('20260927134000_convenios_faculdades_parceiras_scope_global.sql');

const functionBody = (source: string, name: string) => {
  const markers = [
    `CREATE FUNCTION public.${name}(`,
    `CREATE OR REPLACE FUNCTION public.${name}(`,
  ];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0) ?? -1;
  assert.notEqual(start, -1, `RPC ${name} deve existir.`);
  const end = source.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return source.slice(start, end);
};

test('schema mantém um mês aberto, sucessão única, RLS e trilha imutável', () => {
  for (const table of [
    'convenios_financeiros',
    'convenios_financeiros_competencias',
    'convenios_financeiros_creditos',
    'convenios_financeiros_despesas',
    'convenios_financeiros_operacoes_requisicoes',
  ]) {
    assert.match(core, new RegExp(`CREATE TABLE public\\.${table}`));
    assert.match(core, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(core, /convenios_financeiros_um_mes_aberto_uidx[\s\S]*WHERE status = 'ABERTO'/);
  assert.match(core, /competencia_anterior_id uuid UNIQUE/);
  assert.match(core, /UNIQUE \(convenio_id, competencia\)/);
  assert.match(core, /competencia_anterior_id IS NOT NULL OR saldo_inicial = 0/);
  assert.match(core, /saldo_final >= 0/);
  assert.match(core, /gestor_has_financeiro_tab\('convenios'\)/);
  assert.match(core, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch([core, reads, mutations, expenses].join('\n'), /DELETE FROM public\.convenios_financeiros/);
});

test('RPCs públicas possuem nomes e shapes fechados combinados com o produto', () => {
  for (const name of [
    'listar_faculdades_parceiras_convenio_secure',
    'listar_convenios_financeiros_meses_secure',
    'obter_convenio_financeiro_mes_secure',
    'criar_convenio_financeiro_secure',
    'lancar_credito_convenio_financeiro_secure',
    'finalizar_convenio_financeiro_mes_secure',
  ]) {
    assert.ok([reads, mutations, expenses, partnerHardening, partnerScope].some((source) => source.includes(`FUNCTION public.${name}(`)));
  }
  for (const field of [
    'convenios_ativos', 'meses_abertos', 'meses_finalizados', 'saldo_inicial',
    'creditos', 'despesas_pagas', 'despesas_pendentes', 'saldo_disponivel',
    'saldo_projetado', 'convenio_nome', 'parceiro_nome', 'polo_nome', 'sucessora_id',
  ]) {
    assert.ok(reads.includes(`'${field}'`), `Campo de lista ausente: ${field}`);
  }
  assert.match(reads, /'tipo', tipo, 'status', status, 'data', data/);
  assert.match(reads, /'mes'.*convenios_financeiros_mes_item_secure/s);
  assert.match(reads, /'movimentos'.*v_movimentos/s);
});

test('criação abre primeiro mês com saldo zero e replay compara o payload', () => {
  const body = functionBody(partnerScope, 'criar_convenio_financeiro_secure');
  const authorization = body.indexOf("gestor_has_effective_financeiro_tab('convenios')");
  const replay = body.indexOf('SELECT * INTO v_replay');
  assert.ok(authorization >= 0 && replay > authorization);
  assert.match(body, /competencia, saldo_inicial,[\s\S]*v_competencia, 0,/);
  assert.match(body, /payload_hash <> v_hash/);
  assert.match(body, /jsonb_set\(v_replay\.resultado, '\{replayed\}'/);
  assert.match(body, /SELECT parceiro\.nome INTO v_nome/);
  assert.match(body, /parceiro\.tipo = 'PJ'/);
  assert.match(body, /FACULDADE PARCEIRA \/ AFILIADO/);
  assert.match(body, /parceiro\.polo_id IS NULL/);
  assert.match(body, /parceiro\.polo_id = p_polo_id/);
  assert.doesNotMatch(body, /v_nome text :=[^;]*p_nome/);
});

test('opções de convênio listam somente faculdades PJ no escopo autorizado', () => {
  const body = functionBody(partnerScope, 'listar_faculdades_parceiras_convenio_secure');
  assert.match(body, /gestor_has_effective_financeiro_tab\('convenios'\)/);
  assert.match(body, /parceiro\.status = 'ATIVO'/);
  assert.match(body, /parceiro\.tipo = 'PJ'/);
  assert.match(body, /FACULDADE PARCEIRA \/ AFILIADO/);
  assert.match(body, /parceiro\.polo_id IS NULL/);
  assert.match(body, /parceiro\.polo_id = p_polo_id/);
  assert.match(partnerHardening, /REVOKE ALL[\s\S]*listar_faculdades_parceiras_convenio_secure\(uuid\)[\s\S]*FROM PUBLIC, anon/);
});

test('crédito é recebimento físico pago e não duplica Outros Créditos', () => {
  const body = functionBody(mutations, 'lancar_credito_convenio_financeiro_secure');
  assert.match(body, /FROM public\.convenios_financeiros_competencias[\s\S]*FOR UPDATE/);
  assert.match(body, /conta_bancaria_disponivel_no_polo/);
  assert.match(body, /INSERT INTO public\.contas_receber/);
  assert.match(body, /'PAGO', v_forma,[\s\S]*'OUTROS_CREDITOS'/);
  assert.match(body, /INSERT INTO public\.convenios_financeiros_creditos/);
  assert.match(body, /p_data_credito < v_mes\.competencia/);
  assert.match(mutations, /CREATE TRIGGER convenios_financeiros_credito_update_guard/);
  assert.match(otherCredits, /convenios_financeiros_creditos/);
  assert.match(otherCredits, /conta_receber_id = \(item ->> 'id'\)::uuid/);
});

test('wrapper de despesa é atômico, integral, do mesmo polo e protege o saldo', () => {
  const body = functionBody(expenses, 'criar_despesa_convenio_secure');
  assert.match(body, /p_convenio_mes_id uuid/);
  assert.match(body, /WHERE id = p_convenio_mes_id FOR UPDATE/);
  assert.match(body, /p_polo_id IS DISTINCT FROM v_mes\.polo_id/);
  assert.match(body, /p_total_parcelas, 1\) <> 1/);
  assert.match(body, /saldo_projetado/);
  assert.match(body, /Saldo insuficiente no convênio/);
  assert.match(body, /FROM public\.criar_despesa_secure\(/);
  assert.match(body, /INSERT INTO public\.convenios_financeiros_despesas/);
  assert.ok(body.indexOf('criar_despesa_secure') < body.indexOf('convenios_financeiros_despesas'));
});

test('fechamento bloqueia pendências e cria sucessora com carry sem receita', () => {
  const body = functionBody(expenses, 'finalizar_convenio_financeiro_mes_secure');
  const authorization = body.indexOf("gestor_has_effective_financeiro_tab('convenios')");
  const replay = body.indexOf('SELECT * INTO v_replay');
  assert.ok(authorization >= 0 && replay > authorization);
  assert.match(body, /despesa\.status IN \('PENDENTE', 'VENCIDO'\)/);
  assert.match(body, /status = 'FINALIZADO'/);
  assert.match(body, /creditos_fechamento = v_creditos/);
  assert.match(body, /despesas_fechamento = v_despesas/);
  assert.match(body, /saldo_final = v_saldo/);
  assert.match(body, /\(v_mes\.competencia \+ interval '1 month'\)::date, v_saldo, v_mes\.id/);
  assert.doesNotMatch(body, /INSERT INTO public\.contas_receber/);
});

test('mês fechado protege a despesa e leitura canônica expõe o badge', () => {
  const trigger = functionBody(expenses, 'convenios_financeiros_sincronizar_despesa');
  assert.match(trigger, /v_mes\.status = 'FINALIZADO'/);
  assert.match(trigger, /Despesa vinculada a convênio finalizado não pode ser alterada/);
  for (const field of [
    'convenio_mes_id uuid', 'convenio_id uuid',
    'convenio_nome text', 'convenio_competencia date',
  ]) {
    assert.ok(expenseRead.includes(field), `Campo do badge ausente: ${field}`);
  }
  assert.match(expenseRead, /vinculo\.status = 'ATIVO'/);
});

test('despesa vinculada preserva competência e exige RBAC de Convênios nas alterações', () => {
  assert.match(expenses, /gestor_has_effective_financeiro_tab\('convenios'\)/);
  assert.match(expenses, /NEW\.data_lancamento < v_mes\.competencia/);
  assert.match(expenses, /BEFORE UPDATE OF[\s\S]*data_lancamento, polo_id/);
  assert.match(expenseRead, /CASE WHEN auth\.role\(\) = 'service_role'[\s\S]*gestor_has_effective_financeiro_tab\('convenios'\)/);
});

test('Caixa e relatório v7 recebem recorte sem alterar totais físicos', () => {
  const body = functionBody(caixa, 'get_caixa_convenios_resumo_secure');
  for (const field of [
    'versao', 'competencia', 'escopo_tipo', 'polo_id', 'quantidade_convenios',
    'saldo_inicial', 'creditos_recebidos', 'despesas_pagas', 'comprometido_aberto',
    'saldo_disponivel', 'saldo_projetado', 'itens',
  ]) {
    assert.ok(body.includes(`'${field}'`), `Campo do Caixa ausente: ${field}`);
  }
  assert.match(caixa, /gestor_has_financeiro_tab\('convenios'\)/);
  assert.doesNotMatch(body, /gestor_has_module\('caixa'\)/);
  assert.match(caixa, /emit_caixa_realtime_event\('ROW'\)/);
  assert.match(report, /RENAME TO get_caixa_relatorio_mensal_detalhado_v6_core/);
  assert.match(report, /'versao', 7/);
  assert.match(report, /'convenios', v_convenios/);
  assert.match(report, /'motivo', 'ACESSO_RESTRITO'/);
});

test('backfill libera Convênios somente para acessos financeiros completos anteriores', () => {
  assert.match(fullAccessBackfill, /UPDATE public\.perfis_acesso/);
  assert.match(fullAccessBackfill, /UPDATE public\.usuarios_sistema/);
  assert.match(fullAccessBackfill, /jsonb_build_array\('convenios'\)/);
  assert.match(fullAccessBackfill, /NOT coalesce\([\s\S]*\? 'convenios'/);
  assert.match(fullAccessBackfill, /'resumo', 'receber', 'despesas', 'emprestimos', 'transferencias'/);
  assert.match(fullAccessBackfill, /'conciliacao-bancaria', 'outros-debitos', 'outros-creditos'/);
  assert.match(fullAccessBackfill, /personalizar_permissoes/);
  assert.doesNotMatch(fullAccessBackfill, /WHERE\s+true/i);
  assert.doesNotMatch(fullAccessBackfill, /UPDATE public\.usuarios_sistema\s+SET[\s\S]*?;\s*COMMIT;/i);
});
