import test from 'node:test';
import assert from 'node:assert/strict';
import {setupRejectedFee,approve,absence,call,operation,oldRequest,id,actor,polo,mockedIssuance} from './rejected-fee-setup.mjs';
const rows=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const feeRow=async(db,fee)=>(await rows(db,'select to_jsonb(c) value from public.contas_receber c where id=$1',[fee]))[0].value;
const legacy=async(db,enrollment)=>(await rows(db,'select internal_academic.manual_cycle_legacy_creation_proven(r) value from internal_academic.technical_manual_cycle_runs r where matricula_id=$1',[enrollment]))[0].value;
const preparation=(db,a)=>call(db,'internal_academic.prepare_rejected_fee_correction',[operation,a.manifestHash]);
const immutable=async(db,enrollment,fee)=>rows(db,`select to_jsonb(c) value from public.contas_receber c where matricula_id=$1 and id<>$2 order by id`,[enrollment,fee]);
async function isolated(db,run) {await db.exec('begin');try{await run()}finally{await db.exec('rollback')}}
async function reject(db,run,pattern) {await db.exec('savepoint denied');try{await assert.rejects(run,pattern)}finally{await db.exec('rollback to denied; release denied')}}

test('preparo pós-COMMIT preserva13 itens/run/ledger/12mensais e arquivo; só gestor real consente nova request; só taxa é emitida no mock',async()=>{
 const {db,fee,enrollment,cycleRequest}=await setupRejectedFee();
 try {
 const prior=await feeRow(db,fee),siblings=await immutable(db,enrollment,fee);
 const runBefore=await rows(db,'select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r where matricula_id=$1',[enrollment]);
 const ledger=await rows(db,'select to_jsonb(r) value from internal_academic.technical_financial_requests r where request_id=$1',[cycleRequest]);
 await db.exec("set test.actor=''");
 const a=await approve(db,fee);const observed=await absence(db,a);await db.exec('begin');await preparation(db,a);await db.exec('commit');
 assert.equal(await legacy(db,enrollment),true);
 assert.deepEqual(await immutable(db,enrollment,fee),siblings);
 assert.deepEqual(await rows(db,'select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r where matricula_id=$1',[enrollment]),runBefore);
 assert.deepEqual(await rows(db,'select to_jsonb(r) value from internal_academic.technical_financial_requests r where request_id=$1',[cycleRequest]),ledger);
 const corrected=await feeRow(db,fee);assert.equal(corrected.data_vencimento,'2026-10-30');assert.equal(corrected.gateway_creation_token,null);
 assert.equal(corrected.gateway_boleto_nosso_numero,prior.gateway_boleto_nosso_numero);assert.equal(corrected.gateway_financial_terms.dueDate,'2026-10-30');
 assert.equal((await preparation(db,a)).replayed,true);
 assert.equal((await call(db,'public.confirm_rejected_fee_absence_service',[operation,a.manifestHash,observed.lease.leaseToken,observed.evidence])).replayed,true);
 await isolated(db,async()=>{await db.query("update public.contas_receber set valor_pago=valor,data_pagamento=current_date,status='PAGO' where matricula_id=$1 and tipo_lancamento='PARCELA' and parcela_numero=1",[enrollment]);assert.equal(await legacy(db,enrollment),true);assert.equal((await rows(db,'select internal_academic.rejected_fee_corrected_valid(c) valid from public.contas_receber c where id=$1',[fee]))[0].valid,true);});
 const archive=(await rows(db,'select * from internal_academic.technical_rejected_fee_corrections where id=$1',[operation]))[0];
 assert.deepEqual(archive.source_receivable,prior);assert.equal(archive.source_authorization.request_id,oldRequest);assert.equal(archive.consent_actor_id,null);
 assert.equal((await rows(db,"select auth.uid() actor"))[0].actor,null);
 const approvalAudit=(await rows(db,"select regra from public.historico_turma_financeira where matricula_id=$1 and evento='TAXA_REJEITADA_CORRECAO_APROVADA'",[enrollment]))[0].regra;
 assert.equal(approvalAudit.executionActorKind,'SERVICE_MAINTENANCE');assert.equal(approvalAudit.approvalReference,'synthetic-explicit-approval');
 const resolved=await call(db,'public.resolve_rejected_fee_request_service',[fee,cycleRequest]);assert.notEqual(resolved.requestId,oldRequest);
 await assert.rejects(call(db,'public.obter_progresso_ciclo_financeiro_tecnico_manual_secure',[enrollment,2]),e=>e.code==='42501');
 await db.query("select set_config('test.actor',$1,false)",[actor]);
 const preparedProgress=await call(db,'public.obter_progresso_ciclo_financeiro_tecnico_manual_secure',[enrollment,2]);
 assert.equal(preparedProgress.encontrado,true);assert.equal(preparedProgress.requestId,cycleRequest);
 assert.equal(preparedProgress.ciclo.emitidosBanese,12);assert.equal(preparedProgress.ciclo.pendentesEmissao,1);
 await assert.rejects(call(db,'public.authorize_technical_manual_receivable_issuance_secure',[fee,oldRequest]),/NEW_APPROVED_REQUEST/);
 await db.exec("set test.actor=''");await assert.rejects(call(db,'public.authorize_technical_manual_receivable_issuance_secure',[fee,resolved.requestId]),/Autenticação/);
 await db.query('insert into auth.users values($1)',[id(96004)]);
 await db.query(`insert into public.usuarios_sistema select (jsonb_populate_record(null::public.usuarios_sistema,to_jsonb(u)||jsonb_build_object('id',$1::text,'auth_user_id',$1::text))).* from public.usuarios_sistema u where auth_user_id=$2`,[id(96004),actor]);
 await db.query("select set_config('test.actor',$1,false)",[id(96004)]);
 await db.exec('begin');await call(db,'public.authorize_technical_manual_receivable_issuance_secure',[fee,resolved.requestId]);await db.exec('commit');
 const newAuth=(await rows(db,'select * from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=$1',[fee]))[0];
 assert.equal(newAuth.authorized_by,id(96004));assert.equal(newAuth.claim_count,0);
 await assert.rejects(db.query("update public.contas_receber set gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1",[fee,oldRequest]),/APPROVED_CLAIM/);
 await mockedIssuance(db,fee,resolved.requestId,99001);
 assert.equal(await legacy(db,enrollment),true);assert.deepEqual(await immutable(db,enrollment,fee),siblings);
 const progress=await call(db,'internal_academic.manual_cycle_issuance_progress',[enrollment,2]);
 assert.equal(progress.ciclo.emitidosBanese,13);assert.equal(progress.ciclo.pendentesEmissao,0);
 const scoped=await call(db,'public.obter_progresso_ciclo_financeiro_tecnico_manual_secure',[enrollment,2]);
 assert.equal(scoped.requestId,cycleRequest);assert.deepEqual(scoped.ciclo,progress.ciclo);
 assert.equal((await rows(db,'select count(*)::int n from public.contas_receber where matricula_id=$1',[enrollment]))[0].n,13);
 assert.deepEqual((await rows(db,'select source_authorization,source_receivable from internal_academic.technical_rejected_fee_corrections where id=$1',[operation]))[0],{source_authorization:archive.source_authorization,source_receivable:prior});
 } finally {await db.close()}
});

