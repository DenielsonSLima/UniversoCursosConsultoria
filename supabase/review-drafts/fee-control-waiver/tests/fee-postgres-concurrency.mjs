// Only the dedicated disposable postgres:17 CI service. No URLs, .env or user secrets.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,relative} from 'node:path';
import {nativeIntegrationSetupUrl} from './fixture-paths.mjs';
import {createFeeDatabase,inputFor,renderCandidate,guardState,protectedState,rows,scalar,q,invoke,
 actor,operation,paidLocal,settlementId,uid} from './fee-reversal-setup.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Requires GitHub Actions disposable service');
assert.equal(process.env.FEE_EPHEMERAL_POSTGRES,'synthetic-postgres-17-only');
assert.ok(process.env.RUNNER_TEMP);
const deps=resolve(process.env.FEE_PG_MODULE??'');
const rel=relative(resolve(process.env.RUNNER_TEMP),deps);
assert.ok(rel&&!rel.startsWith('..')&&!rel.startsWith('/'));
const {Client}=createRequire(import.meta.url)(deps);
const config={host:'127.0.0.1',port:5432,user:'postgres',password:'synthetic_ephemeral_ci_only',
 database:'fee_control_waiver_ci',ssl:false,connectionTimeoutMillis:10000,
 query_timeout:35000,statement_timeout:30000,lock_timeout:5000,
 application_name:'fee-control-waiver-synthetic-concurrency'};
