import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// CI installs the pinned PGlite harness separately; no application dependency.
const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
  : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const student = '00000000-0000-0000-0000-000000000001';
const otherStudent = '00000000-0000-0000-0000-000000000002';
const title = '00000000-0000-0000-0000-000000000301';
const migrations = [
  '20261008113200_student_banese_confirmed_discount.sql',
  '20261008113210_student_banese_financial_summary.sql',
  '20261008113220_student_banese_financial_list.sql',
];

const newDatabase = async () => {
  const db = new PGlite();
  await db.exec(await read('./fixtures/student-banese-discount-schema.sql'));
  await db.exec(await read('./fixtures/student-banese-original-reader.sql'));
  for (const name of migrations) await db.exec(await read(`../migrations/${name}`));
  return db;
};

const terms = (overrides = {}) => ({
  nominalAmount: 279.9,
  dueDate: '2026-10-15',
  discount: { type: 'fixed', value: 19.9, validUntil: '2026-10-15' },
  ...overrides,
});

const calculateDiscount = async (db, overrides = {}) => {
  const args = {
    nominal: 279.9, due: '2026-10-15', provider: 'banese_card', method: 'BOLETO',
    nossoNumero: '000123456', snapshot: terms(), confirmedAt: '2026-10-07T12:00:00Z',
    lastError: null, today: '2026-10-08', ...overrides,
  };
  const { rows } = await db.query(`SELECT portal_private.banese_confirmed_student_discount(
    $1::numeric, $2::date, $3, $4, $5, $6::jsonb, $7::timestamptz, $8, $9::date
  ) AS discount`, [
    args.nominal, args.due, args.provider, args.method, args.nossoNumero,
    JSON.stringify(args.snapshot), args.confirmedAt, args.lastError, args.today,
  ]);
  return Number(rows[0].discount);
};

const today = async (db) => (await db.query(`SELECT to_char(
  (statement_timestamp() AT TIME ZONE 'America/Maceio')::date, 'YYYY-MM-DD'
) AS today`)).rows[0].today;

const seed = async (db, overrides = {}) => {
  const due = await today(db);
  const row = {
    id: title, cliente_id: student,
    turma_id: '00000000-0000-0000-0000-000000000102',
    descricao: 'Mensalidade de teste', categoria: 'Mensalidade',
    tipo_lancamento: 'PARCELA', parcela_numero: 1,
    valor: 279.9, valor_pago: 0, data_vencimento: due, status: 'PENDENTE',
    gateway_provider: 'banese_card', gateway_payment_method: 'BOLETO',
    gateway_boleto_linha_digitavel: '0'.repeat(47),
    gateway_boleto_codigo_barras: '0'.repeat(44),
    gateway_boleto_nosso_numero: '000123456',
    gateway_financial_terms: terms({
      dueDate: due, discount: { type: 'fixed', value: 19.9, validUntil: due },
    }),
    gateway_financial_terms_confirmed_at: `${due}T09:00:00Z`,
    ...overrides,
  };
  await db.query(`INSERT INTO public.contas_receber
    SELECT * FROM jsonb_populate_record(NULL::public.contas_receber, $1::jsonb)`,
  [JSON.stringify(row)]);
  return row;
};

const list = async (db, studentId = student, id = null) => (
  await db.query(`SELECT public.portal_aluno_financeiro_listar(
    $1::uuid, NULL, NULL, NULL, 'TODOS', 'TODOS', 1, 50, $2::uuid
  ) AS payload`, [studentId, id])
).rows[0].payload;

test('confirmed bank discount: fixed, percentage, inclusive deadline and civil date', async () => {
  const db = await newDatabase();
  try {
    assert.equal(await calculateDiscount(db), 19.9);
    assert.equal(await calculateDiscount(db, { provider: 'banese' }), 19.9);
    assert.equal(await calculateDiscount(db, { today: '2026-10-15' }), 19.9);
    assert.equal(await calculateDiscount(db, { today: '2026-10-16' }), 0);
    assert.equal(await calculateDiscount(db, { snapshot: terms({
      discount: { type: 'percentage', value: 10, validUntil: '2026-10-15' },
    }) }), 27.99);
    assert.equal(await calculateDiscount(db, { snapshot: terms({
      discount: { type: 'fixed', value: 19.9, validUntil: '2026-10-07' },
    }) }), 0);
    const { rows } = await db.query(`SELECT
      portal_private.banese_confirmed_student_discount(
        279.9, '2026-10-15', 'banese_card', 'BOLETO', '000123456',
        $1::jsonb, '2026-10-07T12:00:00Z', NULL,
        ('2026-10-16T02:59:59Z'::timestamptz AT TIME ZONE 'America/Maceio')::date
      ) AS before_midnight,
      portal_private.banese_confirmed_student_discount(
        279.9, '2026-10-15', 'banese_card', 'BOLETO', '000123456',
        $1::jsonb, '2026-10-07T12:00:00Z', NULL,
        ('2026-10-16T03:00:00Z'::timestamptz AT TIME ZONE 'America/Maceio')::date
      ) AS after_midnight`, [JSON.stringify(terms())]);
    assert.equal(Number(rows[0].before_midnight), 19.9);
    assert.equal(Number(rows[0].after_midnight), 0);
  } finally { await db.close(); }
});

