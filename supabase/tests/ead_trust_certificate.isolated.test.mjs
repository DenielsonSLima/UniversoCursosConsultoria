import assert from 'node:assert/strict';
import test from 'node:test';
import {newTrustCertificateDatabase,seedFinancial,pay,grant,submit,progress,state,scalar,delivery,validate,source,
 alumno,other,course,enrollment,turma,unit,id} from './ead_trust_certificate.fixture.mjs';

const issue=async(db,managed=false)=>{await seedFinancial(db,{managed});await grant(db);await submit(db);return(await state(db)).certificates[0];};
const ledger=db=>scalar(db,'SELECT to_jsonb(i) value FROM internal_academic.ead_trust_certificate_issues i');
const audit=db=>scalar(db,'SELECT coalesce(jsonb_agg(event ORDER BY id),\'[]\') value FROM internal_academic.ead_trust_certificate_audit');
async function expire(db){
 await db.exec(`UPDATE internal_academic.ead_trust_certificate_issues SET deadline=statement_timestamp()-interval '1 hour';
 UPDATE internal_academic.ead_trust_access_audit SET expires_at=statement_timestamp()-interval '1 hour',
  granted_at=statement_timestamp()-interval '25 hours';
 UPDATE public.matriculas SET acesso_temporario_ate=statement_timestamp()-interval '1 hour' WHERE id='${enrollment}';`);
}
const model=(db,certificate)=>scalar(db,'SELECT public.get_aluno_ead_certificate_model($1) value',[certificate.id]);

test('cold rollout keeps the old quiz rule until every certificate protection and the expiry job are installed',async()=>{
 const db=await newTrustCertificateDatabase({activate:false});
 try{
  await seedFinancial(db);await grant(db);
  assert.equal((await progress(db)).summary.canTakeQuiz,false);
  await assert.rejects(submit(db),e=>e.code==='23514');
  assert.equal((await state(db)).certificates.length,0);
  await db.exec("UPDATE cron.job SET active=false WHERE jobname='ead-trust-certificate-expiry'");
  await assert.rejects(db.exec(await source('20261112225950_enable_ead_trust_certificate_lifecycle.sql')),e=>e.code==='55000');
  await db.exec('ROLLBACK');
  assert.equal(await scalar(db,'SELECT internal_academic.ead_trust_full_course_enabled() value'),false);
  await db.exec("UPDATE cron.job SET active=true WHERE jobname='ead-trust-certificate-expiry'");
  await db.exec(await source('20261112225950_enable_ead_trust_certificate_lifecycle.sql'));
  assert.equal((await progress(db)).summary.canTakeQuiz,true);
  await submit(db);
  const result=await state(db),cert=result.certificates[0];
  assert.equal(result.enrollment.status,'PENDENTE');assert.equal(cert.status,'FINALIZADO');
  assert.equal((await ledger(db)).state,'TEMPORARY');
  assert.equal((await delivery(db,cert.id)).allowed,true);
  assert.equal((await model(db,cert)).backgroundUrl,'synthetic-original-model');
  assert.equal((await validate(db,cert.codigo_validacao)).status,'ACTIVE');
  await assert.rejects(db.exec("UPDATE internal_academic.ead_trust_certificate_issues SET state='DEFINITIVE',confirmed_at=NULL"),e=>e.code==='23514');
  await assert.rejects(db.exec("UPDATE internal_academic.ead_trust_certificate_issues SET state='DEFINITIVE',confirmed_at=deadline"),e=>e.code==='23514');
  assert.deepEqual(await audit(db),['ISSUED_TEMPORARY']);
 }finally{await db.close();}
});

