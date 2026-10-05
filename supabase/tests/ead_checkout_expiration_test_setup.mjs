import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const functionSource=(sql,name)=>{
  const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name);const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${tag};`)+tag.length+1);
};

// Contracts used by both focused expiration/gate regression suites. Their
// scenarios decide when to install the false gate; no readiness activation.
export async function loadEadExpirationTestSetup(db) {
  for(const f of ['caixa_monthly_optimization.fixture.sql','optional_ead_checkout.fixture.sql',
    'ead_checkout_expiration.fixture.sql','ead_checkout_attempts.fixture.sql']) await db.exec(fixture(f));
  await db.exec(functionSource(source('20260912221000_banese_verified_banking_grace.sql'),'public.banese_next_national_banking_day'));
  await db.exec(source('20261004155607_classify_optional_ead_checkout.sql'));
  await db.exec(functionSource(source('20261004173625_preserve_optional_ead_historical_cutoff.sql'),
    'internal_contas.ead_checkout_paid_after_cutoff'));
  await db.exec(source('20260901000800_preserve_paid_ead_receivable_on_inscription_projection.sql'));
  await db.exec(`create trigger test_real_ead_academic_projection after insert or update of status
    on public.inscricoes_online for each row execute function public.ead_activate_matricula_on_paid_inscricao()`);
  for(const f of ['20261005015448_ead_checkout_expiration_schema.sql','20261005015524_ead_checkout_expiration_claim.sql',
    '20261005015526_ead_checkout_expiration_finish.sql','20261005015528_ead_checkout_expiration_guards.sql',
    '20261005015533_ead_checkout_attempt_model.sql','20261005015535_ead_checkout_attempt_reservation.sql',
    '20261005015539_ead_checkout_attempt_projection.sql','20261005015541_ead_verified_settlement_range.sql',
    '20261005015543_recover_optional_ead_payment.sql','20261005015545_ead_student_states_payment_reviews.sql',
    '20261005020046_ead_attempt_release_legacy_singletons.sql']) await db.exec(source(f));
}
