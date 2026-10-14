import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// PostgreSQL/WASM and synthetic fixtures only; no Supabase or bank connection.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const scheduleMigration = '20261014010500_other_credit_plans_schedule.sql';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const polo = id(1), payer = id(3), actor = id(5);
const input = (patch = {}) => ({
  clienteId: payer, descricao: 'Prática sintética', quantidadeParcelas: 4,
  valorParcela: 100.25, primeiroVencimento: '2028-01-31',
  jurosMensalPercentual: 1.25, multaPercentual: 2,
  descontoTipo: 'FIXO', descontoValor: 10, descontoDiasAntecedencia: 3,
  matricula: { valor: 50, vencimento: '2028-01-20' },
  rematricula: { valor: 25, vencimento: '2028-06-10' }, ...patch,
});
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const preview = data => scalar('SELECT public.preview_outros_creditos_plano_secure($1,$2::jsonb) value',
  [polo, JSON.stringify(data)]);
const create = (request, data) => scalar('SELECT public.criar_outros_creditos_plano_secure($1,$2,$3::jsonb) value',
  [request, polo, JSON.stringify(data)]);
const state = () => scalar(`SELECT md5(jsonb_build_object(
  'plans',(SELECT jsonb_agg(p ORDER BY id) FROM public.outros_creditos_planos p),
  'titles',(SELECT jsonb_agg(c ORDER BY id) FROM public.contas_receber c))::text) value`);
const invalid = call => assert.rejects(call, error => error.code === '22023');
const installments = plan => plan.parcelas.filter(row => row.papel === 'PARCELA');
const manualRows = [
  { numero: 1, valor: 85.005, vencimento: '2028-01-17' },
  { numero: 2, valor: 120.99, vencimento: '2028-03-05' },
  { numero: 3, valor: 230, vencimento: '2028-03-28' },
  { numero: 4, valor: 45, vencimento: '2028-08-09' },
];

