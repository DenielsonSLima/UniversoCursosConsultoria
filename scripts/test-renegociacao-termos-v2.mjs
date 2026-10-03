import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE_PATH) throw new Error('Defina PGLITE_MODULE_PATH.');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
const db = new PGlite();
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const expectCode = async (operation, code) => {
  await assert.rejects(operation, (error) => error.code === code);
};
const ids = ['00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402'];
try {
  await db.exec(read('supabase/tests/receivable_renegotiation_pglite_base.sql'));
  for (const name of [
    '20261003040301_receivable_renegotiation_proposal_schema',
    '20261003040303_receivable_renegotiation_proposal_reads',
    '20261003040307_receivable_renegotiation_proposal_mutations',
    '20261003040309_receivable_renegotiation_policy_helpers',
    '20261003040312_receivable_renegotiation_eligibility',
    '20261003040314_receivable_renegotiation_calculation_helpers',
    '20261003040317_receivable_renegotiation_preview',
    '20261003040319_receivable_renegotiation_candidate_rpcs',
    '20261003040737_receivable_renegotiation_rls_guard',
  ]) await db.exec(read(`supabase/migrations/${name}.sql`));
  // Reproduz os campos ausentes antes do patch no mesmo banco descartável.
  for (const terms of [{ targetNegotiatedCents: 29000 }, { intervalDays: 15 }]) {
    await expectCode(() => one('select public.preview_receivable_renegotiation_secure($1,$2) result',
      [ids, terms]), '22023');
  }
  for (const name of ['20261003153539_receivable_renegotiation_schedule_v2',
    '20261003153612_receivable_renegotiation_terms_v2']) {
    await db.exec(read(`supabase/migrations/${name}.sql`));
  }
  const today = (await one("select (now() at time zone 'America/Maceio')::date::text today")).today;
  const preview = async (terms = {}, overrides = {}) => (await one(
    'select public.preview_receivable_renegotiation_secure($1,$2,$3) result',
    [ids, { installmentCount: 3, firstDueDate: today, ...terms }, overrides],
  )).result;
  const before = (await db.query('select * from public.contas_receber order by id')).rows;
  const baseline = await preview();
  assert.equal(baseline.version, 2);
  assert.equal(baseline.schedule.cadence, 'MONTHLY');
  assert.equal(baseline.policySnapshot.receiptPolicy.daysAfterDue, 60);
  const target = baseline.totals.grossDebtCents - 1000;
  const p = await preview({ targetNegotiatedCents: target, downPaymentCents: 5000,
    cadence: 'FIXED_DAYS', intervalDays: 15 }, { waivedInterestCents: 100 });
  assert.equal(p.totals.negotiatedCents, target);
  assert.equal(p.totals.commercialDiscountCents, 900);
  assert.equal(p.totals.financedCents, target - 5000);
  assert.equal(p.schedule.entries.reduce((sum, entry) => sum + entry.amountCents, 0), target);
  assert.equal(p.terms.targetNegotiatedCents, target);
  assert.equal(p.terms.commercialDiscountCents, undefined);
  assert.equal(p.requiresApproval, true);
  assert.equal(p.schedule.entries[0].financialTerms.nominalAmount, 50);
  for (const entry of p.schedule.entries) {
    assert.equal(entry.financialTerms.nominalAmount, entry.amountCents / 100);
    assert.equal(entry.financialTerms.dueDate, entry.dueDate);
    assert.equal(entry.financialTerms.discount.value,
      p.policySnapshot.effective.punctualDiscount.amountCents / 100);
  }
  assert.equal((Date.parse(p.schedule.entries[2].dueDate) - Date.parse(p.schedule.entries[1].dueDate)) / 86400000, 15);
  for (const bad of [
    { targetNegotiatedCents: target, commercialDiscountCents: 0 },
    { targetNegotiatedCents: 0 }, { targetNegotiatedCents: baseline.totals.grossDebtCents + 1 },
    { targetNegotiatedCents: 1.5 }, { cadence: 'MONTHLY', intervalDays: 30 },
    { cadence: 'FIXED_DAYS' }, { cadence: 'FIXED_DAYS', intervalDays: 0 },
    { cadence: 'FIXED_DAYS', intervalDays: 366 }, { cadence: 'FIXED_DAYS', intervalDays: 1.5 },
    { cadence: null }, { cadence: 'WEEKLY' }, { installmentCount: 61 },
  ]) await expectCode(() => preview(bad), '22023');
  await expectCode(() => preview({ targetNegotiatedCents: baseline.totals.grossDebtCents },
    { waivedInterestCents: 1 }), '22023');
  const full = await preview({ targetNegotiatedCents: target, downPaymentCents: target,
    installmentCount: 0, firstDueDate: null });
  assert.equal(full.schedule.firstDueDate, null);
  assert.equal(full.schedule.entries.length, 1);
  assert.equal(full.schedule.entries[0].dueDate, today);
  assert.equal(full.totals.financedCents, 0);
  const schedule = async (cadence, interval) => (await one(`select
    internal_finance.build_receivable_renegotiation_schedule_v2(10001,0,3,'2028-01-31','2028-01-01',$1,$2) result`,
  [cadence, interval])).result;
  assert.deepEqual((await schedule('MONTHLY', null)).entries.map((e) => e.dueDate),
    ['2028-01-31', '2028-02-29', '2028-03-31']);
  assert.deepEqual((await schedule('FIXED_DAYS', 30)).entries.map((e) => e.dueDate),
    ['2028-01-31', '2028-03-01', '2028-03-31']);
  assert.deepEqual((await schedule('MONTHLY', null)).entries.map((e) => e.amountCents), [3334, 3334, 3333]);
  await expectCode(() => preview({ downPaymentCents: 1 }), '22023');
  await expectCode(() => preview({}, { monthlyInterestBasisPoints: 10000 }), '22023');
  const changed = await preview({ targetNegotiatedCents: target, cadence: 'FIXED_DAYS', intervalDays: 16 });
  const same = await preview({ targetNegotiatedCents: target, cadence: 'FIXED_DAYS', intervalDays: 15 });
  assert.notEqual(changed.calculationFingerprint, same.calculationFingerprint);
  assert.deepEqual((await db.query('select * from public.contas_receber order by id')).rows, before);
  const save = async (requestId, fingerprint = same.proposalFingerprint) => (await one(`select
    public.save_receivable_renegotiation_proposal_secure($1,$2,$3,$4,$5,null,true,'Acordo sintético') result`,
  [requestId, ids, fingerprint, same.terms, {},])).result;
  await expectCode(() => save('00000000-0000-0000-0000-000000000700', changed.proposalFingerprint), '40001');
  const saved = await save('00000000-0000-0000-0000-000000000701');
  assert.equal(saved.proposal.negotiatedCents, target);
  assert.equal((await save('00000000-0000-0000-0000-000000000701')).replayed, true);
  const detail = (await one('select public.get_receivable_renegotiation_proposal_secure($1) result', [saved.proposal.id])).result;
  assert.deepEqual(detail.canonicalSnapshot.schedule, same.schedule);
  assert.equal(detail.canonicalSnapshot.policySnapshot.receiptPolicy.daysAfterDue, 60);
  assert.deepEqual((await db.query('select * from public.contas_receber order by id')).rows, before);
  console.log('Renegociação termos v2: reprodução, centavos, datas, política bancária, CAS e replay aprovados.');
} finally {
  await db.close();
}