test('ausência exige lease/TTL/identidade/status/código exatos; nenhum erro altera taxa ou permite preparo',async()=>{
 const {db,fee}=await setupRejectedFee();
 try {const a=await approve(db,fee);const before=await feeRow(db,fee);
 for(const change of [{httpStatus:200},{httpStatus:404,errorCode:'NOT_FOUND'},{convenio:'999'},{nossoNumero:'000099002'},
  {environment:'sandbox'},{method:'POST'},{checkedAt:'2026-10-01T00:00:00Z'},{responseHash:null}]) {
 await isolated(db,async()=>{const lease=await call(db,'public.claim_rejected_fee_absence_service',[operation,a.manifestHash]);
 const evidence={operation:'EXACT_RESERVED_TITLE_ABSENCE',method:'GET',environment:'production',convenio:lease.convenio,nossoNumero:lease.nossoNumero,httpStatus:404,errorCode:'ERRO_BOLETO_NAO_ENCONTRADO',responseHash:'a'.repeat(64),checkedAt:new Date().toISOString(),...change};
 await reject(db,()=>call(db,'public.confirm_rejected_fee_absence_service',[operation,a.manifestHash,lease.leaseToken,evidence]),/ABSENCE_PROOF_INVALID/);
 await reject(db,()=>preparation(db,a),/FRESH_ABSENCE/);assert.deepEqual(await feeRow(db,fee),before);});
 }
 await isolated(db,async()=>{const lease=await call(db,'public.claim_rejected_fee_absence_service',[operation,a.manifestHash]);
 await reject(db,()=>call(db,'public.claim_rejected_fee_absence_service',[operation,a.manifestHash]),/BUSY/);
 assert.ok(lease.leaseToken);});
 }finally{await db.close()}
});

test('CAS rejeita pagamento, alteração de fonte/run/irmãos e prova vencida sem limpar tentativa',async()=>{
 const {db,fee,enrollment}=await setupRejectedFee();
 try {const a=await approve(db,fee);await absence(db,a);
 for(const mutation of [
 `update public.contas_receber set valor_pago=1 where id='${fee}'`,
 `update public.contas_receber set gateway_last_error='changed' where id='${fee}'`,
 `update public.contas_receber set updated_at=clock_timestamp() where matricula_id='${enrollment}' and id<>'${fee}'`,
 `update internal_academic.technical_manual_cycle_runs set total_amount=999 where matricula_id='${enrollment}'`,
 `select set_config('app.rejected_fee_correction_id','${operation}',true);update internal_academic.technical_rejected_fee_corrections set absence_confirmed_at=now()-interval '10 minutes' where id='${operation}'`,
 ]) await isolated(db,async()=>{await db.exec(mutation);const before=await feeRow(db,fee);await reject(db,()=>preparation(db,a),/CHANGED|FRESH_ABSENCE/);assert.deepEqual(await feeRow(db,fee),before)});
 }finally{await db.close()}
});

