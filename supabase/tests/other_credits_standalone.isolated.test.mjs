import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run against an existing local PGlite installation. No remote URL or credentials.
const packagePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(packagePath
  ? pathToFileURL(resolve(packagePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = source('../migrations/20260926173500_scope_other_credits_to_standalone_receivables.sql');
const transactionBody = migration.replace(/^BEGIN;\n/, '').replace(/\nCOMMIT;\s*$/, '');
const readers = ['public.listar_outros_creditos_secure(uuid)',
  'public.get_outros_creditos_summary(uuid,text,date,date,uuid)'];
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const polo = uid(900);
const otherPolo = uid(901);
function definition(text, name) {
  const start = text.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = text.slice(start);
  const delimiter = /\bas\s+(\$[a-z_]*\$)/i.exec(tail);
  assert.ok(delimiter, name);
  const end = tail.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length);
  assert.ok(end > 0, name);
  return tail.slice(0, end + delimiter[1].length + 1);
}
const fixture = (n, overrides = {}) => ({
  id: uid(n), polo_id: polo, descricao: `Crédito sintético ${n}`,
  categoria: 'OUTROS_CREDITOS', status: 'PENDENTE', valor: 100, valor_pago: 0,
  data_vencimento: '2026-09-15', created_at: '2026-09-01T00:00:00Z', ...overrides,
});
const allowed = [
  fixture(1, { cliente_id: uid(800), descricao: 'Avulso do aluno' }),
  fixture(2, { cliente_id: uid(801), status: 'PAGO', valor_pago: 95 }),
  fixture(3, { status: 'PAGO', valor_pago: 110 }),
  fixture(4, { status: 'CANCELADO', valor: 40 }),
  fixture(5, { status: 'ESTORNADO', valor: 20 }),
  fixture(6, { status: 'SUSPENSO', valor: 80 }),
  fixture(7, { status: 'VENCIDO', valor: 90, data_vencimento: '1999-01-01' }),
  fixture(8, { polo_id: otherPolo, valor: 200 }),
  fixture(9, { categoria_financeira_id: uid(700), valor: 50, origem_pagamento: 'PRESENCIAL' }),
];
const excluded = [
  fixture(20, { matricula_id: uid(600) }),
  fixture(21, { turma_id: uid(601) }),
  fixture(22, { origem_cronograma_id: 'synthetic-schedule' }),
  ...['MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA']
    .map((tipo_lancamento, i) => fixture(23 + i, { tipo_lancamento })),
  fixture(27), fixture(28), fixture(29), fixture(30),
  fixture(31, { categoria: 'CURSO_TECNICO' }),
  fixture(32, { matricula_id: uid(600), turma_id: uid(601),
    origem_cronograma_id: 'synthetic-paid', tipo_lancamento: 'PARCELA',
    status: 'PAGO', valor_pago: 500, origem_pagamento: 'SISTEMA_ANTERIOR' }),
];
const list = async (scope = null) =>
  (await db.query('SELECT public.listar_outros_creditos_secure($1) value', [scope])).rows[0].value;
const summary = async (scope = null, search = null, start = null, end = null, category = null) =>
  (await db.query('SELECT * FROM public.get_outros_creditos_summary($1,$2,$3,$4,$5)',
    [scope, search, start, end, category])).rows[0];
const settings = async (role = 'service_role', tab = true, global = true, scope = polo) => {
  for (const [key, value] of Object.entries({ role, tab, global, scope })) {
    await db.query("SELECT set_config($1,$2,false)", [`test.${key}`, String(value)]);
  }
};

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA internal_proesc;
    CREATE TABLE public.contas_receber (
      id uuid PRIMARY KEY,
      polo_id uuid,
      descricao text,
      valor numeric,
      data_vencimento date,
      data_pagamento date,
      valor_pago numeric,
      status text,
      cliente_id uuid,
      matricula_id uuid,
      turma_id uuid,
      forma_pagamento text,
      conta_bancaria_id uuid,
      nosso_numero_asaas text,
      created_at timestamp with time zone,
      updated_at timestamp with time zone,
      categoria text,
      tipo_lancamento text,
      parcela_numero integer,
      origem_cronograma_id text,
      asaas_payment_id text,
      asaas_invoice_url text,
      asaas_status text,
      asaas_synced_at timestamp with time zone,
      asaas_last_error text,
      origem_pagamento text,
      asaas_bank_slip_url text,
      asaas_installment_id text,
      asaas_payment_link_id text,
      asaas_transaction_receipt_url text,
      asaas_fee_value numeric,
      asaas_net_value numeric,
      gateway_provider text,
      gateway_environment text,
      gateway_payment_method text,
      gateway_payment_id text,
      gateway_customer_id text,
      gateway_payment_link_id text,
      gateway_installment_id text,
      gateway_status text,
      gateway_invoice_url text,
      gateway_bank_slip_url text,
      gateway_pix_payload text,
      gateway_pix_encoded_image text,
      gateway_transaction_receipt_url text,
      gateway_fee_value numeric,
      gateway_net_value numeric,
      gateway_synced_at timestamp with time zone,
      gateway_last_error text,
      gateway_installments integer,
      gateway_issuer_polo_id uuid,
      gateway_boleto_linha_digitavel text,
      gateway_boleto_codigo_barras text,
      gateway_boleto_nosso_numero text,
      gateway_boleto_convenio text,
      gateway_boleto_agencia text,
      gateway_financial_terms jsonb,
      gateway_financial_terms_confirmed_at timestamp with time zone,
      gateway_boleto_issued_at timestamp with time zone,
      gateway_creation_token uuid,
      gateway_submission_channel text,
      gateway_submission_status text,
      gateway_cnab_file_id uuid,
      manual_settlement_id uuid,
      manual_settlement_principal_cents bigint,
      manual_settlement_interest_cents bigint,
      manual_settlement_penalty_cents bigint,
      manual_settlement_addition_cents bigint,
      manual_settlement_discount_cents bigint,
      manual_settlement_received_cents bigint,
      manual_settlement_reversed_at timestamp with time zone,
      gateway_settlement_channel text,
      gateway_settlement_source text,
      gateway_settlement_evidence jsonb,
      gateway_settlement_recorded_at timestamp with time zone,
      categoria_financeira_id uuid,
      regra_financeira_tecnica_snapshot jsonb,
      regra_financeira_plano_unico_snapshot jsonb,
      regra_financeira_dependencia_snapshot jsonb
    );
    CREATE TABLE public.parceiros (id uuid PRIMARY KEY,nome text,cpf_cnpj text,telefone text,tipo text);
    CREATE TABLE public.polos (id uuid PRIMARY KEY,nome text,cnpj text,cidade text,estado text);
    CREATE TABLE public.categorias_financeiras (id uuid PRIMARY KEY,nome text);
    CREATE TABLE public.turmas (id uuid PRIMARY KEY,nome text,curso_id uuid);
    CREATE TABLE public.cursos (id uuid PRIMARY KEY,nome text,modalidade text);
    CREATE TABLE public.emprestimos_financeiros (conta_receber_id uuid);
    CREATE TABLE public.inscricoes_online (receivable_id uuid);
    CREATE TABLE public.matricula_dependencia_cobrancas (conta_receber_id uuid);
    CREATE TABLE internal_proesc.obligation_links (receivable_id uuid);
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.role',true) $$;
    CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.tab',true)='true' $$;
    CREATE FUNCTION public.is_financeiro_global() RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.global',true)='true' $$;
    CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT $1::text=current_setting('test.scope',true) $$;
    CREATE FUNCTION public.financeiro_normalize_search_text(text) RETURNS text LANGUAGE sql IMMUTABLE AS
      $$ SELECT lower($1) $$;
    CREATE FUNCTION public.resolve_integrated_receivable_financial_composition(
      uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)
      RETURNS TABLE(juros numeric,multa numeric,desconto numeric,acrescimo numeric,
        diferenca_nao_discriminada numeric,composicao_status text)
      LANGUAGE sql STABLE AS $$ SELECT 1::numeric,2::numeric,3::numeric,4::numeric,0::numeric,
        'CONCILIADO_POR_CONFERENCIA_PROESC'::text $$;
  `);
  await db.exec(definition(source('../migrations/20260913194000_proesc_extra_statement_composition.sql'),
    'public.listar_outros_creditos_secure'));
  await db.exec(definition(source('../migrations/20260811035350_separate_loan_credits_from_other_credits.sql'),
    'public.get_outros_creditos_summary'));
  for (const reader of readers) await db.exec(`REVOKE ALL ON FUNCTION ${reader} FROM public,anon;
    GRANT EXECUTE ON FUNCTION ${reader} TO authenticated,service_role;`);
  await settings();
  await db.query('INSERT INTO public.parceiros VALUES($1,$2,NULL,NULL,$3),($4,$5,NULL,NULL,$6)',
    [uid(800), 'Aluno sintético', 'ALUNO', uid(801), 'Fornecedor sintético', 'FORNECEDOR']);
  await db.query('INSERT INTO public.categorias_financeiras VALUES($1,$2)', [uid(700), 'Rendimento']);
  for (const row of [...allowed, ...excluded]) await db.query(`INSERT INTO public.contas_receber
    SELECT * FROM jsonb_populate_record(NULL::public.contas_receber,$1::jsonb)`, [JSON.stringify(row)]);
  for (const [table, id] of [['inscricoes_online', 27], ['matricula_dependencia_cobrancas', 28],
    ['internal_proesc.obligation_links', 29], ['emprestimos_financeiros', 30]]) {
    await db.query(`INSERT INTO ${table} VALUES($1)`, [uid(id)]);
  }
  const state = async () => (await db.query(`SELECT
    md5((SELECT jsonb_agg(c ORDER BY id)::text FROM public.contas_receber c)) receivables,
    md5((SELECT jsonb_agg(c)::text FROM internal_proesc.obligation_links c)) links,
    md5((SELECT jsonb_agg(c)::text FROM public.inscricoes_online c)) online,
    md5((SELECT jsonb_agg(c)::text FROM public.matricula_dependencia_cobrancas c)) dependency,
    md5((SELECT jsonb_agg(c)::text FROM public.emprestimos_financeiros c)) loans`)).rows[0];
  const metadata = async () => (await db.query(`SELECT oid,proowner,proacl,prosecdef,provolatile,proconfig
    FROM pg_proc WHERE oid=ANY($1::regprocedure[]) ORDER BY oid`, [readers])).rows;
  const baseline = await state();
  const security = await metadata();
  const oldList = await list();
  assert.ok(oldList.some((row) => row.id === uid(32)), 'Reproduce academic leakage before patch');
  const oldTotals = await summary();
  assert.equal(Number(oldTotals.all_value), Number(oldTotals.received_value),
    'Reproduce zero-paid pending titles incorrectly absent from nominal total');

  if (process.env.OTHER_CREDITS_TEST_BEFORE !== '1') {
    // Drift on the SECOND reader rolls back even the first successful replacement.
    await db.exec('BEGIN');
    await db.exec(`ALTER FUNCTION ${readers[1]} VOLATILE`);
    await assert.rejects(() => db.exec(transactionBody), /Other-credit reader drift/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await list(), oldList);
    assert.deepEqual(await state(), baseline);
    await db.exec(migration);
  }
  assert.deepEqual((await list()).map((row) => row.id).sort(), allowed.map((row) => row.id).sort(),
    'Only standalone credits; the ALUNO payer remains included');
  assert.deepEqual(await state(), baseline, 'No financial row or relation may be modified');
  assert.deepEqual(await metadata(), security, 'OID, owner, ACL and security settings unchanged');
  const actual = await summary();
  for (const [key, value] of Object.entries({ pending_count: 5, received_count: 2, canceled_count: 2,
    all_count: 9, pending_value: 520, received_value: 205, canceled_value: 60, all_value: 780 })) {
    assert.equal(Number(actual[key]), value, key);
  }
  const local = await summary(polo);
  assert.equal(Number(local.all_count), 8);
  assert.equal(Number(local.all_value), 580);
  assert.equal((await list(polo)).length, 8);
  assert.equal(Number((await summary(polo, 'aluno')).all_count), 1, 'Student remains a payer');
  assert.equal(Number((await summary(polo, null, null, null, uid(700))).all_value), 50);
  assert.equal(Number((await summary(polo, null, '1999-01-01', '1999-01-01')).all_value), 90);
  const paidRow = (await list()).find((row) => row.id === uid(2));
  assert.equal(paidRow.valor_pago, 95);
  assert.equal(paidRow.juros_aplicados, 1, 'Canonical composition is preserved');
  assert.equal(paidRow.composicao_proveniencia, 'CONFERENCIA_PROESC');

  // Existing financial tab and polo guards remain before any data read.
  await settings('authenticated', true, false);
  assert.equal((await list(polo)).length, 8);
  for (const call of [() => list(), () => list(otherPolo), () => summary(), () => summary(otherPolo)]) {
    await assert.rejects(call, (error) => error.code === '42501');
  }
  await settings('authenticated', false, true);
  await assert.rejects(() => list(polo), (error) => error.code === '42501');
  await assert.rejects(() => summary(polo), (error) => error.code === '42501');
  await settings('authenticated', true, true);
  assert.equal((await list()).length, 9);
  await db.exec('SET ROLE anon');
  await assert.rejects(() => list(), (error) => error.code === '42501');
  await assert.rejects(() => summary(), (error) => error.code === '42501');
  await db.exec('RESET ROLE');
  await settings();
  assert.deepEqual(await state(), baseline);
  console.log('PASS: 22 fixtures; classification, student payer, nominal/actual totals, filters, ACL, drift rollback and data preservation.');
} finally {
  await db.close();
}

