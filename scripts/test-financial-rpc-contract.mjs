import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260806232000_harden_financial_idempotency_and_patrimonio_search.sql'),
  'utf8',
);
const poloLoanMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260807037000_allow_polo_own_loans_without_rateio.sql'),
  'utf8',
);
const loanRateioRealtimeMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260806225000_emit_loan_rateio_caixa_realtime.sql'),
  'utf8',
);

const functionBody = (name) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir na migration de endurecimento.`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return migration.slice(start, end);
};

const assertAuthorizationBefore = (name, lookup) => {
  const body = functionBody(name);
  const authorization = body.indexOf("IF auth.role() <> 'service_role'");
  const sensitiveLookup = body.indexOf(lookup);

  assert.ok(authorization >= 0, `${name} deve validar autorização.`);
  assert.ok(sensitiveLookup >= 0, `${name} deve conter lookup idempotente.`);
  assert.ok(
    authorization < sensitiveLookup,
    `${name} deve autorizar antes de consultar dados por request_id.`,
  );
};

const poloLoanFunctionBody = (name) => {
  const start = poloLoanMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir na migration de empréstimo por polo.`);
  const end = poloLoanMigration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return poloLoanMigration.slice(start, end);
};

const assertPoloLoanAuthorizationBefore = (name, lookup) => {
  const body = poloLoanFunctionBody(name);
  const authorization = body.indexOf("IF auth.role() <> 'service_role'");
  const sensitiveLookup = body.indexOf(lookup);

  assert.ok(authorization >= 0, `${name} deve validar autorização.`);
  assert.ok(sensitiveLookup >= 0, `${name} deve conter o lookup protegido.`);
  assert.ok(
    authorization < sensitiveLookup,
    `${name} deve autorizar antes de consultar o recurso ou replay do polo.`,
  );
};

test('RPCs financeiras autorizam antes do replay idempotente', () => {
  assertAuthorizationBefore('criar_patrimonio_secure', 'SELECT * INTO v_existing');
  assertAuthorizationBefore('criar_despesa_com_desdobramento_secure', 'SELECT count(*) INTO v_existing_count');
  assertAuthorizationBefore('criar_emprestimo_financeiro_secure', 'SELECT * INTO v_emprestimo');
  assertAuthorizationBefore('baixar_emprestimo_parcela_matriz_secure', 'SELECT * INTO v_parcela');
});

test('desdobramento compara o payload de todas as parcelas e respeita Outros Débitos', () => {
  const body = functionBody('criar_despesa_com_desdobramento_secure');

  for (const fragment of [
    "public.gestor_has_effective_financeiro_tab('outros-debitos')",
    'generate_series(1, v_total)',
    'existente.valor_base IS DISTINCT FROM',
    'existente.data_vencimento IS DISTINCT FROM',
    'existente.anexo_tamanho IS DISTINCT FROM',
    "A chave de idempotência já foi usada com dados diferentes.",
  ]) {
    assert.ok(body.includes(fragment), `Contrato de desdobramento ausente: ${fragment}`);
  }
});

test('empréstimo audita o escopo de rateio e compara os campos imutáveis no replay', () => {
  const body = functionBody('criar_emprestimo_financeiro_secure');

  for (const fragment of [
    'rateio_modo, rateio_polo_ids',
    'v_emprestimo.data_liberacao IS DISTINCT FROM p_data_liberacao',
    'v_emprestimo.intervalo_meses IS DISTINCT FROM p_intervalo_meses',
    'v_emprestimo.conta_credito_id IS DISTINCT FROM p_conta_credito_id',
    'v_emprestimo.rateio_polo_ids IS DISTINCT FROM v_polos_solicitados',
  ]) {
    assert.ok(body.includes(fragment), `Contrato de empréstimo ausente: ${fragment}`);
  }

  assert.ok(migration.includes('emprestimos_rateio_auditavel_chk'));
});

