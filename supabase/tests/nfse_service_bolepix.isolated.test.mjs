import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installServiceBolepixScheduler,prepareServiceBolepix } from './nfse_service_bolepix.fixture.mjs';
import { definition,id,scope } from './nfse_service_receivables.fixture.mjs';
const modulePath=process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite }=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
test('durable service BolePix isolates fiscal principal, bank intent and atomic proof',async t=>{
  const db=new PGlite();const value=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  const call=(name,args=[])=>value(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
  let job,material,title;
  try {
    await prepareServiceBolepix(db);
    const plan={installments:1,firstDueDate:'2026-11-30',categoryId:id(40),monthlyInterestPercent:0,
      penaltyPercent:0,discountType:'FIXO',discountValue:0,discountDaysBeforeDue:0,periodicity:'MENSAL_CALENDARIO',issueBolePix:true};
    const preview=(await call('preview_nfse_service_financial_plan_secure',[...Object.values(scope),id(20),'20000.00','Descrição fiscal',plan])).data;
    const saved=await call('save_nfse_partner_service_secure',[...Object.values(scope),id(500),{
      ...definition,amount:'20000.00',serviceDescription:'Descrição fiscal',financialPlan:preview.financialPlan }]);
    await t.test('explicit BolePix is enqueued in the same authorization transaction and disabled by default',async()=>{
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs'),0);
      await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,authorized_xml)
        VALUES($1,$2,'PRODUCAO','PROCESSING',$3,'{"number":"9"}',$4)`,[id(302),id(1),
        {source:{kind:'PARTNER_SERVICE',id:saved.data.id}},
        '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>999</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Descrição fiscal autorizada</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>']);
      await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(302)}';SET test.role='service_role'`);
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs'),1);
      assert.equal(await call('claim_nfse_service_bolepix_job_internal'),null);
      await db.exec('UPDATE private.nfse_service_bolepix_control SET enabled=true');
      job=await call('claim_nfse_service_bolepix_job_internal');
      assert.equal(await call('claim_nfse_service_bolepix_job_internal'),null);
      title=job.receivableId;
    });
    await t.test('current Receber permission and exact fiscal/financial intent precede preparation',async()=>{
      await db.exec("SET test.receber='false'");
      await assert.rejects(call('get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken]),e=>e.code==='42501');
      assert.equal(await value('SELECT gateway_creation_token value FROM public.contas_receber WHERE id=$1',[title]),null);
      await db.exec("SET test.receber='true'");
      material=await call('get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken]);
      assert.equal(material.action,'CREATE'); assert.equal(material.fiscalNumber,'999');
      assert.equal(material.fiscalDescription,'Descrição fiscal autorizada');
      assert.equal(material.receivable.gateway_creation_token,job.leaseToken);
      await assert.rejects(call('get_nfse_service_bolepix_material_internal',[job.jobId,id(999)]),e=>e.code==='40001');
      await db.query("UPDATE public.contas_receber SET data_vencimento='2026-12-01' WHERE id=$1",[title]);
      await assert.rejects(call('get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken]),e=>e.code==='42501');
      await db.query("UPDATE public.contas_receber SET data_vencimento='2026-11-30' WHERE id=$1",[title]);
    });
    await t.test('canonical adapter marker reauthorizes immediately before POST; ambiguity is permanently GET-only',async()=>{
      await db.query(`UPDATE public.contas_receber SET gateway_boleto_nosso_numero='000004681',gateway_boleto_convenio='123',
        gateway_boleto_agencia='033' WHERE id=$1`,[title]);
      const stale=job;
      await db.exec("UPDATE private.nfse_service_bolepix_jobs SET lease_until=now()-interval '1 second'");
      job=await call('claim_nfse_service_bolepix_job_internal');
      await assert.rejects(call('claim_banese_api_submission_attempt',[
        title,'production','123','033','000004681',20000,'2026-11-30',stale.leaseToken]),e=>e.code==='42501');
      material=await call('get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken]);
      const args=[title,'production','123','033','000004681',20000,'2026-11-30',job.leaseToken];
      await db.exec("SET test.receber='false'");
      await assert.rejects(call('claim_banese_api_submission_attempt',args),e=>e.code==='42501');
      await db.exec("SET test.receber='true'");
      assert.equal(await call('claim_banese_api_submission_attempt',args),true);
      assert.equal((await call('get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken])).action,'GET');
      await assert.rejects(call('claim_banese_api_submission_attempt',args));
      const apiAttempt=job.leaseToken,oldConsumer=job;
      await db.exec("UPDATE private.nfse_service_bolepix_jobs SET lease_until=now()-interval '1 second'");
      job=await call('claim_nfse_service_bolepix_job_internal');
      material=await call('get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken]);
      assert.equal(material.action,'GET');assert.equal(material.receivable.gateway_creation_token,apiAttempt);
      await assert.rejects(call('get_nfse_service_bolepix_material_internal',[oldConsumer.jobId,oldConsumer.leaseToken]),e=>e.code==='40001');
      const evidence={request:{NossoNumero:'000004681',ValorNominal:20000,DataVencimento:'2026-11-30'},
        creationResponse:{Id:'original-accepted-post'},pixPayload:null,pixEncodedImage:null};
      await call('preserve_nfse_service_bolepix_creation_internal',[job.jobId,apiAttempt,evidence]);
      await call('preserve_nfse_service_bolepix_creation_internal',[job.jobId,apiAttempt,evidence]);
      await assert.rejects(call('preserve_nfse_service_bolepix_creation_internal',[job.jobId,job.leaseToken,evidence]),e=>e.code==='40001');
      await assert.rejects(call('preserve_nfse_service_bolepix_creation_internal',[job.jobId,apiAttempt,
        {...evidence,creationResponse:{Id:'replacement'}}]),e=>e.code==='40001');
    });
    await t.test('one atomic transaction preserves original POST, pairs Pix, and cannot persist foreign or paid evidence',async()=>{
      const result={providerCode:'banese_card',remoteStatus:'PENDING',remotePaymentId:'000004681',issuerPoloId:id(1),
        bankSlipOurNumber:'000004681',bankSlipDigitableLine:'04793303180064900000704681047223515390002000000',
        bankSlipBarcode:'04795153900020000003303100649000000468104722',pixPayload:null,pixEncodedImage:null,
        financialTerms:material.receivable.gateway_financial_terms,rawPayload:{request:{NossoNumero:'000004681'},response:{fixture:'POST'}}};
      await assert.rejects(call('complete_nfse_service_bolepix_job_internal',[job.jobId,job.leaseToken,{...result,remotePaymentId:'999999999'}]),e=>e.code==='40001');
      assert.equal(await value('SELECT count(*)::int value FROM public.payment_gateway_transactions'),0);
      assert.equal((await call('complete_nfse_service_bolepix_job_internal',[job.jobId,job.leaseToken,result])).complete,false);
      assert.equal(await value('SELECT count(*)::int value FROM public.payment_gateway_transactions'),1);
      await db.exec("UPDATE private.nfse_service_bolepix_jobs SET next_check_at=now()-interval '1 second'");
      const old=job;job=await call('claim_nfse_service_bolepix_job_internal');
      assert.notEqual(job.leaseToken,old.leaseToken);
      await assert.rejects(call('complete_nfse_service_bolepix_job_internal',[old.jobId,old.leaseToken,result]),e=>e.code==='40001');
      const recovered={...result,pixPayload:'synthetic-paired-proof',pixEncodedImage:'synthetic-image-proof',rawPayload:{response:{fixture:'GET'}}};
      assert.equal((await call('complete_nfse_service_bolepix_job_internal',[job.jobId,job.leaseToken,recovered])).complete,true);
      const transaction=await value('SELECT to_jsonb(t) value FROM public.payment_gateway_transactions t');
      assert.equal(transaction.raw_payload.response.fixture,'POST');assert.equal(transaction.raw_payload.nfseServiceLastQuery.response.fixture,'GET');
      assert.equal(transaction.raw_payload.creationResponse.Id,'original-accepted-post');
      assert.equal(await value('SELECT count(*)::int value FROM public.payment_gateway_transactions'),1);
      assert.equal(await value('SELECT state value FROM private.nfse_service_bolepix_jobs'),'DONE');
    });
    await t.test('transport backoff is bounded and stale lease cannot finish a reclaimed job',async()=>{
      await db.exec("UPDATE private.nfse_service_bolepix_jobs SET state='READY',created_at=now()-interval '8 hours',next_check_at=now()-interval '1 second'");
      job=await call('claim_nfse_service_bolepix_job_internal');
      await call('fail_nfse_service_bolepix_job_internal',[job.jobId,job.leaseToken,true,'TRANSPORT']);
      assert.equal(await value("SELECT next_check_at>now()+interval '4 minutes' value FROM private.nfse_service_bolepix_jobs"),true);
      assert.equal(await call('claim_nfse_service_bolepix_job_internal'),null);
      await db.exec("UPDATE private.nfse_service_bolepix_jobs SET created_at=now()-interval '8 days',next_check_at=now()-interval '1 second'");
      const old=job;job=await call('claim_nfse_service_bolepix_job_internal');
      await assert.rejects(call('fail_nfse_service_bolepix_job_internal',[old.jobId,old.leaseToken,true,'TRANSPORT']),e=>e.code==='40001');
      await call('fail_nfse_service_bolepix_job_internal',[job.jobId,job.leaseToken,true,'TRANSPORT']);
      assert.equal(await value('SELECT state value FROM private.nfse_service_bolepix_jobs'),'REVIEW');
      assert.equal(await value('SELECT gateway_submission_status value FROM public.contas_receber WHERE id=$1',[title]),'API_REGISTERED');
    });
    await t.test('scheduler is independent, deduplicates repeated authorization triggers and sends only anon JWT plus worker token',async()=>{
      await installServiceBolepixScheduler(db);
      await db.exec(`BEGIN;UPDATE private.nfse_service_bolepix_jobs SET state='READY',next_check_at=now()-interval '1 second';
        SELECT private.kick_nfse_service_bolepix_worker();SELECT private.kick_nfse_service_bolepix_worker();COMMIT;`);
      assert.equal(await value('SELECT count(*)::int value FROM net.synthetic_requests'),1);
      const request=await value('SELECT to_jsonb(r) value FROM net.synthetic_requests r');
      assert.match(request.url,/\/nfse-service-bolepix-worker$/);
      assert.match(request.headers.Authorization,/^Bearer synthetic\./);
      assert.equal(request.headers['X-Banese-Worker-Token'],'x'.repeat(32));
    });
    await t.test('queue RPCs and its durable ledger are inaccessible to authenticated clients',async()=>{
      assert.equal(await value("SELECT has_table_privilege('authenticated','private.nfse_service_bolepix_jobs','SELECT') value"),false);
      assert.equal(await value("SELECT has_function_privilege('authenticated','public.claim_nfse_service_bolepix_job_internal()','EXECUTE') value"),false);
      await db.exec("SET test.role='authenticated'");
      await assert.rejects(call('claim_nfse_service_bolepix_job_internal'),e=>e.code==='42501');
    });
  } finally { await db.close(); }
});

test('three fast installments continue immediately while INSERT fan-out stays deduplicated',async()=>{
  const db=new PGlite();const value=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  const call=(name,args=[])=>value(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
  try {
    await prepareServiceBolepix(db);await installServiceBolepixScheduler(db);
    const input={installments:3,firstDueDate:'2026-11-30',categoryId:id(40),monthlyInterestPercent:0,
      penaltyPercent:0,discountType:'FIXO',discountValue:0,discountDaysBeforeDue:0,periodicity:'MENSAL_CALENDARIO',issueBolePix:true};
    const plan=(await call('preview_nfse_service_financial_plan_secure',[...Object.values(scope),id(20),'60000.00','Descrição',input])).data;
    const service=await call('save_nfse_partner_service_secure',[...Object.values(scope),id(500),
      {...definition,amount:'60000.00',serviceDescription:'Descrição',financialPlan:plan.financialPlan}]);
    await db.exec('UPDATE private.nfse_service_bolepix_control SET enabled=true');
    await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,authorized_xml)
      VALUES($1,$2,'PRODUCAO','PROCESSING',$3,'{"number":"9"}',$4)`,[id(302),id(1),
      {source:{kind:'PARTNER_SERVICE',id:service.data.id}},
      '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>9</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Descrição</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>']);
    await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(302)}';SET test.role='service_role'`);
    assert.equal(await value('SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs'),3);
    assert.equal(await value('SELECT count(*)::int value FROM net.synthetic_requests'),1,'Three INSERT triggers schedule just the first worker.');
    for(let index=0;index<3;index++){
      const job=await call('claim_nfse_service_bolepix_job_internal');assert(job);
      // Simulate canonical completion, exercising the actual claim and state-transition trigger, without bank I/O.
      await db.query("UPDATE private.nfse_service_bolepix_jobs SET state='DONE',lease_token=NULL,lease_until=NULL WHERE id=$1",[job.jobId]);
      assert.equal(await value('SELECT count(*)::int value FROM net.synthetic_requests'),Math.min(3,index+2));
    }
    assert.equal(await call('claim_nfse_service_bolepix_job_internal'),null);
    assert.equal(await value('SELECT count(*)::int value FROM net.synthetic_requests'),3,'Every installment is scheduled immediately, with no sleep or clock changes.');
  } finally {await db.close();}
});
