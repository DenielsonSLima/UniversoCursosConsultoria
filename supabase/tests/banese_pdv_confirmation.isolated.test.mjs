import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installFixture, migrationSource } from './banese_pdv_confirmation.fixture.mjs';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const id = uid(1);
const one = async (sql, params=[]) => (await db.query(sql,params)).rows[0];
const claim = async () => (await one('SELECT public.claim_banese_pdv_confirmation($1) AS value',[id])).value;
const prepare = async () => (await one('SELECT public.prepare_banese_reconciliation_batch_v3() AS value')).value;
const migration = migrationSource('20260927014500_banese_pdv_confirmation_budget');
let passed = 0;
async function scenario(name, run) {
  await db.exec('BEGIN');
  try { await run(); passed++; }
  catch (error) { throw new Error(name,{cause:error}); }
  finally { await db.exec('ROLLBACK'); }
}
async function seed(count=1) {
  for(let i=1;i<=count;i++) {
    await db.query('INSERT INTO public.contas_receber(id) VALUES($1)',[uid(i)]);
    await db.query(`INSERT INTO public.banese_reconciliation_queue(receivable_id,environment,last_result,next_check_at)
      VALUES($1,'production','PENDING',now()-interval '1 minute')`,[uid(i)]);
    await db.query(`INSERT INTO public.payment_gateway_transactions VALUES($1,'banese_card','production','BOLETO',
      '123456789','123456789','synthetic-line','synthetic-barcode','{}')`,[uid(i)]);
  }
}
async function reserved(credits,{origin='CRON',status='SUCCESS',age='10 seconds',environment='production'}={}) {
  await db.query(`INSERT INTO public.banese_reconciliation_runs(environment,mode,profile_id,target_titles,claimed,
      config_version,origin,status,started_at) VALUES($1,'AUTOMATIC',3,40,$2,1,$3,$4,now()-$5::interval)`,
    [environment,credits,origin,status,age]);
}
async function financial() {
  return (await one('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) AS rows FROM public.contas_receber r')).rows;
}
try {
  await installFixture(db);
  const signatures=['public.prepare_banese_reconciliation_batch_v3()',
    'public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)',
    'public.get_banese_reconciliation_autopilot_progress()'];
  const meta = async () => (await db.query(`SELECT to_jsonb(p)-'prosrc' AS value FROM pg_proc p
    WHERE oid=ANY($1::regprocedure[]) ORDER BY oid`,[signatures])).rows;
  const beforeMeta=await meta();
  await db.exec(`ALTER FUNCTION public.prepare_banese_reconciliation_batch_v3() SET work_mem='9MB'`);
  await assert.rejects(()=>db.exec(migration),/source drift/); await db.exec('ROLLBACK');
  await db.exec(`ALTER FUNCTION public.prepare_banese_reconciliation_batch_v3() RESET work_mem`);
  await seed(); const beforeFinancial=await financial();
  await db.exec(migration);
  assert.deepEqual(await financial(),beforeFinancial,'Migration changes no financial row');
  assert.deepEqual(await meta(),beforeMeta,'Patched functions keep OID/ACL/owner/security/config');
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal((await one(`SELECT has_function_privilege($1,'public.claim_banese_pdv_confirmation(uuid)','EXECUTE') AS ok`,[role])).ok,
      role==='service_role');
  }
  await scenario('one-title claim, same lease, duplicate serialized',async()=>{
    const before=await financial(); const first=await claim(); assert.equal(first.enabled,true);
    assert.equal((await claim()).reason,'BUSY');
    const queue=await one('SELECT state,lease_run_id FROM public.banese_reconciliation_queue WHERE receivable_id=$1',[id]);
    assert.equal(queue.state,'LEASED'); assert.equal(queue.lease_run_id,first.runId);
    assert.equal((await one('SELECT origin,claimed FROM public.banese_reconciliation_runs WHERE id=$1',[first.runId])).origin,'PDV');
    assert.deepEqual(await financial(),before);
  });
  for(const [change,reason] of [
    ["mode='PAUSED'",'PAUSED'],["state='SUSPENDED'",'SUSPENDED'],
    ["cooldown_until=now()+interval '1 hour'",'COOLDOWN'],
    ["mode='MANUAL',test_expires_at=now()-interval '1 second'",'COOLDOWN']]) {
    await scenario(`config ${change}`,async()=>{
      await db.exec(`UPDATE public.banese_reconciliation_config SET ${change}`);
      assert.equal((await claim()).reason,reason);
      assert.equal((await one('SELECT count(*)::int AS n FROM public.banese_reconciliation_runs')).n,0);
    });
  }
  for(const change of ["status='PAGO'","status='CANCELADO'","valor_pago=1","data_pagamento=current_date",
    "categoria='MENSALIDADE'","matricula_id=id","turma_id=id","origem_cronograma_id=id",
    "tipo_lancamento='PARCELA'","origem_pagamento='PROESC'","gateway_provider='asaas'",
    "gateway_environment=NULL","gateway_submission_status='API_AMBIGUOUS'","gateway_submission_channel='CNAB'",
    "gateway_financial_terms=NULL","gateway_last_error='BANESE_DISCOUNT_REMOVAL_PENDING'",
    "gateway_last_error='BANESE_IDENTITY_QUARANTINED: test'","asaas_last_error='BANESE_IDENTITY_QUARANTINED: test'"]) {
    await scenario(`scope ${change}`,async()=>{
      await db.exec(`UPDATE public.contas_receber SET ${change}`);
      assert.equal((await claim()).reason,'INELIGIBLE');
    });
  }
  for (const state of ['DONE','QUARANTINED','REPLACEMENT_FENCED']) {
    await scenario(`queue ${state}`,async()=>{
      await db.query('UPDATE public.banese_reconciliation_queue SET state=$1',[state]);
      assert.equal((await claim()).reason,'INELIGIBLE');
    });
  }
  for(const state of ['AUTHORIZED','FENCED']) {
    await scenario(`cancellation ${state}`,async()=>{
      await db.query('INSERT INTO public.banese_pdv_cancellation_jobs VALUES($1,$2)',[id,state]);
      assert.equal((await claim()).reason,'INELIGIBLE');
    });
  }
  await scenario('loan excluded',async()=>{
    await db.query('INSERT INTO public.emprestimos_financeiros VALUES($1)',[id]);
    assert.equal((await claim()).reason,'INELIGIBLE');
  });
  await scenario('bank identity mismatch',async()=>{
    await db.exec("UPDATE public.payment_gateway_transactions SET remote_payment_id='987654321'");
    assert.equal((await claim()).reason,'INELIGIBLE');
  });
  await scenario('15 second cadence despite ordinary five-minute cooldown',async()=>{
    await db.exec("UPDATE public.banese_reconciliation_queue SET last_checked_at=now(),next_check_at=now()+interval '5 minutes'");
    const waiting=await claim(); assert.equal(waiting.reason,'INTERVAL'); assert.equal(waiting.retryAfterMs,15000);
    await db.exec("UPDATE public.banese_reconciliation_queue SET last_checked_at=now()-interval '15 seconds'");
    assert.equal((await claim()).enabled,true);
  });
  for(const result of ['ERROR','THROTTLED']) {
    await scenario(`backoff ${result} preserved`,async()=>{
      await db.query("UPDATE public.banese_reconciliation_queue SET last_result=$1,next_check_at=now()+interval '20 minutes'",[result]);
      assert.equal((await claim()).reason,'COOLDOWN');
    });
  }
  await scenario('running cron blocks PDV',async()=>{
    await reserved(1,{status:'RUNNING'}); assert.equal((await claim()).reason,'BUSY');
  });
  for(const status of ['SUCCESS','FAILED','ABANDONED']) {
    await scenario(`shared budget retains ${status} reservations`,async()=>{
      await reserved(38,{status}); assert.equal((await claim()).reason,'BUDGET');
    });
  }
  await scenario('exact remaining three credits accepted',async()=>{
    await reserved(37); assert.equal((await claim()).enabled,true);
  });
  await scenario('old or other-environment reservations excluded',async()=>{
    await reserved(40,{age:'61 seconds'}); await reserved(40,{environment:'sandbox'});
    assert.equal((await claim()).enabled,true);
  });
  await scenario('normal batch discounts PDV credits and never exceeds forty',async()=>{
    await db.exec('DELETE FROM public.payment_gateway_transactions; DELETE FROM public.banese_reconciliation_queue; DELETE FROM public.contas_receber');
    await seed(45); await reserved(1,{origin:'PDV'});
    const result=await prepare(); assert.equal(result.claimed,37); assert.equal(result.items.length,37);
    assert.equal((await claim()).reason,'BUSY');
  });
  await scenario('normal batch stops at spent shared budget',async()=>{
    await reserved(40); assert.equal((await prepare()).reason,'SHARED_BUDGET');
  });
  for(const [currentOrigin,poolOrigin,expected] of [['PDV','PDV',3],['CRON','PDV',3],['CRON','CRON',4]]) {
    await scenario(`promotion ${currentOrigin} with ${poolOrigin} sample`,async()=>{
      await db.exec("UPDATE public.banese_reconciliation_config SET stable_since=now()-interval '2 hours'");
      await db.query(`INSERT INTO public.banese_reconciliation_runs(id,environment,mode,profile_id,target_titles,claimed,config_version,origin,status,started_at)
        SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'production','AUTOMATIC',3,1,1,1,'PDV','SUCCESS',now()-interval '2 minutes'
        FROM generate_series(1,400) i`);
      await db.query('UPDATE public.banese_reconciliation_runs SET origin=$1',[poolOrigin]);
      await db.query(`INSERT INTO public.banese_reconciliation_attempts(run_id,receivable_id,environment,modality,result)
        SELECT id,$1,'production','OUTROS_CREDITOS','PENDING' FROM public.banese_reconciliation_runs`,[id]);
      const c=await claim(); assert.equal(c.enabled,true);
      await db.query('UPDATE public.banese_reconciliation_runs SET origin=$1 WHERE id=$2',[currentOrigin,c.runId]);
      await db.query(`INSERT INTO public.banese_reconciliation_attempts(run_id,receivable_id,environment,modality,result)
        VALUES($1,$2,'production','OUTROS_CREDITOS','PENDING')`,[c.runId,id]);
      const progress=await one('SELECT public.get_banese_reconciliation_autopilot_progress() AS value');
      assert.equal(progress.value.validTitles,poolOrigin==='CRON'?401:currentOrigin==='CRON'?1:0);
      const f=await one('SELECT public.finish_banese_reconciliation_run($1,1,false,400) AS value',[c.runId]);
      assert.equal(f.value.status,'SUCCESS'); assert.equal(f.value.effectiveProfileId,expected);
    });
  }
  await scenario('PDV throttling still closes global circuit',async()=>{
    const c=await claim();
    await db.query(`INSERT INTO public.banese_reconciliation_attempts(run_id,receivable_id,environment,modality,result,error_class)
      VALUES($1,$2,'production','OUTROS_CREDITOS','THROTTLED','RATE_LIMIT')`,[c.runId,id]);
    await db.query('SELECT public.finish_banese_reconciliation_run($1,1,false,100)',[c.runId]);
    const config=await one('SELECT state,cooldown_until>now() AS cooldown FROM public.banese_reconciliation_config');
    assert.equal(config.state,'COOLDOWN'); assert.equal(config.cooldown,true);
  });
  console.log(`PASS: ${passed} isolated SQL scenarios, drift rollback, financial preservation, ACL and function metadata.`);
} finally { await db.close(); }