try {
  await db.exec(source('other_credit_plans.fixture.sql'));
  for (const [key, value] of Object.entries({ uid: actor, polo, tab: 'true' })) {
    await db.query('SELECT set_config($1,$2,false)', [`test.${key}`, value]);
  }
  await db.query("INSERT INTO public.polos VALUES ($1,'ativo')", [polo]);
  await db.query("INSERT INTO public.usuarios_sistema VALUES ($1,'financeiro','ativo')", [actor]);
  await db.query("INSERT INTO public.parceiros VALUES ($1,'Pagador sintético','ativo',$2,ARRAY[]::uuid[])", [payer, polo]);
  for (const file of [
    '20261013170000_other_credit_plans_schema.sql', '20261013170100_other_credit_plans_calculator.sql',
    '20261013170200_other_credit_plans_rpc.sql', '20261013170300_other_credit_plans_integrity.sql',
  ]) await db.exec(source(`../migrations/${file}`));

  // Reproduce the missing feature, then carry a committed legacy request across the upgrade.
  await invalid(() => preview(input({ periodicidade: 'DIAS_CORRIDOS_30' })));
  await invalid(() => preview(input({ parcelasPersonalizadas: manualRows })));
  const legacyPreview = await preview(input());
  const legacy = await create(id(100), input());
  const legacyState = await state();
  const migration = source(`../migrations/${scheduleMigration}`);
  assert.ok(migration.split('\n').length <= 500);
  await db.exec(migration);
  assert.deepEqual(await preview(input()), legacyPreview, 'Monthly defaults preserve the complete legacy preview');
  assert.deepEqual(await preview(input({ periodicidade: 'MENSAL_CALENDARIO' })), legacyPreview);
  assert.equal((await create(id(100), input())).replayed, true);
  const legacyReplay = await create(id(100), input({ periodicidade: 'MENSAL_CALENDARIO' }));
  assert.equal(legacyReplay.replayed, true);
  assert.deepEqual(legacyReplay.receivables, legacy.receivables);
  assert.equal(await state(), legacyState, 'Upgrade and replay leave committed facts untouched');
  await invalid(() => create(id(100), input({ periodicidade: 'DIAS_CORRIDOS_30' })));
  assert.equal(await state(), legacyState);

  const thirtyInput = input({ periodicidade: 'DIAS_CORRIDOS_30' });
  const thirty = await preview(thirtyInput);
  assert.deepEqual(installments(thirty).map(row => row.dataVencimento),
    ['2028-01-31', '2028-03-01', '2028-03-31', '2028-04-30']);
  assert.equal(thirty.input.periodicidade, 'DIAS_CORRIDOS_30');
  assert.equal(thirty.totalParcelas, 401);
  assert.equal(thirty.parcelas[0].dataVencimento, '2028-01-20', 'Enrollment fee date is independent');
  assert.equal(thirty.parcelas[1].dataVencimento, '2028-06-10', 'Re-enrollment fee date is independent');
  assert.deepEqual(installments(await preview(input({
    periodicidade: 'DIAS_CORRIDOS_30', primeiroVencimento: '2027-01-31',
  }))).map(row => row.dataVencimento), ['2027-01-31', '2027-03-02', '2027-04-01', '2027-05-01']);
  const thirtyCreated = await create(id(101), thirtyInput);
  assert.equal(thirtyCreated.receivables.length, 6);
  assert.equal((await create(id(101), thirtyInput)).replayed, true);

  const manualInput = input({ periodicidade: 'DIAS_CORRIDOS_30', parcelasPersonalizadas: manualRows });
  const manual = await preview(manualInput);
  assert.deepEqual(installments(manual).map(row => row.valor), [85.01, 120.99, 230, 45]);
  assert.deepEqual(installments(manual).map(row => row.dataVencimento), manualRows.map(row => row.vencimento));
  assert.equal(manual.input.valorParcela, 100.25, 'Generator base survives individual edits');
  assert.equal(manual.input.primeiroVencimento, '2028-01-31');
  assert.equal(manual.totalParcelas, 481);
  assert.equal(manual.totalTaxas, 75);
  assert.equal(manual.totalNominal, 556);
  assert.equal(manual.totalComDesconto, 516, 'Total uses actual rows, not the generator base');
  assert.deepEqual(installments(manual)[0].financialTerms, {
    nominalAmount: 85.01, dueDate: '2028-01-17',
    discount: { type: 'fixed', value: 10, validUntil: '2028-01-14' },
    interest: { type: 'monthly-percentage', value: 1.25, startsOn: '2028-01-18' },
    penalty: { type: 'percentage', value: 2, startsOn: '2028-01-18' },
  });
  assert.equal(manual.parcelas[0].financialTerms.discount, null);
  assert.equal(manual.parcelas[1].financialTerms.discount, null);
  const percentage = await preview({ ...manualInput, descontoTipo: 'PERCENTUAL', descontoValor: 10 });
  assert.equal(percentage.totalComDesconto, 507.9);
  assert.equal(installments(percentage)[0].valorComDesconto, 76.51);
  assert.equal(installments(percentage)[0].financialTerms.discount.type, 'percentage');
  const aboveBase = await preview({ ...manualInput, valorParcela: 1, descontoValor: 10 });
  assert.equal(aboveBase.totalComDesconto, 516, 'Discount compares with actual edited rows');

  const customCreated = await create(id(102), manualInput);
  for (const row of customCreated.receivables) {
    const canonical = manual.parcelas.find(item => item.papel === row.outros_creditos_papel
      && item.numero === row.parcela_numero);
    assert.equal(Number(row.valor), canonical.valor);
    assert.equal(row.data_vencimento, canonical.dataVencimento);
    assert.deepEqual(row.regra_financeira_outros_creditos_snapshot.financialTerms, canonical.financialTerms);
    assert.equal(row.matricula_id, null); assert.equal(row.turma_id, null);
  }
  const customState = await state();
  const reordered = { ...manualInput, parcelasPersonalizadas: [...manualRows].reverse()
    .map(row => ({ ...row, valor: row.numero === 1 ? 85.01 : row.valor })) };
  assert.equal((await create(id(102), reordered)).replayed, true, 'Array order and rounding normalize for replay');
  assert.equal(await state(), customState);
  for (const patch of [
    { periodicidade: 'MENSAL_CALENDARIO' },
    { matricula: { valor: 50, vencimento: '2028-01-21' } },
    { parcelasPersonalizadas: manualRows.map(row => row.numero === 2 ? { ...row, valor: 121 } : row) },
    { parcelasPersonalizadas: manualRows.map(row => row.numero === 1 ? { ...row, vencimento: '2028-01-18' } : row) },
  ]) {
    await invalid(() => create(id(102), { ...manualInput, ...patch }));
    assert.equal(await state(), customState, 'Changed contract cannot replay an existing request');
  }

  const replaceFirst = patch => [{ ...manualRows[0], ...patch }, ...manualRows.slice(1)];
  for (const patch of [
    { periodicidade: 'SEMANAL' }, { periodicidade: {} },
    { parcelasPersonalizadas: [] }, { parcelasPersonalizadas: manualRows.slice(1) },
    { parcelasPersonalizadas: {} }, { parcelasPersonalizadas: [null, ...manualRows.slice(1)] },
    { parcelasPersonalizadas: replaceFirst({ numero: 0 }) },
    { parcelasPersonalizadas: replaceFirst({ numero: 5 }) },
    { parcelasPersonalizadas: replaceFirst({ numero: 2 }) },
    { parcelasPersonalizadas: replaceFirst({ numero: 1.5 }) },
    { parcelasPersonalizadas: replaceFirst({ valor: 0 }) },
    { parcelasPersonalizadas: replaceFirst({ valor: 0.004 }) },
    { parcelasPersonalizadas: replaceFirst({ valor: -5 }) },
    { parcelasPersonalizadas: replaceFirst({ valor: 100000000 }) },
    { parcelasPersonalizadas: replaceFirst({ valor: 'NaN' }) },
    { parcelasPersonalizadas: replaceFirst({ vencimento: '2028-02-30' }) },
    { parcelasPersonalizadas: replaceFirst({ vencimento: '9999-12-31' }) },
    { parcelasPersonalizadas: replaceFirst({ vencimento: '1899-12-31' }) },
    { parcelasPersonalizadas: replaceFirst({ valor: 10 }) },
    { parcelasPersonalizadas: replaceFirst({ desconto: 1 }) },
    { parcelasPersonalizadas: replaceFirst({ valor: 0.01 }), descontoTipo: 'PERCENTUAL', descontoValor: 99 },
  ]) {
    await invalid(() => preview(input(patch)));
    await invalid(() => create(id(103), input(patch)));
    assert.equal(await state(), customState, 'Invalid rows never produce partial titles');
  }
  const sixty = await preview(input({ quantidadeParcelas: 60, parcelasPersonalizadas:
    Array.from({ length: 60 }, (_, index) => ({ numero: index + 1, valor: index + 20, vencimento: '2028-05-15' })) }));
  assert.equal(sixty.parcelas.length, 62);
  assert.equal(sixty.parcelas.at(-1).numero, 60);
  const one = await preview(input({ quantidadeParcelas: 1, matricula: null, rematricula: null,
    parcelasPersonalizadas: [manualRows[0]] }));
  assert.equal(one.parcelas.length, 1);

  const enrollmentConditions = {
    jurosMensalPercentual: 0.5, multaPercentual: 1.75,
    descontoTipo: 'FIXO', descontoValor: 5.005, descontoDiasAntecedencia: 7,
  };
  const reenrollmentConditions = {
    jurosMensalPercentual: 2.75, multaPercentual: 3.5,
    descontoTipo: 'PERCENTUAL', descontoValor: 20, descontoDiasAntecedencia: 0,
  };
  const independentInput = input({
    matricula: { ...input().matricula, condicoes: enrollmentConditions },
    rematricula: { ...input().rematricula, condicoes: reenrollmentConditions },
  });
  const independent = await preview(independentInput);
  assert.equal(independent.totalNominal, 476);
  assert.equal(independent.totalComDesconto, 425.99, 'Fee discounts participate in the canonical total');
  assert.deepEqual(independent.input.matricula.condicoes, { ...enrollmentConditions, descontoValor: 5.01 });
  assert.deepEqual(independent.input.rematricula.condicoes, reenrollmentConditions);
  assert.deepEqual(independent.parcelas[0].financialTerms, {
    nominalAmount: 50, dueDate: '2028-01-20',
    discount: { type: 'fixed', value: 5.01, validUntil: '2028-01-13' },
    interest: { type: 'monthly-percentage', value: 0.5, startsOn: '2028-01-21' },
    penalty: { type: 'percentage', value: 1.75, startsOn: '2028-01-21' },
  });
  assert.deepEqual(independent.parcelas[1].financialTerms, {
    nominalAmount: 25, dueDate: '2028-06-10',
    discount: { type: 'percentage', value: 20, validUntil: '2028-06-10' },
    interest: { type: 'monthly-percentage', value: 2.75, startsOn: '2028-06-11' },
    penalty: { type: 'percentage', value: 3.5, startsOn: '2028-06-11' },
  });
  assert.deepEqual(installments(independent), installments(legacyPreview), 'Fee terms do not reprice installments');
  const zeroConditions = { jurosMensalPercentual: 0, multaPercentual: 0, descontoTipo: 'FIXO',
    descontoValor: 0, descontoDiasAntecedencia: 0 };
  const zero = await preview(input({ matricula: { ...input().matricula, condicoes: zeroConditions } }));
  assert.equal(zero.parcelas[0].financialTerms.interest, null, 'Explicit zero overrides the global late interest');
  assert.equal(zero.parcelas[0].financialTerms.penalty, null);
  assert.equal(zero.parcelas[0].financialTerms.discount, null);
  assert.equal(zero.parcelas[1].financialTerms.interest.value, 1.25, 'Fee without conditions preserves the legacy fallback');
  assert.equal(zero.parcelas[1].financialTerms.discount, null);
  const independentCreated = await create(id(104), independentInput);
  for (const row of independentCreated.receivables) {
    const canonical = independent.parcelas.find(item => item.papel === row.outros_creditos_papel
      && item.numero === row.parcela_numero);
    assert.deepEqual(row.regra_financeira_outros_creditos_snapshot.financialTerms, canonical.financialTerms);
  }
  const independentState = await state();
  assert.equal((await create(id(104), { ...independentInput,
    matricula: { ...independentInput.matricula, condicoes: { ...enrollmentConditions, descontoValor: 5.01 } },
  })).replayed, true, 'Canonical fee rounding replays the same financial intent');
  await invalid(() => create(id(104), { ...independentInput,
    matricula: { ...independentInput.matricula, condicoes: { ...enrollmentConditions, jurosMensalPercentual: 0.75 } },
  }));
  await invalid(() => create(id(104), input()));
  assert.equal(await state(), independentState);
  for (const feeKey of ['matricula', 'rematricula']) {
    for (const conditions of [
      null, [], {}, { ...zeroConditions, unexpected: 1 },
      { ...zeroConditions, jurosMensalPercentual: -1 }, { ...zeroConditions, jurosMensalPercentual: 100 },
      { ...zeroConditions, jurosMensalPercentual: 'NaN' }, { ...zeroConditions, jurosMensalPercentual: null },
      { ...zeroConditions, multaPercentual: -1 }, { ...zeroConditions, multaPercentual: 100 },
      { ...zeroConditions, descontoTipo: 'OUTRO' },
      { ...zeroConditions, descontoValor: -1 },
      { ...zeroConditions, descontoValor: input()[feeKey].valor },
      { ...zeroConditions, descontoTipo: 'PERCENTUAL', descontoValor: 100 },
      { ...zeroConditions, descontoTipo: 'PERCENTUAL', descontoValor: 99 },
      { ...zeroConditions, descontoDiasAntecedencia: 61 },
      { ...zeroConditions, descontoDiasAntecedencia: 1.5 },
      { ...zeroConditions, descontoDiasAntecedencia: -1 },
    ]) {
      const tinyAmount = conditions?.descontoTipo === 'PERCENTUAL' && conditions.descontoValor === 99;
      const data = input({ [feeKey]: { ...input()[feeKey], ...(tinyAmount ? { valor: 0.01 } : {}), condicoes: conditions } });
      await invalid(() => preview(data));
      await invalid(() => create(id(105), data));
      assert.equal(await state(), independentState, 'Invalid fee conditions leave no partial financial facts');
    }
  }

  await db.query("SELECT set_config('test.tab','false',false)");
  await assert.rejects(() => create(id(102), manualInput), error => error.code === '42501');
  await assert.rejects(() => preview(manualInput), error => error.code === '42501');
  assert.equal(await state(), independentState, 'Replay remains behind current authorization');
  console.log('PASS other credit schedules: 30 real days, manual rows, three independent policies, per-row terms/totals, 1–60 rows, legacy replay, normalized replay and invalid/unauthorized atomicity.');
} finally { await db.close(); }
