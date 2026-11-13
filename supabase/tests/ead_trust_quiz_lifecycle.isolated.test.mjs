import assert from 'node:assert/strict';
import test from 'node:test';
import {newTrustCertificateDatabase,seedFinancial,source,scalar,grant,submit,progress,state,pay,
 enrollment,alumno,course,turma,unit,id} from './ead_trust_certificate.fixture.mjs';

test('public quiz rollout allows a trust certificate without converting its pending enrollment into permanent access',async t=>{
 const db=await newTrustCertificateDatabase({activate:false});let certificate;
 try{
  await seedFinancial(db,{managed:true});await grant(db);
  await t.test('closed gate preserves study but refuses final quiz and certificate issuance',async()=>{
   assert.equal(await scalar(db,'select internal_academic.ead_trust_full_course_enabled() value'),false);
   const data=await progress(db);assert.equal(data.summary.temporaryAccess,true);assert.equal(data.summary.canTakeQuiz,false);
   await assert.rejects(()=>submit(db),e=>e.code==='23514');assert.equal((await state(db)).certificates.length,0);
  });
  await t.test('activation permits the actual public quiz and automatic certificate on the same pending enrollment',async()=>{
   await db.exec(await source('20261112225950_enable_ead_trust_certificate_lifecycle.sql'));
   assert.equal((await progress(db)).summary.canTakeQuiz,true);
   const result=await submit(db);const snapshot=await state(db);
   assert.equal(result.summary.quizPassed,true);assert.equal(snapshot.enrollment.status,'PENDENTE');
   assert.equal(snapshot.certificates.length,1);certificate=snapshot.certificates[0];
   assert.equal(certificate.matricula_id,enrollment);assert.equal(certificate.status,'FINALIZADO');
   assert.ok(certificate.codigo_validacao);assert.equal(result.summary.certificateId,certificate.id);
   const repeated=await submit(db);
   assert.equal(repeated.summary.certificateId,certificate.id);assert.equal((await state(db)).certificates.length,1);
   assert.equal((await state(db)).certificates[0].codigo_validacao,certificate.codigo_validacao);
  });
  await t.test('a certificate from another enrollment in the same course cannot replace the selected certificateId',async()=>{
   await db.query('insert into matriculas(id,aluno_id,turma_id,status) values($1,$2,$3,$4)',[id(90),alumno,turma,'PENDENTE']);
   await db.query(`insert into certificados_academicos(id,matricula_id,aluno_id,turma_id,curso_id,polo_id,modalidade,
    status,codigo_validacao,data_conclusao,created_at) values($1,$2,$3,$4,$5,$6,'EAD','FINALIZADO','CERT-OTHER-SYNTHETIC',current_date+1,now()+interval '1 day')`,
    [id(91),id(90),alumno,turma,course,unit]);
   assert.equal((await progress(db)).summary.certificateId,certificate.id);
  });
  await t.test('completed trust progress never bypasses the deadline and canonical payment restores definitive access',async()=>{
   await db.query("update matriculas set acesso_temporario_ate=statement_timestamp()-interval '1 second' where id=$1",[enrollment]);
   assert.equal((await state(db)).enrollment.status,'PENDENTE');
   await assert.rejects(()=>progress(db));await assert.rejects(()=>submit(db));
   await pay(db,{managed:true});
   assert.equal(await scalar(db,'select internal_academic.ead_has_confirmed_payment($1) value',[enrollment]),true);
   const restored=await progress(db);
   assert.equal(restored.summary.temporaryAccess,false);assert.equal(restored.summary.quizPassed,true);
   assert.ok(['ATIVO','CONCLUIDO'].includes((await state(db)).enrollment.status));
  });
 }finally{await db.close();}
});
