import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
  : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261009200452_turma_student_statement_gateway_projection.sql');
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const enrollment = id(10);
const student = id(1);
const polo = id(100);
const bankUrl = 'https://documents.test/private/boleto';
const due = '2099-10-15';
const terms = {
  nominalAmount: 279.9, dueDate: due,
  discount: { type: 'fixed', value: 19.9, validUntil: due },
};

const auth = async (db, role = 'authenticated', aluno = '', financePolo = '') => {
  await db.query(`SELECT set_config('test.role', $1, false),
    set_config('test.aluno', $2, false), set_config('test.finance_polo', $3, false)`,
  [role, aluno, financePolo]);
};
const statement = async (db, target = enrollment) => (
  await db.query('SELECT public.get_aluno_extrato_financeiro($1::uuid) AS data', [target])
).rows[0].data;
const seedTitle = async (db, number, overrides = {}, presentation = {}) => {
  const row = {
    id: id(number), matricula_id: enrollment, descricao: `Mensalidade ${number}`,
    valor: 279.9, valor_pago: null, data_vencimento: due, data_pagamento: null,
    status: 'PENDENTE', forma_pagamento: 'BOLETO', origem_pagamento: null,
    tipo_lancamento: 'PARCELA', parcela_numero: number,
    created_at: '2026-10-07T10:00:00Z', gateway_provider: 'banese_card',
    gateway_payment_method: 'BOLETO', gateway_payment_id: '000123456',
    gateway_status: 'PENDING', gateway_bank_slip_url: bankUrl,
    gateway_invoice_url: bankUrl, gateway_boleto_issued_at: '2026-10-07T10:01:00Z',
    gateway_submission_status: 'API_REGISTERED', gateway_boleto_nosso_numero: '000123456',
    gateway_financial_terms: terms, gateway_financial_terms_confirmed_at: '2026-10-07T10:01:00Z',
    ...overrides,
  };
  await db.query(`INSERT INTO public.contas_receber
    SELECT * FROM jsonb_populate_record(NULL::public.contas_receber, $1::jsonb)`, [JSON.stringify(row)]);
  await db.query('INSERT INTO public.test_cycle_projections VALUES ($1, $2::jsonb)',
    [row.id, JSON.stringify(presentation)]);
  return row;
};
const database = async () => {
  const db = new PGlite();
  await db.exec(await read('./fixtures/turma-student-statement-schema.sql'));
  await db.exec(await read('./fixtures/turma-student-statement-original.sql'));
  await db.exec(`REVOKE ALL ON FUNCTION public.get_aluno_extrato_financeiro(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_aluno_extrato_financeiro(uuid) TO authenticated, service_role;`);
  await db.query('INSERT INTO public.parceiros VALUES ($1, $2, $3)', [student, 'Aluno sintético', '12345678900']);
  await db.query('INSERT INTO public.polos VALUES ($1, $2)', [polo, 'Polo sintético']);
  await db.query('INSERT INTO public.cursos VALUES ($1, $2)', [id(200), 'Curso sintético']);
  await db.query('INSERT INTO public.turmas VALUES ($1, $2, $3, $4, $5)', [id(300), 'Turma sintética', 'T-TEST', id(200), polo]);
  await db.query('INSERT INTO public.matriculas VALUES ($1, $2, $3, $4, $5)', [enrollment, student, id(300), 'ATIVO', '2026-09-30']);
  await auth(db, 'authenticated', '', polo);
  return db;
};

test('statement projects bank evidence while preserving all original balances and columns', async () => {
  const db = await database();
  try {
    const presentation = {
      destino_cobranca: 'BANESE', emissao_gerenciada_turma: true, emissao_ciclo_status: 'EMITIDO',
      operation_capabilities: { canDownload: true, canReceive: true },
      banese_cancellation: { status: 'NAO_SOLICITADO' },
    };
    await seedTitle(db, 501, {}, presentation);
    await seedTitle(db, 502, { status: 'PAGO', valor_pago: 260, data_pagamento: '2026-10-08',
      origem_pagamento: 'BANESE', gateway_status: 'PAID', gateway_settlement_channel: 'PIX',
      gateway_settlement_source: 'API', forma_pagamento: 'PIX' }, presentation);
    await seedTitle(db, 503, { status: 'CANCELADO', gateway_status: 'CANCELED' });
    await seedTitle(db, 504, { gateway_provider: null, gateway_status: null,
      gateway_payment_id: null, gateway_invoice_url: null, gateway_bank_slip_url: null,
      gateway_boleto_issued_at: null, gateway_financial_terms: null,
      asaas_status: 'PENDING', asaas_invoice_url: 'https://legacy.test/invoice', asaas_payment_id: 'pay_legacy' });
    const before = await statement(db);
    assert.equal(before.recebiveis[0].asaas_status, null, 'old RPC omitted emitted Banese evidence');
    assert.equal(before.recebiveis[0].gateway_status, undefined);
    const sourceBefore = await db.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) AS rows FROM public.contas_receber r');
    await db.exec(migration);
    const after = await statement(db);
    for (const [key, value] of Object.entries(before)) {
      if (key !== 'recebiveis') assert.deepEqual(after[key], value, key);
    }
    for (const original of before.recebiveis) {
      const current = after.recebiveis.find((row) => row.id === original.id);
      for (const [key, value] of Object.entries(original)) assert.deepEqual(current[key], value, key);
    }
    const emitted = after.recebiveis.find((row) => row.id === id(501));
    assert.equal(emitted.gateway_status, 'PENDING');
    assert.equal(emitted.gateway_provider, 'banese_card');
    assert.equal(emitted.status, 'PENDENTE', 'emission never fabricates settlement');
    assert.equal(emitted.gateway_bank_slip_url, bankUrl);
    assert.equal(emitted.boleto_desconto_configurado, 19.9);
    assert.equal(emitted.boleto_desconto_valido_ate, due);
    assert.equal(emitted.boleto_desconto_situacao, 'VIGENTE');
    for (const [key, value] of Object.entries(presentation)) assert.deepEqual(emitted[key], value);
    const paid = after.recebiveis.find((row) => row.id === id(502));
    assert.equal(paid.gateway_settlement_channel, 'PIX');
    assert.equal(paid.composicao_proveniencia, 'CONFERENCIA_PROESC');
    assert.equal(after.recebido, 260);
    assert.equal(after.pagos, 1);
    assert.equal(after.pendentes, 2);
    assert.deepEqual(await db.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) AS rows FROM public.contas_receber r'), sourceBefore);
  } finally { await db.close(); }
});