test('unconfirmed, incompatible or malformed snapshots fail closed without throwing', async () => {
  const db = await newDatabase();
  try {
    const invalid = [
      { confirmedAt: null }, { snapshot: null }, { snapshot: [] },
      { provider: 'asaas' }, { method: 'PIX' }, { nossoNumero: '123' },
      { lastError: 'BANESE_IDENTITY_QUARANTINED:test' },
      { snapshot: terms({ nominalAmount: 280 }) },
      { snapshot: terms({ nominalAmount: '279.9' }) },
      { snapshot: terms({ dueDate: '2026-11-15' }) },
      { snapshot: terms({ discount: null }) },
      { snapshot: terms({ discount: { type: 'fixed', value: '19.9', validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 19.9, validUntil: '2026-02-30' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 19.9, validUntil: 'garbage' } }) },
      { snapshot: terms({ discount: { type: 'other', value: 19.9, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 0, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: -1, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 280, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 279.9, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 279.895, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 0.004, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'percentage', value: 100, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'percentage', value: 99.999, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'percentage', value: 101, validUntil: '2026-10-15' } }) },
      { snapshot: terms({ discount: { type: 'fixed', value: 19.9, validUntil: '2026-10-16' } }) },
      { today: null }, { due: null }, { nominal: null },
    ];
    for (const args of invalid) assert.equal(await calculateDiscount(db, args), 0, JSON.stringify(args));
  } finally { await db.close(); }
});

test('real SQL chain preserves nominal and fixes card, outstanding and modality totals', async () => {
  const db = await newDatabase();
  try {
    await seed(db);
    const before = (await db.query('SELECT public.p2_get_aluno_financeiro_portal_secure_20260812($1::uuid) AS data', [student])).rows[0].data;
    assert.equal(before.rows[0].financial_summary.punctualDiscount, 0, 'fixture reproduces original bug');
    const payload = await list(db);
    const item = payload.items[0];
    assert.equal(item.valor, 279.9);
    assert.equal(item.financial_summary.baseValue, 279.9);
    assert.equal(item.financial_summary.punctualDiscount, 19.9);
    assert.equal(item.financial_summary.totalUntilDue, 260);
    assert.equal(item.financial_summary.highlightValue, 260);
    assert.equal(item.valueOutstanding, 260);
    assert.equal(item.financial_summary.hasDiscount, true);
    assert.equal(payload.summary.totalPending, 260);
    assert.equal(payload.summary.openByModality[0].total, 260);
    assert.equal(item.statusCode, 'ABERTO', 'due today is open');
    assert.deepEqual((await list(db, student, title)).items[0], item, 'direct detail uses identical values');
    assert.equal(item.gateway_financial_terms, undefined, 'bank snapshot remains private');
    const base = (await db.query('SELECT public.get_aluno_financeiro_portal_secure($1::uuid) AS data', [student])).rows[0].data;
    assert.equal(base.summary.totalPending, 260);
    assert.equal(base.rows[0].financial_summary.punctualDiscount, 19.9);
  } finally { await db.close(); }
});

