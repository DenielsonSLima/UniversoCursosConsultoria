import { boundedDraftDirectory, boundedDraftFiles } from './bounded-draft-paths.mjs';
import {readFile} from 'node:fs/promises';
import {seed,actor,bankIds,uid} from './bounded-seed.mjs';
const local=new URL('./',import.meta.url);
export async function createIntegrationDatabase() {
 const {PGlite}=await import('@electric-sql/pglite');
 return loadIntegrationDatabase(new PGlite());
}
// Reuses identical captured schemas/guards in the ephemeral PostgreSQL CI suite.
export async function loadIntegrationDatabase(db) {
 const load=async file=>db.exec(await readFile(new URL(file,local),'utf8'));
 for(const file of ['bounded-base.fixture.sql','bounded-source.fixture.sql',
   'fixtures/bounded-integration-network.sql','fixtures/bounded-integration-columns.sql','fixtures/bounded-integration-security.sql',
   'fixtures/canonical-reviewed-receivable.sql','fixtures/canonical-expected-terms.sql',
   'fixtures/canonical-issuance-fingerprint.sql']) await load(file);
 await seed(db);
 await db.exec(`update internal_academic.technical_manual_cycle_runs run set
   first_due_date=(select min(r.data_vencimento) from public.contas_receber r where r.id=any(run.receivable_ids)),
   expected_installment_count=(select count(*) from public.contas_receber r where r.id=any(run.receivable_ids) and r.tipo_lancamento='PARCELA'),
   total_amount=(select sum(r.valor) from public.contas_receber r where r.id=any(run.receivable_ids));`);
 // Production environment is data only. This suite makes no HTTP/bank calls.
 await db.exec("update public.contas_receber set gateway_environment='production' where gateway_provider is not null; update public.payment_gateway_transactions set environment='production';");
 // Synthetic unrelated 168 receipts must remain byte-for-byte unchanged.
 for(let n=0;n<168;n++) await db.query(`insert into public.contas_receber select
   (jsonb_populate_record(null::public.contas_receber,to_jsonb(r)||jsonb_build_object('id',$1::text,'gateway_payment_id',$3::text,'gateway_boleto_nosso_numero',$3::text))).*
   from public.contas_receber r where id=$2`,[uid(20000+n),bankIds[0],String(70000+n).padStart(9,'0')]);
 for(const file of ['fixtures/bounded-integration-reissue-schema.sql',
   'fixtures/bounded-integration-reissue-guards.sql',
   'fixtures/canonical-technical_manual_banese_receivable_complete.sql',
   'fixtures/canonical-technical_manual_banese_receivable_paid_issued.sql',
   'fixtures/canonical-local-intent.sql',
   'fixtures/baseline-manual_cycle_local_receivable_complete.sql',
   'fixtures/baseline-manual_cycle_local_fee_summary.sql',
   'fixtures/baseline-manual_cycle_issuance_progress.sql',
   'fixtures/canonical-settlement-evidence.sql','fixtures/canonical-reissue-helpers.sql','fixtures/canonical-reissue-bypass.sql',
   'fixtures/baseline-assert_manual_cycle_reviewed_receivable.sql',
   'fixtures/baseline-enforce_receivable_gateway_submission_fence.sql',
   'fixtures/baseline-guard_manual_cycle_reviewed_identity.sql',
   'fixtures/baseline-technical_manual_cycle_state.sql',
   'fixtures/canonical-guard_manual_technical_receivable_first_bank_claim.sql',
   'fixtures/canonical-guard_technical_receivable_policy_snapshot.sql',
   'fixtures/canonical-authorize_technical_manual_receivable_issuance_secure.sql']) await load(file);
 await load('fixtures/canonical-receivable-triggers.sql');
 await load('fixtures/canonical-canceled-number-reuse.sql');
 await load('fixtures/canonical-atomic-and-queue.sql');
 await load('fixtures/canonical-transaction-guards.sql');
 await load('fixtures/canonical-persist-issuance.sql');
 await db.exec('alter table public.payment_gateway_transactions alter column id set default gen_random_uuid()');
 const dir=boundedDraftDirectory;
 for(const name of boundedDraftFiles({ through: 13 })) {
   try {await db.exec(await readFile(new URL(name,dir),'utf8'));}
   catch(error) { throw new Error(`Migration ${name}: ${error.message}`,{cause:error}); }
 }
 await db.exec(`set test.jwt.role='service_role'; set test.actor='${actor}';`);
 return db;
}
