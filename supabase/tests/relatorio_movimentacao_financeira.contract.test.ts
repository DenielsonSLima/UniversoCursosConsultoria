import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260812010242_create_separated_financial_reports.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const reportFunction = sql.match(
  /create or replace function public\.get_relatorio_movimentacao_financeira_secure\([\s\S]*?\$function\$;/i,
 )?.[0] ?? '';

Deno.test('contrato cobre as cinco visões financeiras e os filtros no servidor', () => {
  for (const type of ['EXTRATO_CONTA', 'ENTRADAS', 'SAIDAS', 'RECEITAS', 'DESPESAS']) {
    assert.ok(reportFunction.includes(`'${type}'`), `Visão ausente: ${type}`);
  }

  for (const filter of [
    'p_data_inicio',
    'p_data_fim',
    'p_conta_bancaria_id',
    'p_categoria',
    'p_status',
    'p_busca',
  ]) {
    assert.ok(reportFunction.includes(filter), `Filtro ausente: ${filter}`);
  }

  assert.match(reportFunction, /v_fim - v_inicio > 731/i);
  assert.match(reportFunction, /v_limite constant integer := 1000/i);
  assert.match(reportFunction, /v_total <= v_limite/i);
  assert.match(reportFunction, /Filtro por conta é aplicável somente ao extrato e ao fluxo de caixa/i);
});

Deno.test('extrato só usa movimentos físicos e não inventa saldo sem base', () => {
  assert.match(
    reportFunction,
    /v_tipo = 'EXTRATO_CONTA' AND p_conta_bancaria_id IS NULL[\s\S]*Selecione uma conta bancária/i,
  );
  assert.match(reportFunction, /transferencia\.tipo = 'FISICA'/i);
  assert.match(reportFunction, /v_conta_data_saldo IS NOT NULL[\s\S]*v_conta_data_saldo <= v_inicio/i);
  assert.match(reportFunction, /conta é compartilhada entre polos/i);
  assert.match(reportFunction, /acesso\.created_at::date <= v_fim/i);
  assert.match(reportFunction, /v_conta_acesso_desde IS NULL OR v_conta_acesso_desde <= v_inicio/i);
  assert.match(reportFunction, /Movimentos anteriores ao vínculo e os saldos foram ocultados/i);
  assert.match(reportFunction, /saldo_apos/i);
});

Deno.test('o escopo da conta compartilhada fecha o CASE antes do INTO', () => {
  assert.match(
    reportFunction,
    /case\s+when p_polo_id is null or cb\.polo_id = p_polo_id then null::date\s+else \([\s\S]*?acesso\.polo_id = p_polo_id[\s\S]*?\)\s+end\s+into/i,
  );
});

Deno.test('resultado operacional não mistura principal de empréstimo', () => {
  assert.match(
    reportFunction,
    /v_tipo = 'RECEITAS'[\s\S]*not exists \([\s\S]*emprestimo\.conta_receber_id = recebimento\.id/i,
  );
  assert.match(
    reportFunction,
    /v_tipo = 'DESPESAS'[\s\S]*pagamento\.emprestimo_parcela_id IS NULL[\s\S]*coalesce\(pagamento\.categoria, ''\) <> 'EMPRESTIMO'/i,
  );
  assert.match(reportFunction, /'ENCARGOS_FINANCIAMENTO'/i);
  assert.match(reportFunction, /coalesce\(parcela\.valor_encargos, 0\) > 0/i);
  assert.match(reportFunction, /from public\.emprestimo_parcela_rateios rateio/i);
  assert.match(reportFunction, /emprestimo\.rateio_modo IN \('TODOS', 'SELECIONADOS'\)/i);
  assert.match(reportFunction, /coalesce\(emprestimo\.rateio_modo, 'SEM_RATEIO'\) = 'SEM_RATEIO'/i);
  assert.match(reportFunction, /from public\.despesas_lancamentos_rateios rateio/i);
  assert.match(reportFunction, /'DESPESA_RATEADA'/i);
  assert.match(reportFunction, /coalesce\(despesa\.rateio_modo, 'SEM_RATEIO'\) = 'SEM_RATEIO'/i);
  assert.match(reportFunction, /upper\(coalesce\(recebimento\.categoria, 'MENSALIDADE'\)\) = 'MENSALIDADE'/i);
  assert.match(reportFunction, /coalesce\(pagamento\.categoria, ''\) <> 'ADIANTAMENTO_CEDIDO'/i);
  assert.match(reportFunction, /WHEN pagamento\.emprestimo_parcela_id IS NULL THEN 'PAGAMENTO' ELSE 'FINANCIAMENTO'/i);
});

Deno.test('fluxos sem conta continuam auditáveis e não são apresentados como conciliados', () => {
  assert.match(reportFunction, /v_movimentos_sem_conta integer := 0/i);
  assert.match(reportFunction, /Há .*movimento\(s\) sem conta bancária definida/i);
  assert.match(reportFunction, /não conciliam com extratos por conta/i);
  assert.match(reportFunction, /saldos consideram todos os movimentos físicos da conta no período/i);
});

Deno.test('RPC é escopada ao módulo Relatórios e aplica menor privilégio', () => {
  assert.match(reportFunction, /security definer[\s\S]*set search_path = ''/i);
  assert.match(reportFunction, /public\.gestor_has_module\('relatorios'\)/i);
  assert.match(reportFunction, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  assert.match(reportFunction, /public\.is_gestor_global\(\)/i);
  assert.match(reportFunction, /public\.is_gestor_for_polo\(p_polo_id\)/i);
  assert.match(
    sql,
    /revoke all on function public\.get_relatorio_movimentacao_financeira_secure\([\s\S]*?from public, anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_relatorio_movimentacao_financeira_secure\([\s\S]*?to authenticated, service_role/i,
  );
});

Deno.test('a policy de Realtime preserva o acesso já existente a Outros Créditos', () => {
  assert.match(sql, /gestor_has_financeiro_tab\('outros-debitos'\)[\s\S]*gestor_has_financeiro_tab\('outros-creditos'\)/i);
});
