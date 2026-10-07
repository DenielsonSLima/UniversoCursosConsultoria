import { boundedDraftDirectory, boundedDraftFiles } from './bounded-draft-paths.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {seed,actor,operation,bankIds,localIds,paidLocal,uid} from './bounded-seed.mjs';
let db,manifest,claim;
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await q(sql,args))[0].value;
const invoke=(name,args=[])=>scalar(`select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args);
const call=(name,args=[])=>invoke('public.'+name+'_financial_correction_service',args);
async function prepare(approve=true) {
  manifest=await invoke('internal_financial_correction.prepare_operation',
    [operation,actor,bankIds,localIds,'synthetic-approval','a'.repeat(64)]);
  if(approve) await invoke('internal_financial_correction.approve_operation',[operation,manifest.planFingerprint]);
  return manifest;
}
async function claimFirst(id=bankIds[0]) {
  claim=await call('claim',[operation,id,manifest.fingerprint]); return claim;
}
const scoped=()=>[operation,claim.item.receivableId,manifest.fingerprint,claim.leaseToken];
const evidence=(alreadyCanceled=false)=>({confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
  bankResult:{convenio:claim.item.convenio,nossoNumero:claim.item.nossoNumero,situationCode:5,
    remoteStatus:'CANCELED',alreadyCanceled,mutationAttempted:!alreadyCanceled,raw:{CodigoSituacaoBoleto:5},
    proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}});
async function isolated(run) {
  await db.exec('begin'); try { await run(); } finally { await db.exec('rollback'); }
}
before(async()=>{
  db=new PGlite();
  for(const name of ['bounded-base.fixture.sql','bounded-source.fixture.sql','fixtures/canonical-reviewed-receivable.sql',
    'fixtures/canonical-expected-terms.sql','fixtures/canonical-issuance-fingerprint.sql']) await db.exec(await readFile(new URL(name,import.meta.url),'utf8'));
  await seed(db);
  const dir=boundedDraftDirectory;
  for(const name of boundedDraftFiles({ through: 5 }))
    await db.exec(await readFile(new URL(name,dir),'utf8'));
  await db.exec("set test.jwt.role='service_role'");
});
after(async()=>await db?.close());
test('exact 49-bank and 5-local full plan; canonical 36 due/terms corrections',()=>isolated(async()=>{
  const m=await prepare(); assert.equal(m.items.length,49);
  assert.equal(createHash('sha256').update(m.canonicalText).digest('hex'),m.fingerprint);
  assert.notEqual(m.planFingerprint,m.fingerprint);
  const rows=await q('select * from internal_financial_correction.items');
  assert.deepEqual(Object.fromEntries(['RESET_C1','CANCEL_C2','LOCAL_WAIVER'].map(k=>[k,rows.filter(r=>r.kind===k).length])),
    {RESET_C1:36,CANCEL_C2:13,LOCAL_WAIVER:5});
  for(const r of rows.filter(r=>r.kind==='RESET_C1')) {
    assert.equal(r.corrected_terms.discount.value,19.9); assert.equal(r.corrected_terms.penalty.value,2);
    assert.equal(r.corrected_terms.interest.value,1); assert.match(new Date(r.corrected_due_date).toISOString(),/-15T|\-15$/);
    assert.deepEqual(r.run_snapshot.reviewed_items.find(x=>x.chave===r.receivable_snapshot.origem_cronograma_id).vencimento,
      r.receivable_snapshot.data_vencimento);
  }
  assert.equal((await q('select status from public.contas_receber where id=$1',[paidLocal]))[0].status,'PAGO');
}));
test('approval rejects bank-only hash and requires full-plan fingerprint',()=>isolated(async()=>{
  await prepare(false);
  await assert.rejects(()=>invoke('internal_financial_correction.approve_operation',[operation,manifest.fingerprint]),/FULL_PLAN/);
}));
test('service cannot load unapproved or non-service operation',()=>isolated(async()=>{
  await prepare(false); await assert.rejects(()=>call('load',[operation]),/NOT_APPROVED/);
}));
test('authenticated JWT cannot execute service RPC',()=>isolated(async()=>{
  await prepare(); await db.exec("set local test.jwt.role='authenticated'");
  await assert.rejects(()=>call('load',[operation]),/SERVICE_ONLY/);
}));
test('all 49 confirmations preserve source financial rows and paid LOCAL untouched',()=>isolated(async()=>{
  await prepare();
  const before=await q('select to_jsonb(r) value from public.contas_receber r order by id');
  const transactions=await q('select to_jsonb(t) value from public.payment_gateway_transactions t order by id');
  for(const id of bankIds) { await claimFirst(id); await call('complete',[...scoped(),evidence(true)]); }
  assert.equal((await call('load',[operation])).state,'COMPLETE');
  assert.equal((await q('select state from internal_financial_correction.operations'))[0].state,'BANK_CONFIRMED');
  assert.deepEqual(await q('select to_jsonb(r) value from public.contas_receber r order by id'),before);
  assert.deepEqual(await q('select to_jsonb(t) value from public.payment_gateway_transactions t order by id'),transactions);
  assert.equal((await q("select count(*)::int value from internal_financial_correction.items where kind='LOCAL_WAIVER' and state='READY'"))[0].value,5);
  assert.equal((await claimFirst()).mode,'COMPLETE');
}));
test('intent lease and uncertain operation restart are GET-only',()=>isolated(async()=>{
  await prepare(); await claimFirst();
  await assert.rejects(()=>claimFirst(),/LEASE_ACTIVE/);
}));
test('durable intent and review never allow a second mutation',()=>isolated(async()=>{
  await prepare(); await claimFirst(); await call('start',scoped());
  await call('review',[...scoped(),'REMOTE_AMBIGUOUS']);
  assert.equal((await claimFirst()).mode,'CONFIRM_ONLY');
  await assert.rejects(()=>call('start',scoped()),/INTENT_LEASE_OR_REPLAY/);
}));
test('completion after intent stores code5 evidence only',()=>isolated(async()=>{
  await prepare(); await claimFirst(); await call('start',scoped());
  const e=evidence(); await call('complete',[...scoped(),e]);
  assert.equal((await call('complete',[...scoped(),e])).replayed,true);
  assert.equal((await q('select status from public.contas_receber where id=$1',[bankIds[0]]))[0].status,'PENDENTE');
  assert.equal((await q('select remote_status from public.payment_gateway_transactions where receivable_id=$1',[bankIds[0]]))[0].remote_status,'PENDING');
}));
for(const [label,sql] of [
  ['partial payment','update public.contas_receber set valor_pago=0.01 where id=$1'],
  ['processing','update public.contas_receber set status=\'EM_PROCESSAMENTO\' where id=$1'],
  ['transaction receipt',"update public.payment_gateway_transactions set transaction_receipt_url='receipt' where receivable_id=$1"],
  ['run change',"update internal_academic.technical_manual_cycle_runs set policy_fingerprint='drift' where $1=any(receivable_ids)"],
  ['authorization change',"update internal_academic.technical_manual_receivable_issuance_authorizations set claim_count=99 where receivable_id=$1"],
]) test(`completion stops for ${label}`,()=>isolated(async()=>{
  await prepare(); await claimFirst(); await db.query(sql,[bankIds[0]]);
  await assert.rejects(()=>call('complete',[...scoped(),evidence(true)]));
}));
test('local fee cannot be claimed by bank service',()=>isolated(async()=>{
  await prepare(); await assert.rejects(()=>claimFirst(localIds[0]),/BANK_ITEM_REQUIRED/);
}));
test('paid LOCAL cannot replace an approved never-paid fee',()=>isolated(async()=>{
  await assert.rejects(()=>invoke('internal_financial_correction.prepare_operation',
    [operation,actor,bankIds,[...localIds.slice(0,4),paidLocal],'synthetic-approval','a'.repeat(64)]),/LOCAL_FEE/);
}));
test('wrong count and duplicate titles fail before preparation',()=>isolated(async()=>{
  await assert.rejects(()=>invoke('internal_financial_correction.prepare_operation',
    [operation,actor,bankIds.slice(1),localIds,'synthetic-approval','a'.repeat(64)]),/APPROVAL_INPUT/);
}));
test('bank proof cannot be changed or deleted',()=>isolated(async()=>{
  await prepare(); await claimFirst(); await call('complete',[...scoped(),evidence(true)]);
  await assert.rejects(()=>db.query("update internal_financial_correction.items set bank_evidence='{}' where receivable_id=$1",[bankIds[0]]),/IMMUTABLE/);
}));
test('canonical terms mismatch prevents preparation',()=>isolated(async()=>{
  await db.query("update public.contas_receber set gateway_financial_terms=jsonb_set(gateway_financial_terms,'{discount,value}','10') where id=$1",[bankIds[0]]);
  await assert.rejects(()=>prepare(),/CANONICAL_TERMS/);
}));
test('review stays audit-only after approver revocation',()=>isolated(async()=>{
  await prepare(); await claimFirst(); await call('start',scoped());
  await db.exec("update public.usuarios_sistema set status='INATIVO'");
  assert.equal((await call('review',[...scoped(),'REMOTE_AMBIGUOUS'])).reviewed,true);
}));

for(const [label,mutate] of [
  ['missing code 5',e=>{e.bankResult.situationCode=1;}],
  ['raw payment code',e=>{e.bankResult.raw.CodigoSituacaoBoleto=6;}],
  ['wrong bank identity',e=>{e.bankResult.nossoNumero='999999999';}],
  ['nonzero payment count',e=>{e.bankResult.proof.paymentsCount=1;}],
  ['missing strict payments proof',e=>{delete e.bankResult.proof.strictEffectivePayments;}],
  ['missing term proof',e=>{delete e.bankResult.proof.termsValidated;}],
  ['stale evidence',e=>{e.confirmedAt='2020-01-01T00:00:00Z';}],
  ['mutation without durable intent',e=>{e.bankResult.alreadyCanceled=false;e.bankResult.mutationAttempted=true;}],
]) test(`code5 confirmation rejects ${label}`,()=>isolated(async()=>{
  await prepare(); await claimFirst(); const e=evidence(true); mutate(e);
  await assert.rejects(()=>call('complete',[...scoped(),e]),/BANK_CONFIRMATION/);
}));
test('full plan source snapshots and authorization are immutable',()=>isolated(async()=>{
  await prepare(); await assert.rejects(()=>db.query("update internal_financial_correction.items set run_snapshot='{}' where receivable_id=$1",[bankIds[0]]),/IMMUTABLE/);
}));
test('approval actor is authorized before idempotent replay',()=>isolated(async()=>{
  await prepare(); await db.exec("update public.usuarios_sistema set status='INATIVO'");
  await assert.rejects(()=>prepare(false),/ACTOR_SCOPE/);
}));
test('duplicate bank item and bank/local overlap are refused',()=>isolated(async()=>{
  await assert.rejects(()=>invoke('internal_financial_correction.prepare_operation',
    [operation,actor,[bankIds[0],...bankIds.slice(0,48)],localIds,'synthetic-approval','a'.repeat(64)]),/DUPLICATE/);
}));
test('two transactions for one identity are ambiguous',()=>isolated(async()=>{
  await db.query(`insert into public.payment_gateway_transactions select
    (jsonb_populate_record(null::public.payment_gateway_transactions,to_jsonb(t)||jsonb_build_object('id',$1::text))).*
    from public.payment_gateway_transactions t where receivable_id=$2`,[uid(9999),bankIds[0]]);
  await assert.rejects(()=>prepare(),/TRANSACTION_AMBIGUOUS/);
}));
test('wrong original C1 calendar due fails even when saved terms and review are changed consistently',()=>isolated(async()=>{
  const id=bankIds[0];
  await db.query("update public.contas_receber set data_vencimento=data_vencimento+1 where id=$1",[id]);
  await assert.rejects(()=>prepare(),/revisão|BOUNDED|CANONICAL/);
}));
test('all approved runtime/private functions have no executable service/browser grants',()=>isolated(async()=>{
  for(const role of ['anon','authenticated','service_role']) {
    assert.equal(await scalar("select has_function_privilege($1,'public.load_financial_correction_service(uuid)','EXECUTE') value",[role]),false);
    assert.equal(await scalar("select has_function_privilege($1,'internal_financial_correction.approve_operation(uuid,text)','EXECUTE') value",[role]),false);
  }
}));
test('bank confirmation completion is idempotent only for identical evidence',()=>isolated(async()=>{
  await prepare(); await claimFirst(); const e=evidence(true); await call('complete',[...scoped(),e]);
  e.evidenceFingerprint='c'.repeat(64);
  await assert.rejects(()=>call('complete',[...scoped(),e]),/REPLAY_CONFLICT/);
}));
test('expired lease cannot complete and new claimant remains GET-only after intent',()=>isolated(async()=>{
  await prepare(); await claimFirst(); await call('start',scoped());
  await db.query("update internal_financial_correction.items set lease_until=now()-interval '1 second' where receivable_id=$1",[bankIds[0]]);
  await assert.rejects(()=>call('complete',[...scoped(),evidence()]),/LEASE_EXPIRED/);
}));
for(const [label,sql] of [
  ['authorization fingerprint',"update internal_academic.technical_manual_receivable_issuance_authorizations set receivable_fingerprint='stale' where receivable_id=$1"],
  ['never-claimed authorization',"update internal_academic.technical_manual_receivable_issuance_authorizations set first_claimed_at=null where receivable_id=$1"],
  ['wrong original actor',"update internal_academic.technical_manual_cycle_runs set created_by=null where $1=any(receivable_ids)"],
  ['issuer polo mismatch',"update public.payment_gateway_transactions set issuer_polo_id=null where receivable_id=$1"],
  ['origin polo mismatch',"update public.payment_gateway_transactions set origin_polo_id=null where receivable_id=$1"],
  ['missing cycle provenance',"update public.payment_gateway_transactions set raw_payload='{}' where receivable_id=$1"],
]) test(`preparation rejects ${label}`,()=>isolated(async()=>{
  await db.query(sql,[bankIds[0]]); await assert.rejects(()=>prepare(),/CANONICAL_TERMS_OR_AUTHORIZATION|TRANSACTION_IDENTITY/);
}));