const clients=new Set();
async function connect(database=config.database){
 assert.match(database,/^(?:postgres|fee_control_waiver_ci(?:_case_\d+)?)$/);
 const c=new Client({...config,database});await c.connect();clients.add(c);
 await c.query(`set test.jwt.role='';set test.actor='';`);return c;
}
const adapter=c=>({exec:sql=>c.query(sql),query:(sql,args)=>c.query(sql,args)});
async function execute(c,input){try{return await c.query(await renderCandidate(input));}catch(e){await c.query('rollback');throw e;}}
function pending(promise){const state={done:false};state.result=promise.then(result=>{state.done=true;return{result};},error=>{state.done=true;return{error};});return state;}
async function blocked(observer,waiter,holder,state){
 const deadline=Date.now()+4000;
 while(Date.now()<deadline){
  const [row]=await q(observer,'select wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1',[waiter.processID]);
  if(row?.wait_event_type==='Lock'&&row.blockers.includes(holder.processID))return;
  if(state.done){const r=await state.result;throw new Error(`Expected genuine cross-session wait; ${r.error?.message??'early success'}`);}
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw new Error('PostgreSQL lock barrier was not observed');
}
async function succeeds(state){const r=await state.result;if(r.error)throw r.error;return r.result;}
async function rejects(state,pattern){const r=await state.result;assert.ok(r.error);assert.match(r.error.message,pattern);}
const auth=c=>c.query(`set test.jwt.role='authenticated';set test.actor='${actor}';`);
const maintenance=c=>c.query("set test.jwt.role='';set test.actor='';");
async function consent(c,batch=uid(9400)){
 await auth(c);const p=await invoke(c,'public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 return invoke(c,'public.consent_bounded_financial_correction_secure',[operation,uid(6),batch,p.fingerprint]);
}
const count=c=>scalar(c,"select count(*)::integer value from public.receivable_manual_settlement_events where event_type='LOCAL_SETTLEMENT_REVERSED'");
async function whole(c){return {protected:await protectedState(c),receipts:await rows(c,'public.contas_receber'),ledger:await rows(c,'public.receivable_manual_settlements'),events:await rows(c,'public.receivable_manual_settlement_events'),guards:await guardState(c)};}
async function clean(c,guards){
 assert.deepEqual(await guardState(c),guards);
 assert.equal(await scalar(c,"select to_regprocedure('internal_financial_correction._control_reversal_transition(public.contas_receber,public.contas_receber)')::text value"),null);
}
const barrier=94873;
async function installBarrier(c){
 await c.query(`create function public.synthetic_pause_reversal() returns trigger language plpgsql as $$begin
  if new.event_type='LOCAL_SETTLEMENT_REVERSED' then perform pg_advisory_xact_lock(${barrier});end if;return new;end$$;
 create trigger synthetic_pause_reversal after insert on public.receivable_manual_settlement_events
 for each row execute function public.synthetic_pause_reversal();`);
}
let sequence=0;
const base=await connect();
try{
 const version=await scalar(base,"select current_setting('server_version_num')::integer value");
 assert.ok(version>=170000&&version<180000);assert.equal(await scalar(base,'select session_user value'),'postgres');
 const {loadIntegrationDatabase}=await import(nativeIntegrationSetupUrl);
 await loadIntegrationDatabase(adapter(base));
 await createFeeDatabase({db:adapter(base),proof:true});
 await base.end();clients.delete(base);
 const control=await connect('postgres');
 async function scenario(name,run){
  const database=`fee_control_waiver_ci_case_${++sequence}`;
  await control.query(`create database ${database} template fee_control_waiver_ci`);
  const group=[];
  try{
   for(let n=0;n<3;n++)group.push(await connect(database));
   assert.equal(new Set(group.map(c=>c.processID)).size,3);await run(...group);
   console.log(`PASS ${sequence}: ${name}`);
  }finally{
   for(const c of group){await c.query('rollback').catch(()=>{});await c.end();clients.delete(c);}
   await control.query(`drop database ${database}`);
  }
 }
 for(const target of ['ledger','receipt'])await scenario(`committed ${target} drift rejects waiting maintenance without erasing new evidence`,async(a,b,o)=>{
  const input=await inputFor(o),guards=await guardState(o);await a.query('begin');
  if(target==='ledger')await a.query("update public.receivable_manual_settlements set result=result||'{\"concurrentObservation\":true}' where id=$1",[settlementId]);
  else{await a.query("set local test.jwt.role='service_role'");await a.query('update public.contas_receber set valor_pago=201 where id=$1',[paidLocal]);}
  const expected=await whole(a),attempt=pending(execute(b,input));
  await blocked(o,b,a,attempt);await clean(o,guards);await a.query('commit');
  await rejects(attempt,/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/);
  assert.deepEqual(await whole(o),expected);assert.equal(await count(o),0);await clean(o,guards);
 });
 await scenario('fresh consent commits first; waiting maintenance preserves all twelve fresh keys',async(a,b,o)=>{
  const input=await inputFor(o),guards=await guardState(o);await a.query('begin');await consent(a);
  const expected=await protectedState(a),attempt=pending(execute(b,input));
  await blocked(o,b,a,attempt);await clean(o,guards);await a.query('commit');await succeeds(attempt);
  assert.deepEqual(await protectedState(o),expected);assert.equal(await count(o),1);await clean(o,guards);
 });
 await scenario('first bank claim commits first; waiting maintenance rejects in-flight work without changing consent',async(a,b,o)=>{
  await consent(a);const input=await inputFor(o),guards=await guardState(o);
  const [item]=await q(o,"select * from internal_financial_correction.items where kind='RESET_C1' and matricula_id=$1 order by receivable_id",[uid(6)]);
  await a.query('begin');await a.query("update public.contas_receber set gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1",[item.receivable_id,item.consent_request_id]);
  const expected=await whole(a),attempt=pending(execute(b,input));await blocked(o,b,a,attempt);await a.query('commit');
  await rejects(attempt,/CONTROL_C1_BANK_WORK_IN_FLIGHT/);assert.deepEqual(await whole(o),expected);await clean(o,guards);
 });
 await scenario('temporary guard remains invisible externally; a waiting authorized bank claim uses the restored guard',async(a,b,o)=>{
  await consent(a);await maintenance(a);await installBarrier(a);
  const input=await inputFor(o),guards=await guardState(o);
  const [item]=await q(o,"select * from internal_financial_correction.items where kind='RESET_C1' and matricula_id=$1 order by receivable_id",[uid(6)]);
  await a.query('begin');await a.query('select pg_advisory_xact_lock($1)',[barrier]);
  const attempt=pending(execute(b,input));await blocked(o,b,a,attempt);
  // The maintenance transaction has patched its guard and inserted its event at this point.
  await clean(o,guards);assert.equal(await count(o),0);
  assert.equal(await scalar(o,'select internal_academic.local_manual_reversal_authorized(r,r) value from public.contas_receber r where id=$1',[paidLocal]),false);
  await auth(o);const claim=pending(o.query("update public.contas_receber set gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1",[item.receivable_id,item.consent_request_id]));
  await blocked(a,o,b,claim);await a.query('commit');await succeeds(attempt);await succeeds(claim);
  await clean(a,guards);assert.equal(await count(a),1);
  assert.equal(await scalar(a,'select status value from public.contas_receber where id=$1',[paidLocal]),'CANCELADO');
  assert.equal(await scalar(a,'select gateway_creation_token value from public.contas_receber where id=$1',[item.receivable_id]),item.consent_request_id);
 });
 await scenario('two overlapping same-event attempts produce one reversal and restore identical guard ACLs',async(a,b,o)=>{
  await installBarrier(a);const input=await inputFor(a),guards=await guardState(a);
  await a.query('begin');await a.query('select pg_advisory_xact_lock($1)',[barrier]);
  const first=pending(execute(b,input));await blocked(o,b,a,first);await clean(o,guards);
  const second=pending(execute(o,input));await blocked(a,o,b,second);
  await a.query('commit');await succeeds(first);await succeeds(second);
  assert.equal(await count(a),1);await clean(a,guards);
 });
 console.log(`Verified ${sequence} real independent-session fee-control concurrency scenarios.`);
}finally{for(const c of clients)await c.end().catch(()=>{});}