test('empréstimo próprio do polo exige SEM_RATEIO e preserva o rateio da Matriz', () => {
  const createBody = poloLoanFunctionBody('criar_emprestimo_financeiro_polo_secure');
  const settleBody = poloLoanFunctionBody('baixar_emprestimo_parcela_polo_secure');
  const caixaBody = poloLoanFunctionBody('get_caixa_financiamento_resumo_secure');
  const policySection = poloLoanMigration.slice(
    0,
    poloLoanMigration.indexOf('CREATE OR REPLACE FUNCTION public.criar_emprestimo_financeiro_polo_secure('),
  );

  assertPoloLoanAuthorizationBefore(
    'criar_emprestimo_financeiro_polo_secure',
    'SELECT * INTO v_emprestimo',
  );
  assertPoloLoanAuthorizationBefore(
    'baixar_emprestimo_parcela_polo_secure',
    'SELECT parcela.* INTO v_parcela',
  );

  for (const fragment of [
    "v_rateio_modo NOT IN ('TODOS', 'SELECIONADOS')",
    "v_rateio_modo <> 'SEM_RATEIO'",
    "v_rateio_modo IN ('TODOS', 'SEM_RATEIO')",
    "v_rateio_modo = 'SEM_RATEIO'",
    'polo_matriz_id = p_polo_id',
    'rateio_modo, rateio_polo_ids',
  ]) {
    assert.ok(createBody.includes(fragment), `Contrato por polo ausente: ${fragment}`);
  }

  assert.ok(
    poloLoanMigration.includes("rateio_modo = 'SEM_RATEIO'\n      AND cardinality(rateio_polo_ids) = 0"),
    'SEM_RATEIO deve persistir sem polos rateados.',
  );
  assert.ok(
    settleBody.includes('AND polo_id = p_polo_id'),
    'A baixa deve manter a conta a pagar no polo responsável.',
  );
  assert.ok(
    caixaBody.includes("emprestimo.rateio_modo = 'SEM_RATEIO'"),
    'O resumo de financiamento deve incluir o empréstimo próprio no seu polo.',
  );
  assert.ok(
    caixaBody.includes('não receita ou despesa operacional'),
    'O Caixa deve manter financiamento fora do resultado operacional.',
  );
  assert.ok(
    policySection.includes("public.gestor_has_financeiro_tab('emprestimos')"),
    'Policies RLS de leitura devem chamar uma função executável por authenticated.',
  );
  assert.equal(
    policySection.includes("public.gestor_has_effective_financeiro_tab('emprestimos')"),
    false,
    'Policies RLS não podem chamar a função efetiva sem grant para authenticated.',
  );

  for (const fragment of [
    'REVOKE EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_secure(',
    'REVOKE EXECUTE ON FUNCTION public.baixar_emprestimo_parcela_matriz_secure(',
  ]) {
    assert.ok(
      poloLoanMigration.includes(fragment),
      `As rotas legadas devem perder EXECUTE de authenticated: ${fragment}`,
    );
  }
});

test('rateio de empréstimo notifica cada polo econômico no Realtime do Caixa', () => {
  for (const fragment of [
    'CREATE TRIGGER emprestimo_parcela_rateios_emit_caixa_event',
    'AFTER INSERT OR UPDATE OR DELETE ON public.emprestimo_parcela_rateios',
    "EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW')",
  ]) {
    assert.ok(
      loanRateioRealtimeMigration.includes(fragment),
      `Contrato Realtime de rateio ausente: ${fragment}`,
    );
  }
});

test('busca de patrimônio usa a mesma expressão indexada', () => {
  const body = functionBody('listar_patrimonios_secure');
  const indexedExpression = "coalesce(patrimonio.tipo_produto, '') || ' ' || coalesce(patrimonio.descricao, '')";

  assert.ok(body.includes(indexedExpression));
  assert.equal(body.includes('concat_ws('), false);
});
