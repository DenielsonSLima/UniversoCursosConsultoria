import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// In-memory PostgreSQL only: no Supabase or bank connections.
const packageUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(packageUrl);
const {pgcrypto}=await import(process.env.PGLITE_MODULE_PATH
  ?new URL('./contrib/pgcrypto.js',packageUrl).href:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
let activeSource;
const source=name=>{activeSource=name;return readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');};
const fixture=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const functionSource=(sql,name)=>{
  const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name);const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${tag};`)+tag.length+1);
};
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo='00000000-0000-0000-0000-000000000001',ead='00000000-0000-0000-0000-000000000012';
const turma='00000000-0000-0000-0000-000000000022';
const fingerprint='a'.repeat(64),line='0479'+'0'.repeat(43),barcode='0479'+'0'.repeat(40);
const role=async(name,actor=id(999),aluno=id(1))=>db.query('update test_caixa.access_state set role_name=$1,actor=$2,aluno=$3',[name,actor,aluno]);
const prepare=(n,request,amount=99.9,due='2026-09-10')=>scalar(`select public.ead_prepare_checkout_attempt($1,$2,$3,
  'banese_card','production','BOLETO',$4,$5,'Compra EAD',null,null) value`,[id(n),turma,id(request),amount,due]);
const claim=lane=>scalar('select public.claim_banese_ead_checkout_expiration($1) value',[lane]);
const start=c=>scalar('select public.start_banese_ead_checkout_expiration_mutation($1,$2,$3,$4) value',
  [c.jobId,c.leaseToken,'2026-12-31',fingerprint]);
const finish=(c,result,remote,situation,payments,error=null)=>scalar(`select public.finish_banese_ead_checkout_expiration(
  $1,$2,$3,$4,$5,$6,$7,$8,$9) value`,[c.jobId,c.leaseToken,result,remote,situation,payments,fingerprint,error,'2026-12-31']);
const recover=(c,overrides={})=>scalar('select public.recover_banese_ead_checkout_payment($1,$2,$3) value',[
  c.jobId,c.leaseToken,{paymentCount:1,paymentDate:'2026-10-03',totalAmountCents:9990,
    settlementMethod:'NAO_IDENTIFICADO',lastPaymentDate:'2026-12-31',evidenceFingerprint:fingerprint,
    expectedSnapshot:c.snapshot,...overrides}]);
const issue=async(a,number,due='2026-09-10',validate=true)=>{
  if(validate) await scalar('select public.ead_validate_checkout_attempt_for_issuance($1,$2,$3) value',[a.attemptId,a.receivableId,a.creationToken]);
  const ourNumber=String(number).padStart(9,'0');
  await db.query(`update public.contas_receber set gateway_status='PENDING',gateway_creation_token=null,
    gateway_payment_id=$2,gateway_boleto_nosso_numero=$2,gateway_boleto_convenio='1',gateway_boleto_agencia='001',
    gateway_boleto_linha_digitavel=$3,gateway_boleto_codigo_barras=$4,gateway_submission_channel='API',
    gateway_submission_status='API_REGISTERED',gateway_financial_terms=$5,gateway_financial_terms_confirmed_at=now(),updated_at=now()
    where id=$1`,[a.receivableId,ourNumber,line,barcode,{nominalAmount:99.9,dueDate:due,discount:null,penalty:null,interest:null}]);
  await db.query('update public.inscricoes_online set gateway_payment_id=$2 where id=$1',[a.inscricaoId,ourNumber]);
  const t=await scalar(`insert into public.payment_gateway_transactions(receivable_id,inscricao_online_id,provider_code,
    environment,remote_payment_id,remote_status,payment_method,bank_slip_our_number,bank_slip_digitable_line,bank_slip_barcode,amount)
    values($1,$2,'banese_card','production',$3,'PENDING','BOLETO',$3,$4,$5,99.9) returning id value`,
  [a.receivableId,a.inscricaoId,ourNumber,line,barcode]);
  await db.query("insert into public.banese_reconciliation_queue(receivable_id,state,next_check_at) values($1,'READY',now())",[a.receivableId]);
  return scalar('select public.ead_bind_checkout_attempt($1,$2,$3,$4) value',[a.attemptId,a.receivableId,t,a.inscricaoId]);
};
const paid=async a=>{
  await db.query(`update public.contas_receber set status='PAGO',valor_pago=99.9,data_pagamento='2026-10-03',
    gateway_status='PAID',origem_pagamento='BANESE',gateway_settlement_source='API',gateway_settlement_evidence='{"paymentCount":1}'
    where id=$1`,[a.receivableId]);
  await db.query("update public.payment_gateway_transactions set remote_status='PAID' where receivable_id=$1",[a.receivableId]);
  await db.query("update public.inscricoes_online set status='PAGO',pago_em='2026-10-03' where id=$1",[a.inscricaoId]);
};
const newStudent=n=>db.query("insert into public.parceiros(id,nome,cpf_cnpj) values($1,'Aluno QA','00000000000')",[id(n)]);

try {
  for(const f of ['caixa_monthly_optimization.fixture.sql','optional_ead_checkout.fixture.sql',
    'ead_checkout_expiration.fixture.sql','ead_checkout_attempts.fixture.sql']) await db.exec(fixture(f));
  const baselines=[
    ['20260827035500_deterministic_banese_settlement_composition.sql','public.resolve_receivable_financial_composition'],
    ['20260913010000_caixa_monthly_delinquency.sql','internal_contas.caixa_monthly_receivable_state'],
    ['20260913010000_caixa_monthly_delinquency.sql','internal_contas.caixa_monthly_delinquency'],
    ['20261002011400_caixa_review_drilldown.sql','internal_contas.caixa_receivables_position_rows'],
    ['20260913132033_caixa_open_receivables_evidence.sql','internal_contas.caixa_open_receivables'],
    ['20260827040000_add_margem_inadimplencia_to_caixa_compromissos.sql','public.get_caixa_prestacao_mensal_v2_core'],
    ['20260716150931_optimize_caixa_secretaria_loading.sql','public.get_caixa_dashboard_secure'],
    ['20260827130000_create_caixa_linha_corte_rpc.sql','public.get_caixa_linha_corte_secure'],
    ['20260812141118_add_financial_report_summaries_and_ar_aging.sql','public.get_relatorio_inadimplencia_secure'],
    ['20260912133433_align_receivables_page_payment_period.sql','public.get_receivables_modality_page_v3_secure'],
    ['20260912133700_align_receivables_groups_payment_period.sql','public.get_receivables_modality_groups_page_v3_secure'],
    ['20260912133702_align_receivables_summary_payment_period.sql','public.get_receivables_modality_summary_v3_secure'],
    ['20260912221000_banese_verified_banking_grace.sql','public.banese_next_national_banking_day']];
  for(const [file,name] of baselines) await db.exec(functionSource(source(file),name));
  for(const f of ['20261004155607_classify_optional_ead_checkout.sql','20261004155625_exclude_optional_ead_from_debt.sql',
    '20261004155644_exclude_optional_ead_from_overdue_receivables.sql','20261004173625_preserve_optional_ead_historical_cutoff.sql',
    '20260901000800_preserve_paid_ead_receivable_on_inscription_projection.sql']) await db.exec(source(f));
  await db.exec(`create trigger test_real_ead_academic_projection after insert or update of status
    on public.inscricoes_online for each row execute function public.ead_activate_matricula_on_paid_inscricao()`);
  const financialOids=await scalar(`select array['internal_contas.ead_checkout_is_optional(uuid)'::regprocedure::oid,
    'internal_contas.ead_checkout_paid_after_cutoff(uuid,date)'::regprocedure::oid] value`);
  for(const f of ['20261005015448_ead_checkout_expiration_schema.sql','20261005015524_ead_checkout_expiration_claim.sql',
    '20261005015526_ead_checkout_expiration_finish.sql','20261005015528_ead_checkout_expiration_guards.sql',
    '20261005015530_ead_checkout_expiration_release_gate.sql','20261005015533_ead_checkout_attempt_model.sql',
    '20261005015535_ead_checkout_attempt_reservation.sql','20261005015539_ead_checkout_attempt_projection.sql',
    '20261005015541_ead_verified_settlement_range.sql','20261005015543_recover_optional_ead_payment.sql',
    '20261005015545_ead_student_states_payment_reviews.sql']) await db.exec(source(f));
  assert.equal(await scalar("select to_regclass('public.contas_receber_matricula_matricula_uidx') is not null value"),true,'Additive stage keeps deployed receipt singleton');
  assert.equal(await scalar("select exists(select 1 from pg_constraint where conname='inscricoes_online_matricula_id_key') value"),true,'Additive stage keeps deployed inscription upsert contract');
  await db.exec(source('20261005020046_ead_attempt_release_legacy_singletons.sql'));
  assert.deepEqual(await scalar(`select array['internal_contas.ead_checkout_is_optional(uuid)'::regprocedure::oid,
    'internal_contas.ead_checkout_paid_after_cutoff(uuid,date)'::regprocedure::oid] value`),financialOids,'Financial readers keep their OIDs');
  await role('service_role');await newStudent(1);
  const a=await prepare(1,101);assert.equal(a.action,'CREATE');assert.ok(a.creationToken);
  assert.equal((await prepare(1,101)).action,'AWAITING_CONFIRMATION','Replay cannot own another emission');
  await assert.rejects(()=>prepare(1,101,100),/Request id/);
  await issue(a,1);assert.equal((await prepare(1,101)).action,'AWAITING_CONFIRMATION','Expired title waits for safe bank resolution');
  await newStudent(9);const future=await prepare(9,109,99.9,'2026-12-31');await issue(future,9,'2026-12-31');
  assert.equal((await prepare(9,109,99.9,'2026-12-31')).action,'REUSE','Lost response recovers a valid bound title');
  for(const change of ["gateway_status='PAID'","valor_pago=0.01","data_pagamento='2026-10-03'"]) {
    await db.exec('begin');await db.query(`update public.contas_receber set ${change} where id=$1`,[future.receivableId]);
    assert.equal((await prepare(9,109,99.9,'2026-12-31')).action,'AWAITING_CONFIRMATION');
    assert.equal((await scalar('select public.ead_get_student_checkout_states($1) value',[id(9)]))[0].canPay,false);
    await db.exec('rollback');
  }
  await db.exec('begin');await db.query("update public.payment_gateway_transactions set remote_status='PAID' where receivable_id=$1",[future.receivableId]);
  assert.equal((await prepare(9,109,99.9,'2026-12-31')).action,'AWAITING_CONFIRMATION');
  assert.equal((await scalar('select public.ead_get_student_checkout_states($1) value',[id(9)]))[0].canPay,false);
  await db.exec('rollback');
  assert.equal(await scalar("select internal_contas.ead_expiration_today('2026-10-05T02:30:00Z')::text value"),'2026-10-04','Bank margin uses Maceió date across UTC midnight');
  const range=(terms,paymentDate)=>scalar('select internal_contas.ead_verified_settlement_cents($1,$2) value',[
    {amount:100,dueDate:'2026-10-03',financialTerms:{nominalAmount:100,dueDate:'2026-10-03',...terms}},paymentDate]);
  assert.deepEqual(await range({discount:{type:'percentage',value:10}},'2026-10-05'),[9000,9000],'Useful due extension retains punctual discount');
  assert.deepEqual(await range({penalty:{type:'percentage',value:2},interest:{type:'monthly-percentage',value:1}},'2026-10-06'),[10210,10210]);
  assert.deepEqual(await range({interest:{type:'monthly-percentage',value:1}},'2026-10-04'),[10000,10000],'Weekend grace does not use late range');
  assert.deepEqual(await range({interest:{type:'monthly-percentage',value:1}},'2026-10-07'),[10013,10014],'Fractional interest preserves exact cent bounds');
  assert.equal(await range({discount:{type:'fixed',value:100}},'2026-10-03'),null,'Invalid terms are rejected before receipt');
  await db.exec(`update public.banese_ead_checkout_expiration_config set enabled=true,verified_local_holidays='{}',
    verified_polo_ids=array['${polo}'::uuid] where environment='production'`);
  assert.equal((await claim('ACTION')).claimed,false,'Readiness remains false despite configuration');
  await db.exec(source('20261005020051_release_ead_checkout_lifecycle.sql'));
  const canceledClaim=await claim('ACTION');assert.equal(canceledClaim.claimed,true,JSON.stringify(await scalar(`select jsonb_build_object(
    'today',current_date,'eligible',internal_contas.ead_expiration_eligible($1),
    'firstDay',internal_contas.ead_expiration_first_day('2026-09-10','{}'),
    'receipt',(select to_jsonb(c) from public.contas_receber c where id=$1)) value`,[a.receivableId])));
  assert.equal(canceledClaim.receivableId,a.receivableId);
  await db.exec('begin');await finish(canceledClaim,'REVIEW_REQUIRED',null,null,null,'REMOTE_QUERY_ERROR');
  await role('authenticated');const bankReviewList=await scalar('select public.ead_list_payment_reviews_secure($1) value',[polo]);
  const bankJobReview=bankReviewList.find(r=>r.id===canceledClaim.jobId);
  assert.equal(bankJobReview.reason,'EXPIRATION_REVIEW');assert.equal(bankJobReview.amountKind,'EXPECTED');
  assert.equal(bankJobReview.amount,99.9);assert.equal(bankJobReview.paymentDate,null,'A failed bank query never becomes received revenue');
  assert.deepEqual(await scalar('select public.ead_list_payment_reviews_secure($1) value',['00000000-0000-0000-0000-000000000002']),[]);
  await db.exec('savepoint anonymous_review');await role('anon',null);
  await assert.rejects(()=>scalar('select public.ead_list_payment_reviews_secure($1) value',[polo]),/Autenticação/);
  await db.exec('rollback to anonymous_review');await db.exec('rollback');
  await db.exec('begin');await finish(canceledClaim,'RETRY',null,null,null,'WAITING_COMPENSATION');
  await db.query('update public.banese_ead_checkout_expiration_jobs set next_attempt_at=now() where id=$1',[canceledClaim.jobId]);
  const processing=await claim('ACTION');assert.equal(processing.mode,'VERIFY','Detected processing before any PUT stays GET-only');
  await db.exec('savepoint no_repeat_put');await assert.rejects(()=>start(processing),/Lease|intenção/);
  await db.exec('rollback to no_repeat_put');await db.exec('rollback');
  await start(canceledClaim);await finish(canceledClaim,'CANCELED','CANCELED',5,0);
  assert.equal(await scalar('select status value from public.matriculas where id=$1',[a.matriculaId]),'PENDENTE','Expiration preserves academic enrollment');
  const aOld=await scalar('select to_jsonb(c) value from public.contas_receber c where id=$1',[a.receivableId]);
  const b=await prepare(1,102);assert.equal(b.action,'CREATE');assert.notEqual(b.receivableId,a.receivableId);
  assert.equal(b.matriculaId,a.matriculaId);assert.notEqual(b.inscricaoId,a.inscricaoId);
  await issue(b,2);
  assert.deepEqual(await scalar('select to_jsonb(c) value from public.contas_receber c where id=$1',[a.receivableId]),aOld,'Rebuy preserves original title');
  await db.query('update public.banese_ead_checkout_expiration_jobs set next_attempt_at=now(),observe_until=now()-interval \'30 days\' where id=$1',[canceledClaim.jobId]);
  for(const badEvidence of [{totalAmountCents:9989},{totalAmountCents:9991},{paymentCount:2},
    {settlementMethod:'MISTO'},{paymentDate:'2026-11-01'},{paymentDate:'2026-02-30'},
    {lastPaymentDate:'2026-12-30'},{paymentCount:null}]) {
    await db.exec('begin');const badClaim=await claim('OBSERVE');const bad=await recover(badClaim,badEvidence);
    assert.equal(bad.paid,false,JSON.stringify(badEvidence));assert.equal(bad.state,'REVIEW_REQUIRED');assert.ok(bad.reviewId);
    if(badEvidence.totalAmountCents===9989) {
      await role('authenticated');const visible=await scalar('select public.ead_list_payment_reviews_secure($1) value',[polo]);
      assert.equal(visible.filter(r=>r.receivableId===a.receivableId).length,1,'Job and concrete payment review never duplicate the same open case');
      assert.equal(visible[0].amount,99.89);assert.equal(visible[0].amountKind,'BANK_OBSERVED');
      assert.equal(visible[0].paymentDate,null,'Observed amount does not invent a canonical payment date');
    }
    assert.equal(await scalar('select status value from public.contas_receber where id=$1',[a.receivableId]),'CANCELADO');
    await db.exec('rollback');
  }
  const observation=await claim('OBSERVE');assert.equal(observation.attemptId,a.attemptId,'Observation continues past 14 days');
  const recovered=await recover(observation);assert.equal(recovered.state,'PAID');assert.equal(recovered.paid,true);
  assert.deepEqual(await recover(observation),recovered,'Same bank observation is idempotent');
  await assert.rejects(()=>recover(observation,{totalAmountCents:9991}),/Replay bancário/,'Same fingerprint cannot conceal changed payload');
  await assert.rejects(()=>recover(observation,{evidenceFingerprint:'b'.repeat(64)}),/Lease/);
  assert.equal(await scalar('select status value from public.matriculas where id=$1',[a.matriculaId]),'ATIVO');
  assert.equal(await scalar('select state value from public.ead_checkout_attempts where id=$1',[b.attemptId]),'PAYMENT_RECOVERY_FENCED');
  assert.equal(await scalar('select internal_contas.ead_checkout_is_optional($1) value',[b.receivableId]),true,'Activated academic enrollment does not turn redundant purchase into debt');
  assert.equal(await scalar("select count(*) value from internal_contas.caixa_receivables_position_rows($1,'2026-09-01','2026-09-30')",[polo]),0,'Historical September cutoff has no ghost debt after October payment');
  await assert.rejects(()=>scalar('select public.ead_validate_checkout_attempt_for_issuance($1,$2,$3) value',[b.attemptId,b.receivableId,b.creationToken]),/Emissão/);
  await assert.rejects(()=>paid(b),/aguarda cancelamento/,'Ordinary settlement cannot bypass the recovery fence');
  const duplicatePending=await claim('ACTION');assert.equal(duplicatePending.cancelReason,'DUPLICATE_PENDING');
  const duplicate=await recover(duplicatePending,{evidenceFingerprint:'c'.repeat(64)});
  assert.equal(duplicate.state,'PAID_REVIEW');assert.ok(duplicate.reviewId);
  assert.equal(await scalar('select count(*) value from public.contas_receber where matricula_id=$1 and status=\'PAGO\'',[a.matriculaId]),2,'Two actual payments stay two real receipts');
  assert.equal(await scalar('select count(*) value from public.matriculas where aluno_id=$1',[id(1)]),1,'Access stays one enrollment');
  await role('authenticated');
  const reviews=await scalar('select public.ead_list_payment_reviews_secure($1) value',[polo]);assert.ok(reviews.find(r=>r.id===duplicate.reviewId));
  assert.deepEqual(await scalar('select public.ead_list_refund_candidates_secure($1) value',[duplicate.reviewId]),[]);
  await db.query(`insert into public.despesas_lancamentos(id,polo_id,fornecedor_id,status,valor_pago,data_pagamento,
    descricao,anexo_bucket,anexo_path) values($1,$2,$3,'PAGO',99.9,'2026-10-04','Devolução EAD','documentos','qa-refund.pdf')`,[id(500),polo,id(1)]);
  const resolution=()=>scalar('select public.ead_resolve_payment_review_secure($1,$2,$3,$4,$5,$6) value',
    [duplicate.reviewId,id(501),'LINK_CONFIRMED_REFUND',id(500),'documentos/qa-refund.pdf','Devolução comprovada']);
  assert.equal((await resolution()).state,'RESOLVED');assert.equal((await resolution()).refundExpenseId,id(500));
  assert.equal(await scalar("select count(*) value from public.sistema_eventos where entidade='ead_payment_reviews'"),1,'Resolution audit is idempotent');
  await db.exec('update test_caixa.access_state set global_allowed=false,scoped_allowed=false');
  await assert.rejects(resolution,/scope denied/,'Replay rechecks actor scope');
  await assert.rejects(()=>prepare(1,103),/Integração/,'Authenticated cannot create bank attempts directly');
  await db.exec('update test_caixa.access_state set global_allowed=true,scoped_allowed=true');
  await assert.rejects(()=>scalar('select public.ead_get_student_checkout_states($1) value',[id(2)]),/outro aluno/);
  assert.equal((await scalar('select public.ead_get_student_checkout_states($1) value',[id(1)]))[0].canPay,false);
  await role('service_role');await newStudent(4);const old4=await prepare(4,104);await issue(old4,4);
  const c4=await claim('ACTION');await start(c4);await finish(c4,'CANCELED','CANCELED',5,0);
  const new4=await prepare(4,114);await issue(new4,14);await paid(new4);
  await db.query('update public.banese_ead_checkout_expiration_jobs set next_attempt_at=now() where id=$1',[c4.jobId]);
  const late4=await claim('OBSERVE');assert.equal((await recover(late4,{evidenceFingerprint:'d'.repeat(64)})).state,'PAID_REVIEW','Old payment arriving after new paid order produces a visible refund review');
  await newStudent(5);const old5=await prepare(5,105);await issue(old5,5);
  const c5=await claim('ACTION');await start(c5);await finish(c5,'CANCELED','CANCELED',5,0);
  const new5=await prepare(5,115,99.9,'2026-12-31');
  await scalar('select public.ead_validate_checkout_attempt_for_issuance($1,$2,$3) value',[new5.attemptId,new5.receivableId,new5.creationToken]);
  await db.query('update public.banese_ead_checkout_expiration_jobs set next_attempt_at=now() where id=$1',[c5.jobId]);
  const late5=await claim('OBSERVE');await recover(late5,{evidenceFingerprint:'e'.repeat(64)});
  await assert.rejects(()=>scalar('select public.ead_validate_checkout_attempt_for_issuance($1,$2,$3) value',[new5.attemptId,new5.receivableId,new5.creationToken]),/Emissão/);
  assert.equal((await issue(new5,15,'2026-12-31',false)).state,'PAYMENT_RECOVERY_FENCED','An already dispatched title still binds to the same fenced attempt');
  await db.query("insert into public.ead_aluno_progresso(id,aluno_id,curso_id,started_at,progress) values($1,$2,$3,now(),'{\"percent\":1}')",[id(505),id(5),ead]);
  const cleanup5=await claim('ACTION');assert.equal(cleanup5.receivableId,new5.receivableId);
  assert.equal(cleanup5.cancelReason,'DUPLICATE_PENDING','Paid old order cancels the redundant title without waiting until its future due date');
  await start(cleanup5);await finish(cleanup5,'CANCELED','CANCELED',5,0);
  assert.equal(await scalar('select status value from public.matriculas where id=$1',[new5.matriculaId]),'ATIVO','Canceling redundant title preserves access and progress from original payment');
  await newStudent(6);await db.query("insert into public.matriculas(id,aluno_id,turma_id,status) values($1,$2,$3,'PENDENTE')",[id(600),id(6),turma]);
  await db.query("insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo) values($1,$2,'ATIVO','PENDENTE')",[id(601),id(600)]);
  assert.equal((await prepare(6,106)).action,'REVIEW','Known prior academic activity cannot be relabeled as an optional purchase');
  await db.query("insert into public.matriculas(id,aluno_id,turma_id,status) values($1,$2,$3,'ATIVO')",[id(700),id(5),'00000000-0000-0000-0000-000000000021']);
  const otherCourseBefore=await scalar('select to_jsonb(m) value from public.matriculas m where id=$1',[id(700)]);
  assert.equal((await prepare(5,125)).action,'ALREADY_PAID');
  assert.deepEqual(await scalar('select to_jsonb(m) value from public.matriculas m where id=$1',[id(700)]),otherCourseBefore,'Checkout never resets other academic courses');
  console.log('PASS: attempt identity, guarded expiration, rebuy, late payment, idempotency, concurrent fence, duplicate receipt, scoped refund and historical cutoff.');
} catch(error) {console.error(activeSource,error.message,error.where||'',error.detail||'',
  error.query?.slice(Math.max(0,Number(error.position)-150),Number(error.position)+150));process.exitCode=1;}
finally {await db.close();}
