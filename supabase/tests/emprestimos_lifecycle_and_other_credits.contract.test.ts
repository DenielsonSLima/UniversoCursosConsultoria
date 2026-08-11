import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const loanMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260811035347_harden_loan_lifecycle_batch_settlement_and_export.sql'),
  'utf8',
);
const otherCreditsMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260811035350_separate_loan_credits_from_other_credits.sql'),
  'utf8',
);

const functionBody = (migration: string, name: string) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir.`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return migration.slice(start, end);
};

test('baixa em lote é autorizada antes do replay, atomiza as parcelas e atualiza o contrato pai', () => {
  const body = functionBody(loanMigration, 'baixar_emprestimo_parcelas_polo_secure');
  const authorization = body.indexOf("IF auth.role() <> 'service_role'");
  const selection = body.indexOf('SELECT array_agg(DISTINCT parcela_id');
  const replay = body.indexOf('FROM public.emprestimos_financeiros_operacoes_requisicoes operacao');

  assert.ok(authorization >= 0);
  assert.ok(selection >= 0);
  assert.ok(replay >= 0);
  assert.ok(authorization < selection, 'autorização deve preceder seleção/replay');
  assert.match(body, /p_emprestimo_parcela_ids uuid\[\]/);
  assert.match(body, /FOR UPDATE/);
  assert.match(body, /INSERT INTO public\.emprestimo_parcela_baixas/);
  assert.match(body, /UPDATE public\.emprestimo_parcelas/);
  assert.match(body, /UPDATE public\.emprestimos_financeiros/);
  assert.match(body, /'QUITADO'/);
  assert.doesNotMatch(body, /DELETE\s+FROM/i);
});

test('cancelamento/estorno preserva trilha, crédito e histórico financeiro', () => {
  const body = functionBody(loanMigration, 'cancelar_ou_estornar_emprestimo_financeiro_secure');

  for (const fragment of [
    'p_confirmar_estorno boolean DEFAULT false',
    'cancelamento_motivo = v_motivo',
    "SET status = CASE WHEN credito.status = 'PAGO' THEN 'ESTORNADO' ELSE 'CANCELADO' END",
    "SET status = CASE WHEN conta.status = 'PAGO' THEN 'ESTORNADO' ELSE 'CANCELADO' END",
    "SET status = 'CANCELADO'",
    "'CANCELAR_OU_ESTORNAR'",
    'emprestimos_financeiros_operacoes_requisicoes',
  ]) {
    assert.ok(body.includes(fragment), `Contrato de estorno ausente: ${fragment}`);
  }
  assert.doesNotMatch(body, /DELETE\s+FROM/i);
});

test('listagem e exportação devolvem a conta de crédito e snapshot ordenado do backend', () => {
  const listBody = functionBody(loanMigration, 'listar_emprestimos_financeiros_polo_secure');
  const exportBody = functionBody(loanMigration, 'preparar_relatorio_emprestimos_financeiros_secure');

  assert.match(listBody, /'conta_credito', jsonb_build_object/);
  assert.match(listBody, /LEFT JOIN public\.contas_bancarias conta_credito/);
  assert.match(listBody, /'valor_pago', totais\.valor_pago/);
  assert.match(listBody, /'valor_pendente', totais\.valor_pendente/);
  assert.match(listBody, /LEFT JOIN LATERAL \([\s\S]*parcela_totais\.status = 'PAGO'/);
  assert.match(listBody, /parcela_totais\.status IN \('PENDENTE', 'VENCIDO'\)/);
  assert.match(listBody, /'possui_baixa'/);
  assert.match(exportBody, /listar_emprestimos_financeiros_polo_secure\(p_polo_id\)/);
  assert.match(exportBody, /'statusScope', v_scope/);
  assert.match(exportBody, /'total', jsonb_array_length\(v_items\)/);
  assert.match(exportBody, /ORDER BY ordinalidade/);
});

test('Outros Créditos exclui empréstimos sem alterar categoria ou o vínculo do Caixa', () => {
  const listBody = functionBody(otherCreditsMigration, 'listar_outros_creditos_secure');
  const summaryBody = functionBody(otherCreditsMigration, 'get_outros_creditos_summary');

  for (const body of [listBody, summaryBody]) {
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path TO ''/);
    assert.match(body, /gestor_has_effective_financeiro_tab\('outros-creditos'\)/);
    assert.match(body, /NOT EXISTS \([\s\S]*emprestimos_financeiros emprestimo[\s\S]*conta_receber_id = credito\.id/);
  }
  assert.doesNotMatch(otherCreditsMigration, /UPDATE\s+public\.contas_receber[\s\S]*categoria/i);
  assert.match(otherCreditsMigration, /GRANT EXECUTE ON FUNCTION public\.listar_outros_creditos_secure/);
  assert.match(otherCreditsMigration, /gestor_has_financeiro_tab\('outros-creditos'\)/);
});