test('existing owner, finance-polo and service access remain scoped; anonymous cannot execute', async () => {
  const db = await database();
  try {
    await seedTitle(db, 501);
    await db.exec(migration);
    await db.exec('SET ROLE authenticated');
    await auth(db, 'authenticated', student);
    assert.equal((await statement(db)).matriculaId, enrollment);
    await auth(db, 'authenticated', id(2));
    assert.equal(await statement(db), null);
    await auth(db, 'authenticated', '', id(101));
    assert.equal(await statement(db), null);
    await auth(db, 'authenticated', '', polo);
    assert.equal((await statement(db)).matriculaId, enrollment);
    assert.equal(await statement(db, id(99)), null);
    await auth(db, 'authenticated');
    assert.equal(await statement(db), null);
    await db.exec('RESET ROLE; SET ROLE service_role');
    await auth(db, 'service_role');
    assert.equal((await statement(db)).matriculaId, enrollment);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(statement(db), /permission denied/);
    await db.exec('RESET ROLE');
    const attributes = (await db.query(`SELECT prosecdef, proconfig,
      has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute
      FROM pg_proc WHERE oid = 'public.get_aluno_extrato_financeiro(uuid)'::regprocedure`)).rows[0];
    assert.equal(attributes.prosecdef, true);
    assert.deepEqual(attributes.proconfig, ['search_path=""']);
    assert.equal(attributes.anon_execute, false);
  } finally { await db.close(); }
});

test('discount presentation matches confirmed snapshot and preserves review and local state', async () => {
  const db = await database();
  try {
    await db.exec(migration);
    await seedTitle(db, 501, { gateway_financial_terms_confirmed_at: null,
      gateway_last_error: 'private diagnostic must not be exposed' });
    await seedTitle(db, 502, { gateway_last_error: 'BANESE_IDENTITY_QUARANTINED:test' },
      { emissao_ciclo_status: 'REVISAO_MANUAL', emissao_gerenciada_turma: true });
    await seedTitle(db, 503, { gateway_provider: null, gateway_payment_id: null,
      gateway_status: null, gateway_financial_terms: null },
      { destino_cobranca: 'LOCAL', emissao_ciclo_status: 'NAO_APLICAVEL', emissao_gerenciada_turma: true });
    await seedTitle(db, 504, { gateway_financial_terms: { ...terms, nominalAmount: 1 } });
    await seedTitle(db, 505, { gateway_financial_terms: { ...terms,
      discount: { type: 'fixed', value: 19.9, validUntil: '2099-02-30' } } });
    await seedTitle(db, 506, { gateway_financial_terms: { ...terms,
      discount: { type: 'percentage', value: 10, validUntil: due } } });
    await seedTitle(db, 507, { data_vencimento: '2020-10-15', gateway_financial_terms: {
      ...terms, dueDate: '2020-10-15', discount: { type: 'fixed', value: 19.9, validUntil: '2020-10-15' },
    } });
    const rows = (await statement(db)).recebiveis;
    for (const n of [501, 502, 503, 504, 505]) {
      assert.equal(rows.find((row) => row.id === id(n)).boleto_desconto_configurado, null);
    }
    assert.equal(rows.find((row) => row.id === id(502)).emissao_ciclo_status, 'REVISAO_MANUAL');
    assert.equal(rows.find((row) => row.id === id(502)).gateway_last_error, 'BANESE_IDENTITY_QUARANTINED:');
    assert.equal(rows.find((row) => row.id === id(501)).gateway_last_error, null);
    assert.equal(rows.find((row) => row.id === id(501)).boleto_nosso_numero, '000123456');
    assert.equal(rows.find((row) => row.id === id(503)).destino_cobranca, 'LOCAL');
    assert.equal(rows.find((row) => row.id === id(506)).boleto_desconto_configurado, 27.99);
    const expired = rows.find((row) => row.id === id(507));
    assert.equal(expired.boleto_desconto_configurado, 19.9, 'historical configured discount is retained');
    assert.equal(expired.boleto_desconto_situacao, 'EXPIRADO');
  } finally { await db.close(); }
});
