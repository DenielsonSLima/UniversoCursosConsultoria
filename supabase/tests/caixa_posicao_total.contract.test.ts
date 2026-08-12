import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260810235455_add_caixa_posicao_total.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionDefinition = (name: string) => sql.match(
  new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'),
)?.[0] ?? '';

const posicaoTotal = functionDefinition('get_caixa_posicao_total_resumo_secure');
const detailedReport = functionDefinition('get_caixa_relatorio_mensal_detalhado_secure');
const saldoDevedor = posicaoTotal.match(/with saldo_devedor as \([\s\S]*?\)\s*select coalesce\(sum\(valor_total\), 0\)/i)?.[0] ?? '';
const caixaHistorico = posicaoTotal.match(/-- Não há trilha temporal[\s\S]*?into v_saldo_caixa_registrado[\s\S]*?from movimentos movimento;/i)?.[0] ?? '';

Deno.test('posição total fixa o corte comum e não aceita competência futura', () => {
  assert.match(posicaoTotal, /v_competencia > date_trunc\('month', current_date\)::date/i);
  assert.match(posicaoTotal, /using errcode = '22023'/i);
  assert.match(
    posicaoTotal,
    /v_data_corte := least\([\s\S]*v_competencia \+ interval '1 month - 1 day'[\s\S]*current_date/i,
  );
  assert.match(posicaoTotal, /'competencia', to_char\(v_competencia, 'YYYY-MM-DD'\)/i);
  assert.match(posicaoTotal, /'data_corte', to_char\(v_data_corte, 'YYYY-MM-DD'\)/i);
});

Deno.test('falta de escopo e histórico ficam discriminados, sem zero substituto', () => {
  assert.match(
    posicaoTotal,
    /exception when insufficient_privilege then[\s\S]*'disponivel', false,[\s\S]*'motivo', 'ACESSO_RESTRITO'/i,
  );
  assert.match(caixaHistorico, /conta\.data_saldo is null[\s\S]*conta\.data_saldo > v_data_corte/i);
  assert.match(
    posicaoTotal,
    /if v_contas_sem_historico > 0 then[\s\S]*'disponivel', false,[\s\S]*'motivo', 'HISTORICO_INSUFICIENTE'/i,
  );
  assert.doesNotMatch(
    posicaoTotal.match(/if v_contas_sem_historico > 0 then[\s\S]*?end if;/i)?.[0] ?? '',
    /'saldo_caixa_registrado'/i,
  );
});

Deno.test('caixa no corte respeita saldo-base e não duplica conta compartilhada', () => {
  for (const fragment of [
    'public.can_access_conta_bancaria(conta.id)',
    'acesso.created_at::date <= v_data_corte',
    'case when conta.polos_em_uso > 1 then null::uuid else conta.polo_id end',
    "recebimento.status = 'PAGO'",
    "pagamento.despesa_lancamento_id is null",
    "despesa.status = 'PAGO'",
    "transferencia.tipo = 'FISICA'",
    'polo_movimento_id = p_polo_id',
  ]) {
    assert.ok(caixaHistorico.includes(fragment), `Regra de caixa ausente: ${fragment}`);
  }
});

Deno.test('empréstimos mantêm a alocação econômica e não usam o título físico', () => {
  for (const fragment of [
    "emprestimo.rateio_modo in ('TODOS', 'SELECIONADOS')",
    "emprestimo.rateio_modo = 'SEM_RATEIO'",
    'emprestimo.data_liberacao <= v_data_corte',
    '(parcela.data_pagamento is null or parcela.data_pagamento > v_data_corte)',
    "rateio.status <> 'CANCELADO'",
  ]) {
    assert.ok(saldoDevedor.includes(fragment), `Regra de empréstimo ausente: ${fragment}`);
  }
  assert.doesNotMatch(saldoDevedor, /from public\.contas_pagar/i);
});

Deno.test('resultado final é canônico e o relatório v6 transporta o mesmo contrato', () => {
  for (const fragment of [
    "'saldo_caixa_registrado', round(v_saldo_caixa_registrado, 2)::text",
    "'valor_patrimonial_custo', round(v_valor_patrimonial_custo, 2)::text",
    "'saldo_emprestimos_a_pagar', round(v_saldo_emprestimos_a_pagar, 2)::text",
    "'valor_total_liquido', round(",
    'v_saldo_caixa_registrado',
    '+ v_valor_patrimonial_custo',
    '- v_saldo_emprestimos_a_pagar',
  ]) {
    assert.ok(posicaoTotal.includes(fragment), `Campo/expressão canônica ausente: ${fragment}`);
  }
  assert.match(
    sql,
    /alter function public\.get_caixa_relatorio_mensal_detalhado_secure\(uuid, date\)[\s\S]*rename to get_caixa_relatorio_mensal_detalhado_v5_core/i,
  );
  assert.match(
    detailedReport,
    /v_relatorio := public\.get_caixa_relatorio_mensal_detalhado_v5_core\([\s\S]*p_polo_id,[\s\S]*p_competencia/i,
  );
  assert.match(
    detailedReport,
    /'versao', 6,[\s\S]*'posicao_total', public\.get_caixa_posicao_total_resumo_secure/i,
  );
});

Deno.test('RPC pública aplica menor privilégio e search path explícito', () => {
  assert.match(posicaoTotal, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    sql,
    /revoke all on function public\.get_caixa_posicao_total_resumo_secure\(uuid, date\)[\s\S]*from public, anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_caixa_posicao_total_resumo_secure\(uuid, date\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_caixa_relatorio_mensal_detalhado_v5_core\(uuid, date\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
});