test('arquivo/preparo/termos imutáveis e grants privados; antigo token nunca recebe novos termos',async()=>{
 const {db,fee,enrollment}=await setupRejectedFee();
 try {const a=await approve(db,fee);await absence(db,a);await preparation(db,a);
 for(const sql of [
 `update internal_academic.technical_rejected_fee_corrections set source_receivable='{}' where id='${operation}'`,
 `delete from internal_academic.technical_rejected_fee_corrections where id='${operation}'`,
 `update public.contas_receber set data_vencimento='2026-10-31' where id='${fee}'`,
 `update internal_academic.technical_manual_receivable_issuance_authorizations set request_id='${id(98999)}' where receivable_id='${fee}'`,
 `update public.contas_receber set gateway_creation_token='${oldRequest}',gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id='${fee}'`,
 ]) await assert.rejects(db.exec(sql));
 await assert.rejects(db.query("update public.contas_receber set gateway_financial_terms=jsonb_set(gateway_financial_terms,'{dueDate}','\"2026-10-31\"') where id=$1",[fee]),/APPROVED_CLAIM/);
 for(const role of ['anon','authenticated','service_role']) {
 assert.equal((await rows(db,`select has_function_privilege($1,'internal_academic.prepare_rejected_fee_correction(uuid,text)','EXECUTE') ok`,[role]))[0].ok,false);
 }
 for(const role of ['anon','authenticated']) for(const signature of ['public.claim_rejected_fee_absence_service(uuid,text)','public.confirm_rejected_fee_absence_service(uuid,text,uuid,jsonb)','public.resolve_rejected_fee_request_service(uuid,uuid)'])
 assert.equal((await rows(db,'select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,signature]))[0].ok,false);
 }finally{await db.close()}
});


test('lease expirado, código82 diferente, proteção e ator sempolo falham sem inventar prova/consentimento',async()=>{
 const {db,fee,enrollment,cycleRequest}=await setupRejectedFee();
 try {
 for(const error of ['HTTP400 OTHER','CICLO_MANUAL_BANESE_REVISAO_QUERY_ERROR: Banese Card recusou criacao do boleto (400): {"Erros":[{"CodigoErroProcessamento":"83","Descricao":"ERRO_DATA_VENCIMENTO_MENOR_DATA_EMISSAO_DOCUMENTO"}]}'])
 await isolated(db,async()=>{await db.query('update public.contas_receber set gateway_last_error=$2 where id=$1',[fee,error]);await reject(db,()=>approve(db,fee),/SOURCE_CHANGED/)});
 await isolated(db,async()=>{await db.query("update internal_academic.technical_manual_cycle_runs set state='PROTECTED_EXISTING' where matricula_id=$1",[enrollment]);await reject(db,()=>approve(db,fee),/SOURCE_CHANGED/)});
 const a=await approve(db,fee);
 await isolated(db,async()=>{
 const lease=await call(db,'public.claim_rejected_fee_absence_service',[operation,a.manifestHash]);
 await db.query("select set_config('app.rejected_fee_correction_id',$1,true)",[operation]);
 await db.exec("update internal_academic.technical_rejected_fee_corrections set lease_until=now()-interval '1 second'");
 const evidence={operation:'EXACT_RESERVED_TITLE_ABSENCE',method:'GET',environment:'production',convenio:lease.convenio,nossoNumero:lease.nossoNumero,httpStatus:404,errorCode:'ERRO_BOLETO_NAO_ENCONTRADO',responseHash:'a'.repeat(64),checkedAt:new Date().toISOString()};
 await reject(db,()=>call(db,'public.confirm_rejected_fee_absence_service',[operation,a.manifestHash,lease.leaseToken,evidence]),/ABSENCE_PROOF_INVALID/);
 });
 await absence(db,a);await preparation(db,a);
 const resolved=await call(db,'public.resolve_rejected_fee_request_service',[fee,cycleRequest]);
 await db.query('insert into auth.users values($1)',[id(96005)]);
 await db.query(`insert into public.usuarios_sistema select (jsonb_populate_record(null::public.usuarios_sistema,to_jsonb(u)||jsonb_build_object('id',$1::text,'auth_user_id',$1::text,'polo_ids','[]'::jsonb))).* from public.usuarios_sistema u where auth_user_id=$2`,[id(96005),actor]);
 await db.query("select set_config('test.actor',$1,false)",[id(96005)]);
 await assert.rejects(call(db,'public.authorize_technical_manual_receivable_issuance_secure',[fee,resolved.requestId]),e=>e.code==='42501');
 assert.equal((await rows(db,'select consent_actor_id from internal_academic.technical_rejected_fee_corrections where id=$1',[operation]))[0].consent_actor_id,null);
 }finally{await db.close()}
});