for(const managed of [false,true])test(`canonical ${managed?'managed Banese':'legacy Asaas'} confirmation inside the deadline preserves code and snapshots permanently`,async()=>{
 const db=await newTrustCertificateDatabase();
 try{
  const cert=await issue(db,managed),before=await state(db);
  await pay(db,{managed});
  assert.equal(await scalar(db,'SELECT internal_academic.ead_has_confirmed_payment($1) value',[enrollment]),true);
  const first=await ledger(db),after=await state(db);
  assert.equal(first.state,'DEFINITIVE');assert(Date.parse(first.confirmed_at)<Date.parse(first.deadline));
  assert.deepEqual(after.certificates,before.certificates);assert.deepEqual(after.documents,before.documents);
  assert.equal((await delivery(db,cert.id)).state,'DEFINITIVE');
  assert.equal((await delivery(db,cert.id)).deadline,null);
  await pay(db,{managed,backdated:true});
  assert.deepEqual(await ledger(db),first,'A financial replay does not move the first confirmation clock');
  await db.exec("UPDATE internal_academic.ead_trust_certificate_issues SET deadline=confirmed_at+interval '1 microsecond'");
  assert.equal((await validate(db,cert.codigo_validacao)).status,'ACTIVE');
  assert.equal(await scalar(db,'SELECT internal_academic.process_expired_ead_trust_certificates(100) value'),0);
  assert.deepEqual(await audit(db),['ISSUED_TEMPORARY','PAYMENT_CONFIRMED']);
 }finally{await db.close();}
});

for(const runCron of [false,true])test(`expired trust denies delivery immediately and late backdated payment creates one new code ${runCron?'after':'before'} the expiry job`,async()=>{
 const db=await newTrustCertificateDatabase();
 try{
  const cert=await issue(db,true),oldCode=cert.codigo_validacao;
  await db.query(`UPDATE public.documentos_validacao SET dados_emissao=dados_emissao||jsonb_build_object('validationCode',codigo),
   dados_publicos_snapshot=jsonb_build_object('code',codigo,'issuedAt',emitido_em) WHERE codigo=$1`,[oldCode]);
  const original=(await state(db)).documents[0];
  await expire(db);
  assert.equal((await state(db)).certificates[0].status,'FINALIZADO','The clock guard works before any persistent revocation');
  assert.equal((await validate(db,oldCode)).status,'REVOKED');
  assert.equal((await delivery(db,cert.id)).allowed,false);
  await assert.rejects(model(db,cert),e=>e.code==='42501');
  await assert.rejects(progress(db));
  if(runCron){
   assert.equal(await scalar(db,'SELECT internal_academic.process_expired_ead_trust_certificates(100) value'),1);
   assert.equal((await state(db)).certificates[0].status,'CANCELADO');
   assert.equal(await scalar(db,'SELECT internal_academic.process_expired_ead_trust_certificates(100) value'),0);
  }
  await pay(db,{managed:true,backdated:true});
  const result=await state(db),current=result.certificates[0],issueRow=await ledger(db);
  assert.equal(current.id,cert.id);assert.equal(current.matricula_id,enrollment);assert.equal(current.status,'FINALIZADO');
  assert.notEqual(current.codigo_validacao,oldCode);assert.equal(result.documents.length,2);
  assert.equal(issueRow.state,'REISSUED');assert(Date.parse(issueRow.confirmed_at)>=Date.parse(issueRow.deadline));
  const old=result.documents.find(d=>d.codigo===oldCode),replacement=result.documents.find(d=>d.codigo===current.codigo_validacao);
  assert.equal(old.status,'REVOGADO');assert(old.identidade.endsWith(`:REVOGADO:${old.id}`));
  assert.deepEqual(old.dados_emissao,original.dados_emissao);assert.deepEqual(old.dados_publicos_snapshot,original.dados_publicos_snapshot);
  const {validationCode:oldReserved,...oldSnapshot}=original.dados_emissao;
  const {validationCode:newReserved,...newSnapshot}=replacement.dados_emissao;
  assert.equal(oldReserved,oldCode);assert.equal(newReserved,current.codigo_validacao);assert.deepEqual(newSnapshot,oldSnapshot);
  assert.equal(replacement.dados_publicos_snapshot.code,current.codigo_validacao);
  assert.equal((await validate(db,oldCode)).status,'REVOKED');
  assert.equal((await validate(db,current.codigo_validacao)).status,'ACTIVE');
  assert.equal((await validate(db,current.codigo_validacao)).code,current.codigo_validacao);
  assert.equal((await delivery(db,cert.id)).code,current.codigo_validacao);
  assert.equal((await delivery(db,cert.id)).state,'DEFINITIVE');
  assert.equal((await model(db,current)).backgroundUrl,'synthetic-original-model');
  await pay(db,{managed:true});
  assert.equal((await state(db)).documents.length,2);assert.equal((await state(db)).certificates[0].codigo_validacao,current.codigo_validacao);
  assert.deepEqual(await audit(db),runCron?['ISSUED_TEMPORARY','REVOKED','PAYMENT_CONFIRMED','REISSUED_AFTER_PAYMENT']:
   ['ISSUED_TEMPORARY','PAYMENT_CONFIRMED','REVOKED','REISSUED_AFTER_PAYMENT']);
 }finally{await db.close();}
});

