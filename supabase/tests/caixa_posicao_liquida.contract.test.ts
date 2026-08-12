import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260810232126_add_caixa_valor_liquido.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionDefinition = (name: string) => sql.match(
  new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'),
)?.[0] ?? '';

const financiamento = functionDefinition('get_caixa_financiamento_resumo_secure');
const posicaoLiquida = functionDefinition('get_caixa_posicao_liquida_resumo_secure');
const detailedReport = functionDefinition('get_caixa_relatorio_mensal_detalhado_secure');

Deno.test('saldo de empréstimos a pagar usa o fechamento da competência sem duplicar rateio', () => {
  for (const fragment of [
    "v_fechamento date := (date_trunc('month'",
    "emprestimo.rateio_modo in ('TODOS', 'SELECIONADOS')",
    "emprestimo.rateio_modo = 'SEM_RATEIO'",
    'emprestimo.data_liberacao <= v_fechamento',
    "emprestimo.status <> 'CANCELADO'",
    "parcela.status <> 'CANCELADO'",
    '(parcela.data_pagamento is null or parcela.data_pagamento > v_fechamento)',
    "'saldo_emprestimos_a_pagar'",
    'round(v_saldo_emprestimos_a_pagar, 2)::text',
  ]) {
    assert.ok(financiamento.includes(fragment), `Regra do saldo devedor ausente: ${fragment}`);
  }
  assert.doesNotMatch(financiamento, /from public\.contas_pagar/i);
});

Deno.test('posição líquida é canônica, decimal e exige as duas leituras autorizadas', () => {
  assert.match(posicaoLiquida, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    posicaoLiquida,
    /v_financiamento := public\.get_caixa_financiamento_resumo_secure\([\s\S]*p_polo_id,[\s\S]*v_inicio/i,
  );
  assert.match(
    posicaoLiquida,
    /v_patrimonio := public\.get_caixa_patrimonio_resumo_secure\([\s\S]*p_polo_id,[\s\S]*v_inicio/i,
  );
  assert.match(
    posicaoLiquida,
    /'valor_patrimonial_custo', round\(v_valor_patrimonial_custo, 2\)::text/i,
  );
  assert.match(
    posicaoLiquida,
    /'saldo_emprestimos_a_pagar', round\(v_saldo_emprestimos_a_pagar, 2\)::text/i,
  );
  assert.match(
    posicaoLiquida,
    /'valor_liquido', round\(v_valor_patrimonial_custo - v_saldo_emprestimos_a_pagar, 2\)::text/i,
  );
  assert.doesNotMatch(posicaoLiquida, /from public\.(?:patrimonios|emprestimos_financeiros|emprestimo_parcelas)/i);
});

Deno.test('relatório v5 preserva as posições anteriores e isola a posição líquida sem escopo', () => {
  assert.match(
    sql,
    /alter function public\.get_caixa_relatorio_mensal_detalhado_secure\(uuid, date\)[\s\S]*rename to get_caixa_relatorio_mensal_detalhado_v4_core/i,
  );
  assert.match(
    detailedReport,
    /v_relatorio := public\.get_caixa_relatorio_mensal_detalhado_v4_core\([\s\S]*p_polo_id,[\s\S]*p_competencia/i,
  );
  assert.match(
    detailedReport,
    /'disponivel', true,[\s\S]*'dados', public\.get_caixa_posicao_liquida_resumo_secure\([\s\S]*p_polo_id,[\s\S]*p_competencia/i,
  );
  assert.match(
    detailedReport,
    /exception when insufficient_privilege then[\s\S]*'disponivel', false,[\s\S]*'motivo', 'ACESSO_RESTRITO'/i,
  );
  assert.match(detailedReport, /'versao', 5,[\s\S]*'posicao_liquida', v_posicao_liquida/i);
  assert.doesNotMatch(detailedReport, /resumo_competencia/i);
});

Deno.test('nova leitura e núcleo anterior mantêm menor privilégio', () => {
  assert.match(
    sql,
    /revoke all on function public\.get_caixa_posicao_liquida_resumo_secure\(uuid, date\)[\s\S]*from public, anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_caixa_posicao_liquida_resumo_secure\(uuid, date\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_caixa_relatorio_mensal_detalhado_v4_core\(uuid, date\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
});