test('partial, paid, expired, unconfirmed and cancelled titles retain canonical balances', async () => {
  const db = await newDatabase();
  try {
    await seed(db, { valor_pago: 100 });
    let payload = await list(db);
    assert.equal(payload.items[0].valueOutstanding, 160);
    assert.equal(payload.items[0].financial_summary.highlightValue, 160);
    assert.equal(payload.items[0].financial_summary.totalUntilDue, 260);
    assert.equal(payload.summary.totalPending, 160);
    await db.exec("UPDATE public.contas_receber SET status = 'PAGO', valor_pago = 260");
    payload = await list(db);
    assert.equal(payload.items[0].valueOutstanding, 0);
    assert.equal(payload.items[0].financial_summary.highlightValue, 260);
    assert.equal(payload.items[0].financial_summary.hasDiscount, false);
    assert.equal(payload.summary.totalPaid, 260);
    assert.equal(payload.summary.totalPending, 0);
    await db.exec('UPDATE public.contas_receber SET valor_pago = 0');
    payload = await list(db);
    assert.equal(payload.items[0].financial_summary.paidValue, 0);
    assert.equal(payload.items[0].financial_summary.highlightValue, 0);
    assert.equal(payload.summary.totalPaid, 0, 'paid zero never falls back to nominal');
    await db.exec("UPDATE public.contas_receber SET status = 'PENDENTE', valor_pago = 0, gateway_financial_terms_confirmed_at = NULL");
    payload = await list(db);
    assert.equal(payload.items[0].financial_summary.punctualDiscount, 0);
    assert.equal(payload.items[0].financial_summary.totalUntilDue, 279.9);
    assert.equal(payload.summary.totalPending, 279.9, 'never substitutes class discount 99');
    await db.exec(`UPDATE public.contas_receber SET gateway_financial_terms_confirmed_at = now(),
      gateway_financial_terms = jsonb_set(gateway_financial_terms, '{discount,validUntil}',
        to_jsonb(to_char((statement_timestamp() AT TIME ZONE 'America/Maceio')::date - 1, 'YYYY-MM-DD')))`);
    payload = await list(db);
    assert.equal(payload.items[0].financial_summary.punctualDiscount, 0);
    assert.equal(payload.items[0].valueOutstanding, 279.9);
    await db.exec(`UPDATE public.contas_receber SET
      data_vencimento = (statement_timestamp() AT TIME ZONE 'America/Maceio')::date - 1,
      gateway_financial_terms = jsonb_set(gateway_financial_terms, '{dueDate}',
        to_jsonb(to_char((statement_timestamp() AT TIME ZONE 'America/Maceio')::date - 1, 'YYYY-MM-DD')))`);
    payload = await list(db);
    assert.equal(payload.items[0].statusCode, 'ATRASADO');
    assert.equal(payload.items[0].financial_summary.punctualDiscount, 0);
    assert.equal(payload.items[0].valueOutstanding, 279.9);
    assert.equal(payload.items[0].financial_summary.interestValue, 0, 'bank owns late charges');
    assert.equal(payload.items[0].financial_summary.lateFeeValue, 0);
    await db.exec("UPDATE public.contas_receber SET status = 'CANCELADO'");
    payload = await list(db);
    assert.equal(payload.items.length, 0);
    assert.equal(payload.summary.totalPending, 0);
  } finally { await db.close(); }
});

test('dependency labels and non-Banese legacy rules survive the bank overlay', async () => {
  const db = await newDatabase();
  try {
    await seed(db, {
      tipo_lancamento: 'DEPENDENCIA', regra_financeira_dependencia_snapshot: {
        origem: 'DEPENDENCIA', aplicarDesconto: true, descontoPontualidade: 35,
      },
    });
    let item = (await list(db)).items[0];
    assert.equal(item.modalidade, 'DISCIPLINA');
    assert.equal(item.turma_id, null);
    assert.equal(item.financial_summary.punctualDiscount, 19.9, 'bank beats dependency policy');
    assert.equal(item.financial_summary.totalUntilDue, 260);
    await db.exec("UPDATE public.contas_receber SET gateway_provider = NULL");
    item = (await list(db)).items[0];
    assert.equal(item.financial_summary.punctualDiscount, 35);
    assert.equal(item.financial_summary.totalUntilDue, 244.9);
    await db.exec("UPDATE public.contas_receber SET tipo_lancamento = 'PARCELA', regra_financeira_dependencia_snapshot = NULL");
    item = (await list(db)).items[0];
    assert.equal(item.financial_summary.punctualDiscount, 99);
    assert.equal(item.financial_summary.totalUntilDue, 180.9);
  } finally { await db.close(); }
});

test('ownership and execution ACL remain enforced; other students cannot be requested', async () => {
  const db = await newDatabase();
  try {
    await seed(db);
    await seed(db, { id: '00000000-0000-0000-0000-000000000302', cliente_id: otherStudent });
    await db.exec('SET ROLE authenticated');
    assert.equal((await list(db)).items.length, 1);
    await assert.rejects(list(db, otherStudent), (error) => error.code === '42501');
    await assert.rejects(calculateDiscount(db), (error) => error.code === '42501');
    await db.exec('RESET ROLE');
    await db.exec("SELECT set_config('test.auth_id', '', false)");
    await assert.rejects(list(db), (error) => error.code === '42501');
  } finally { await db.close(); }
});