test('a terminal current charge revokes its trust certificate; reopening a purchase cannot revive that old code',async()=>{
 const db=await newTrustCertificateDatabase();
 try{
  const cert=await issue(db,true);
  await db.exec('BEGIN');
  await db.query("UPDATE public.ead_checkout_attempts SET state='EXPIRED' WHERE id=$1",[id(4)]);
  await db.query("UPDATE public.contas_receber SET status='CANCELADO' WHERE id=$1",[id(1)]);
  await db.exec('COMMIT');
  assert.equal((await ledger(db)).revocation_reason,'FINANCIAL_ACCESS_CLOSED');
  assert.equal((await validate(db,cert.codigo_validacao)).status,'REVOKED');
  await db.query('UPDATE public.ead_checkout_attempts SET is_current=false WHERE id=$1',[id(4)]);
  await db.query(`INSERT INTO public.contas_receber(id,matricula_id,cliente_id,turma_id,polo_id,tipo_lancamento,valor,ead_checkout_attempt_id)
   VALUES($1,$2,$3,$4,$5,'MATRICULA',100,$6)`,[id(11),enrollment,alumno,turma,unit,id(14)]);
  await db.query(`INSERT INTO public.ead_checkout_attempts(id,matricula_id,aluno_id,turma_id,curso_id,receivable_id)
   VALUES($1,$2,$3,$4,$5,$6)`,[id(14),enrollment,alumno,turma,course,id(11)]);
  assert.equal(await scalar(db,'SELECT internal_academic.ead_has_trust_access($1) value',[enrollment]),true);
  assert.equal((await progress(db)).summary.canTakeQuiz,true,'Study remains eligible only inside the original trust window');
  await assert.rejects(submit(db),e=>e.code==='55000','A revoked certificate needs its own confirmed payment before replacement');
  assert.equal((await validate(db,cert.codigo_validacao)).status,'REVOKED');
  assert.equal((await state(db)).documents.length,1);
 }finally{await db.close();}
});

test('ordinary finalized EAD history stays outside the trust ledger and private lifecycle cannot be invoked by portal roles',async()=>{
 const db=await newTrustCertificateDatabase();
 try{
  await db.exec("UPDATE public.matriculas SET status='ATIVO'");await submit(db);
  const before=await state(db),cert=before.certificates[0];
  assert.equal(await scalar(db,'SELECT count(*)::int value FROM internal_academic.ead_trust_certificate_issues'),0);
  await scalar(db,'SELECT internal_academic.process_expired_ead_trust_certificates(100) value');
  assert.deepEqual(await state(db),before);assert.equal((await delivery(db,cert.id)).state,'DEFINITIVE');
  assert.equal((await validate(db,cert.codigo_validacao)).status,'ACTIVE');
  for(const role of ['anon','authenticated','service_role'])for(const fn of [
   'internal_academic.ead_certificate_is_deliverable(uuid)','internal_academic.reconcile_ead_trust_certificate(uuid)',
   'internal_academic.process_expired_ead_trust_certificates(integer)']){
   assert.equal(await scalar(db,'SELECT has_function_privilege($1,$2,\'EXECUTE\') value',[role,fn]),false);
  }
  assert.equal(await scalar(db,"SELECT bool_and(relrowsecurity) value FROM pg_class WHERE oid IN ('internal_academic.ead_trust_certificate_issues'::regclass,'internal_academic.ead_trust_certificate_audit'::regclass)"),true);
  await db.exec(`SET test.gestor='false';SET test.aluno_id='${other}';SET test.actor='${other}'`);
  await assert.rejects(delivery(db,cert.id),e=>e.code==='42501');
  await db.exec("SET test.actor=''");await assert.rejects(delivery(db,cert.id),e=>e.code==='42501');
 }finally{await db.close();}
});
