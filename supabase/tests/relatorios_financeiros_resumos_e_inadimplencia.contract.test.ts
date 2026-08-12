import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260812141118_add_financial_report_summaries_and_ar_aging.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const fluxo = sql.match(
  /create or replace function public\.get_relatorio_fluxo_caixa_secure\([\s\S]*?\$function\$;/i,
)?.[0] ?? '';
const inadimplencia = sql.match(
  /create or replace function public\.get_relatorio_inadimplencia_secure\([\s\S]*?\$function\$;/i,
)?.[0] ?? '';

Deno.test('resumo por categoria evolui o contrato canônico antes do limite da prévia', () => {
  assert.match(sql, /pg_get_functiondef\([\s\S]*get_relatorio_movimentacao_financeira_secure/i);
  assert.match(sql, /'CATEGORIAS'/);
  assert.match(sql, /v_agregacoes jsonb/i);
  assert.match(sql, /agregacoes_categorias AS/i);
  assert.match(sql, /agregacoes_classificacoes AS/i);
  assert.match(sql, /agregacoes_origens AS/i);
  assert.match(sql, /FROM movimentos_filtrados/i);
  assert.match(sql, /'agregacoes', v_agregacoes/i);
  assert.match(sql, /FILTER \(WHERE sequencia <= v_limite\)/i);
});

Deno.test('fluxo de caixa reaproveita semânticas canônicas e mantém o RBAC', () => {
  assert.match(fluxo, /security definer[\s\S]*set search_path = ''/i);
  assert.match(fluxo, /public\.gestor_has_module\('relatorios'\)/i);
  assert.match(fluxo, /public\.is_gestor_global\(\)/i);
  assert.match(fluxo, /public\.is_gestor_for_polo\(p_polo_id\)/i);
  assert.match(fluxo, /get_relatorio_movimentacao_financeira_secure\([\s\S]*'ENTRADAS'/i);
  assert.match(fluxo, /get_relatorio_movimentacao_financeira_secure\([\s\S]*'SAIDAS'/i);
  assert.match(fluxo, /get_relatorio_movimentacao_financeira_secure\([\s\S]*'RECEITAS'/i);
  assert.match(fluxo, /get_relatorio_movimentacao_financeira_secure\([\s\S]*'DESPESAS'/i);
  assert.match(fluxo, /v_fluxo_projetado := v_fluxo_realizado \+ v_receitas_em_aberto - v_despesas_em_aberto/i);
  assert.match(fluxo, /Não representa saldo físico de conta bancária/i);
});

Deno.test('aging de inadimplência usa saldo residual, corte e faixas de atraso', () => {
  assert.match(inadimplencia, /security definer[\s\S]*set search_path = ''/i);
  assert.match(inadimplencia, /public\.gestor_has_module\('relatorios'\)/i);
  assert.match(inadimplencia, /p_data_corte/i);
  assert.match(inadimplencia, /recebimento\.data_vencimento < v_corte/i);
  assert.match(inadimplencia, /liquidacao_manual\.principal_cents/i);
  assert.match(inadimplencia, /recebimento\.valor_pago/i);
  assert.match(inadimplencia, /liquidacao_manual\.payment_date <= v_corte/i);
  assert.match(inadimplencia, /recebimento\.data_pagamento <= v_corte/i);
  assert.match(inadimplencia, /manual_settlement_reversed_at/i);
  assert.match(inadimplencia, /AT TIME ZONE 'America\/Maceio'/i);
  assert.match(inadimplencia, /upper\(coalesce\(recebimento\.status, ''\)\) = 'PAGO'/i);
  assert.match(inadimplencia, /pagamentos posteriores à data de corte não reduzem o saldo/i);
  assert.match(inadimplencia, /valor_em_aberto > 0/i);
  assert.match(inadimplencia, /'1_7'/);
  assert.match(inadimplencia, /'8_30'/);
  assert.match(inadimplencia, /'31_60'/);
  assert.match(inadimplencia, /'61_90'/);
  assert.match(inadimplencia, /'MAIS_90'/);
  assert.match(inadimplencia, /count\(DISTINCT coalesce\(cliente_id::text, id::text\)\)/i);
  assert.match(inadimplencia, /'percentual_comparavel', v_dias_minimo = 1 AND v_busca IS NULL/i);
  assert.match(inadimplencia, /WHEN v_dias_minimo = 1[\s\S]*AND v_busca IS NULL/i);
});

Deno.test('as novas RPCs não ficam públicas e só autenticados autorizados podem executá-las', () => {
  assert.match(sql, /revoke all on function public\.get_relatorio_fluxo_caixa_secure\([\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_relatorio_fluxo_caixa_secure\([\s\S]*to authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.get_relatorio_inadimplencia_secure\([\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_relatorio_inadimplencia_secure\([\s\S]*to authenticated, service_role/i);
});
