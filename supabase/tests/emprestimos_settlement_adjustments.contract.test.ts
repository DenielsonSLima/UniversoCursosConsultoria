import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260811042037_add_loan_settlement_adjustments.sql'),
  'utf8',
);

const functionBody = (name: string) => {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir.`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return migration.slice(start, end);
};

test('ajustes de baixa preservam obrigação contratual e deixam a composição auditável', () => {
  for (const fragment of [
    'ADD COLUMN IF NOT EXISTS valor_base numeric(14, 2)',
    'ADD COLUMN IF NOT EXISTS juros_valor numeric(14, 2) NOT NULL DEFAULT 0',
    'ADD COLUMN IF NOT EXISTS multa_valor numeric(14, 2) NOT NULL DEFAULT 0',
    'ADD COLUMN IF NOT EXISTS desconto_valor numeric(14, 2) NOT NULL DEFAULT 0',
    'ADD COLUMN IF NOT EXISTS observacao text',
    'GENERATED ALWAYS AS',
    'emprestimo_parcela_baixas_valores_validos_chk',
    'emprestimo_parcela_baixas_observacao_chk',
    'emprestimo_parcela_rateios_valor_pago_chk',
  ]) {
    assert.ok(migration.includes(fragment), `Contrato de auditoria ausente: ${fragment}`);
  }
  assert.doesNotMatch(migration, /UPDATE\s+public\.emprestimo_parcelas\s+SET\s+valor_total/i);
  assert.doesNotMatch(migration, /UPDATE\s+public\.emprestimo_parcela_rateios\s+SET\s+valor_total/i);
});

test('RPC de baixa recebe ajustes, calcula no banco e mantém replay idempotente', () => {
  const body = functionBody('baixar_emprestimo_parcelas_polo_secure');

  for (const fragment of [
    'p_juros_valor numeric DEFAULT 0',
    'p_multa_valor numeric DEFAULT 0',
    'p_desconto_valor numeric DEFAULT 0',
    'p_observacao text DEFAULT NULL',
    'v_juros_total := round(coalesce(p_juros_valor, 0), 2)',
    'public.financeiro_dividir_centavos',
    "'jurosValor', v_juros_total",
    'v_valor_pago_parcela',
    'valor_pago = v_valor_pago_parcela',
    'valor_pago = v_valor_pago_rateio',
    'observacao',
    'emprestimos_financeiros_operacoes_requisicoes',
  ]) {
    assert.ok(body.includes(fragment), `Contrato de baixa ausente: ${fragment}`);
  }
  assert.ok(
    body.indexOf("IF auth.role() <> 'service_role'") < body.indexOf('FROM public.emprestimos_financeiros_operacoes_requisicoes operacao'),
    'a autorização deve anteceder o replay idempotente',
  );
});

test('listagem e Caixa usam o valor efetivo sem reescrever a dívida contratada', () => {
  assert.match(migration, /'juros_valor', coalesce\(baixa\.juros_valor, 0\)/);
  assert.match(migration, /'observacao_baixa', baixa\.observacao/);
  assert.match(migration, /coalesce\(rateio\.valor_pago, rateio\.valor_total\)/);
  assert.match(migration, /'ajustes_baixa_rateados', v_ajustes_baixa_rateados/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.baixar_emprestimo_parcela_polo_secure/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.baixar_emprestimo_parcelas_polo_secure/);
});
