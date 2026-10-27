import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fee=id(1),mat=id(2),operation=id(3),request=id(4),cycle=id(5),polo=id(6),turma=id(7),student=id(8);
const manifest='a'.repeat(64);
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m);};
const read=(p:string)=>Deno.readTextFile(new URL(p,import.meta.url));
const migrations=['20261027223737_service_fee_replacement_registry.sql',
 '20261027223740_service_fee_replacement_transition.sql','20261027223742_service_fee_replacement_result.sql',
 '20261027225916_service_fee_replacement_null_lease.sql'];

Deno.test('replacement executes actual PostgreSQL guards through cancellation, reservation and POST claim',async t=>{
 const db=new PGlite();
 const call=async(name:string,args:unknown[]=[]) => (await db.query<{v:Record<string,unknown>}>(
  `select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;
 try {
  for(const name of ['schema','scope','guards','fence','claim']) {
   try{await db.exec(await read(`./fixtures/service-fee-replacement-${name}.sql`));}
   catch(e){throw new Error('fixture '+name+': '+(e as Error).message,{cause:e});}
  }
  // Unrelated legacy bypasses are closed in this isolated fixture.
  for(const [name,args] of [
   ['internal_academic.rejected_fee_reset_transition_valid','public.contas_receber,public.contas_receber'],
   ['internal_financial_correction.reset_transition_valid','public.contas_receber,public.contas_receber'],
   ['internal_academic.technical_manual_due_date_correction_bypass_valid','uuid'],
   ['internal_academic.technical_manual_banese_reissue_bypass_valid','uuid'],
   ['public.banese_ead_replacement_bypass_valid','uuid'],
   ['internal_academic.technical_imported_c1_receivable_is_local_c2','uuid,uuid'],
  ]) await db.exec(`create function ${name}(${args}) returns boolean language sql as $$select false$$;`);
  await db.exec(`create function internal_academic.technical_manual_banese_expected_terms(r public.contas_receber)
   returns jsonb language sql as $$select r.gateway_financial_terms$$;`);
  await db.exec(`create function internal_academic.technical_manual_banese_receivable_complete(r public.contas_receber)
   returns boolean language sql as $$select r.gateway_submission_status='API_REGISTERED'$$;
   insert into public.matriculas(id,turma_id,aluno_id,status) values('${mat}','${turma}','${student}','ATIVO');
   insert into public.turmas(id,polo_id) values('${turma}','${polo}');
   insert into public.contas_receber(id,matricula_id,turma_id,polo_id,cliente_id,tipo_lancamento,valor,data_vencimento,
    forma_pagamento,gateway_payment_method,gateway_provider,gateway_environment,gateway_issuer_polo_id,
    gateway_status,gateway_submission_channel,gateway_submission_status,gateway_creation_token,gateway_boleto_nosso_numero,
    gateway_boleto_convenio,gateway_boleto_agencia,regra_financeira_tecnica_snapshot,gateway_financial_terms,updated_at,status)
   values('${fee}','${mat}','${turma}','${polo}','${student}','REMATRICULA',100,'2026-10-30',
    'BOLETO','BOLETO','banese_card','production','${polo}','CREATING','API','API_AMBIGUOUS','${request}',
    '000099001','12345','033','{"versao":2}','{"nominalAmount":100,"dueDate":"2026-10-30"}',clock_timestamp(),'PENDENTE');
   insert into public.contas_receber(id,matricula_id,turma_id,tipo_lancamento,gateway_submission_status)
   select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${mat}','${turma}','PARCELA','API_REGISTERED' from generate_series(10,21)n;
   insert into internal_academic.technical_manual_cycle_runs(matricula_id,turma_id,cycle_number,request_id,item_count,receivable_ids,state)
   select '${mat}','${turma}',2,'${cycle}',13,array_agg(id order by id),'LOCAL_CREATED' from public.contas_receber;
   insert into internal_academic.technical_manual_receivable_issuance_authorizations(receivable_id,matricula_id,turma_id,cycle_number,request_id)
   values('${fee}','${mat}','${turma}',2,'${id(9)}');
   insert into internal_academic.technical_rejected_fee_corrections(id,receivable_id,matricula_id,cycle_number,cycle_request_id,
    corrected_due_date,state,new_request_id,source_receivable,source_fingerprint,source_run,source_authorization,siblings_hash,
    corrected_terms,manifest_hash,absence_evidence,absence_hash)
   select '${operation}',r.id,'${mat}',2,'${cycle}','2026-10-30','CONSENTED','${request}',
    to_jsonb(r)||'{"data_vencimento":"2026-10-18"}',
    internal_academic.technical_manual_receivable_issuance_fingerprint(jsonb_populate_record(null::public.contas_receber,
      to_jsonb(r)||'{"data_vencimento":"2026-10-18"}')),
    to_jsonb(run),to_jsonb(a),internal_academic.rejected_fee_siblings_hash(run,r.id),r.gateway_financial_terms,
    '${manifest}','{}',internal_academic.rejected_fee_sha256('{}')
   from public.contas_receber r cross join internal_academic.technical_manual_cycle_runs run
    cross join internal_academic.technical_manual_receivable_issuance_authorizations a where r.id='${fee}';
   insert into internal_academic.rejected_fee_service_capabilities(operation_id,manifest_hash,receivable_id,request_id,actor_kind,
    prepared_receivable,source_authorization,source_run,siblings_hash,first_claimed_at,fingerprint)
   select o.id,o.manifest_hash,r.id,o.new_request_id,'SYSTEM',to_jsonb(r),o.source_authorization,o.source_run,o.siblings_hash,
    clock_timestamp()-interval '1 hour',internal_academic.technical_manual_receivable_issuance_fingerprint(r)
   from internal_academic.technical_rejected_fee_corrections o join public.contas_receber r on r.id=o.receivable_id;`);
  await db.exec('alter table internal_academic.rejected_fee_service_capabilities add primary key(operation_id); alter table public.contas_receber add primary key(id);');
  for(const file of migrations) {
   try{await db.exec(await read('../migrations/'+file));}
   catch(e){
    const detail=e as Error & {where?:string;internalQuery?:string;internalPosition?:string;position?:string};
    throw new Error(file+': '+detail.message+' '+JSON.stringify({where:detail.where,query:detail.internalQuery,position:detail.internalPosition||detail.position}),{cause:e});
   }
  }
  await db.exec(`create trigger a0_identity before update on public.contas_receber for each row
    execute function internal_academic.guard_rejected_fee_claim_identity();
   create trigger enforce_fence before update on public.contas_receber for each row
    execute function public.enforce_receivable_gateway_submission_fence();
   create trigger guard_first_claim before update on public.contas_receber for each row
    execute function internal_academic.guard_manual_technical_receivable_first_bank_claim();`);
  let lease='';
  const reject=async(fn:()=>Promise<unknown>)=>{let failed=false;try{await fn();}catch{failed=true;}assert(failed,'Must reject unsafe action');};
  const baseline=JSON.stringify((await db.query(`select to_jsonb(a) a,to_jsonb(run) run from
   internal_academic.technical_manual_receivable_issuance_authorizations a cross join internal_academic.technical_manual_cycle_runs run`)).rows);
  await t.step('explicit approval and bounded claim',async()=>{
   assert((await call('internal_academic.approve_service_fee_replacement',[operation,manifest,'synthetic-specific-user-approval'])).approved,'Approval');
   await reject(()=>call('public.mark_service_fee_cancel_intent_service',[operation,manifest,null]));
   const claim=await call('public.claim_service_fee_replacement_service',[operation,manifest]);lease=String(claim.leaseToken);
   assert(claim.recoveryOnly===false && claim.state==='APPROVED','Initial cancellation only');
   await reject(()=>call('public.claim_service_fee_replacement_service',[operation,manifest]));
  });
  await t.step('identity cannot reset before confirmed cancellation',()=>reject(()=>db.query(
   'update public.contas_receber set gateway_boleto_nosso_numero=null where id=$1',[fee])));
  await t.step('non-canceled proof cannot reset',()=>reject(()=>call('public.confirm_service_fee_canceled_service',
   [operation,manifest,lease,{checkedAt:new Date().toISOString(),remoteStatus:'PENDING'}])));
  await t.step('intent and fresh canceled GET reset only bank identity',async()=>{
   await call('public.mark_service_fee_cancel_intent_service',[operation,manifest,lease]);
   const prepared=await call('public.confirm_service_fee_canceled_service',[operation,manifest,lease,{
    method:'GET_AFTER_CANCEL',oldNumber:'000099001',convenio:'12345',remoteStatus:'CANCELED',situationCode:5,
    paid:false,paymentCount:0,checkedAt:new Date().toISOString(),responseHash:'b'.repeat(64)}]);
   assert(prepared.ready===true,'Confirmed reset');
   const r=(await db.query<Record<string,unknown>>('select * from public.contas_receber where id=$1',[fee])).rows[0];
   assert(r.gateway_boleto_nosso_numero===null && r.gateway_submission_status===null && r.gateway_creation_token===request,'Keep same owned obligation');
  });
  await t.step('old canceled number cannot be reused',()=>reject(()=>db.query(
   'update public.contas_receber set gateway_boleto_nosso_numero=$2 where id=$1',[fee,'000099001'])));
  await t.step('released NULL lease cannot reserve a replacement number',async()=>{
   await db.exec('begin');
   await call('public.fail_service_fee_replacement_service',[operation,manifest,lease]);
   await reject(()=>db.query('update public.contas_receber set gateway_boleto_nosso_numero=$2 where id=$1',[fee,'000099002']));
   await db.exec('rollback');
  });
  await t.step('one fresh reservation and normal API intent pass actual guards',async()=>{
   try{await db.query('update public.contas_receber set gateway_boleto_nosso_numero=$2 where id=$1',[fee,'000099002']);}
   catch(e){throw new Error('reserve: '+(e as Error).message,{cause:e});}
   try{await db.query("update public.contas_receber set gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1",[fee]);}
   catch(e){throw new Error('post intent: '+(e as Error).message,{cause:e});}
   const policy=await call('public.rejected_fee_bank_policy_service',[fee,request]);
   assert(policy.nossoNumero==='000099002' && policy.allowNewPost===true,'New exact preflight identity');
   await reject(()=>db.query('update public.contas_receber set gateway_boleto_nosso_numero=$2 where id=$1',[fee,'000099003']));
  });
  await t.step('original authorization, run and twelve installments remain unchanged',async()=>{
   const after=JSON.stringify((await db.query(`select to_jsonb(a) a,to_jsonb(run) run from
    internal_academic.technical_manual_receivable_issuance_authorizations a cross join internal_academic.technical_manual_cycle_runs run`)).rows);
   assert(after===baseline,'Immutable original consent and run');
   assert((await db.query<{n:number}>("select count(*) n from public.contas_receber where tipo_lancamento='PARCELA' and gateway_submission_status='API_REGISTERED'")).rows[0].n===12,'Twelve intact');
  });
  await t.step('first official result is immutable and retries are GET-only',async()=>{
   const result={bankSlipOurNumber:'000099002',remotePaymentId:'000099002',pixPayload:'synthetic-test-only',pixEncodedImage:'synthetic-test-only'};
   assert((await call('public.stage_service_fee_replacement_result_service',[operation,manifest,lease,result])).stored===true,'Durable result');
   await reject(()=>call('public.stage_service_fee_replacement_result_service',[operation,manifest,lease,{...result,pixPayload:'changed'}]));
   await call('public.fail_service_fee_replacement_service',[operation,manifest,lease]);
   await reject(()=>call('public.stage_service_fee_replacement_result_service',[operation,manifest,lease,result]));
   const retry=await call('public.claim_service_fee_replacement_service',[operation,manifest]);
   assert(retry.recoveryOnly===true && retry.newNumber==='000099002','No second reservation or POST');
   const stored=retry.officialResult as Record<string,unknown>;
   assert(Object.entries(result).every(([key,value])=>stored[key]===value),'Preserve original result');
  });
  await t.step('private approval archive cannot be changed directly or exposed to client roles',async()=>{
   await reject(()=>db.exec("update internal_academic.service_fee_replacements set old_number='000099004'"));
   const grants=await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','internal_academic.service_fee_replacements','SELECT') allowed");
   assert(grants.rows[0].allowed===false,'No client access to original bank response');
  });
 }finally{await db.close();}
});
