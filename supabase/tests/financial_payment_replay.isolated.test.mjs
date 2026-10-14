import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo=id(1), actor=id(3), otherActor=id(4), payer=id(5), account=id(6), secondAccount=id(7);
const setting = (name,value) => db.query('SELECT set_config($1,$2,false)',[`test.${name}`,String(value)]);
const scalar = async (sql,params=[]) => (await db.query(sql,params)).rows[0].value;
const rpc = (name,args) => scalar(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args);
const preview = (rid,input) => rpc('preview_financial_payment_secure',['RECEIVABLE',rid,JSON.stringify(input)]);
const begin = (rid,input) => rpc('begin_receivable_payment_secure',[rid,JSON.stringify(input)]);
const claim = attempt => rpc('claim_receivable_payment_service',[attempt]);
const start = (attempt,lease) => rpc('start_receivable_payment_service',[attempt,lease]);
const complete = (attempt,lease,evidence) => rpc('complete_receivable_payment_service',[attempt,lease,JSON.stringify(evidence)]);
const fail = (fn,message) => assert.rejects(fn,new RegExp(message));
const input = (rid,n,amount='100.00') => ({ requestId:id(n),sourceId:rid,paymentDate:'2026-01-01',
 components:[{accountId:account,method:'DINHEIRO',amount}],interest:'0.00',penalty:'0.00',addition:'0.00',discount:'0.00',notes:'Recebimento sintético' });
const proof = (bank=false,n=0,patch={}) => ({ remoteStatus:bank?'CANCELED':'LOCAL',situationCode:bank?5:null,
 confirmedAt:new Date().toISOString(),evidenceFingerprint:'a'.repeat(64),strictEffectivePayments:true,identityValidated:true,
 termsValidated:true,paymentsCount:0,mutationAttempted:bank,alreadyCanceled:false,convenio:bank?'123456':null,
 nossoNumero:bank?String(n).padStart(9,'0'):null,...patch });
const add = async (n,bank=false,patch={}) => {
 const row={id:id(n),polo_id:polo,cliente_id:payer,descricao:'Crédito sintético',valor:200,
 data_vencimento:'2028-10-31',status:'PENDENTE',categoria:'OUTROS_CREDITOS',tipo_lancamento:'OUTRO_CREDITO',origem_pagamento:'LOCAL',
 ...bank ? {origem_pagamento:'BANESE',forma_pagamento:'BOLETO',gateway_provider:'banese_card',gateway_environment:'production',
 gateway_payment_method:'BOLETO',gateway_status:'PENDING',gateway_payment_id:String(n).padStart(9,'0'),gateway_boleto_nosso_numero:String(n).padStart(9,'0'),
 gateway_boleto_convenio:'123456',gateway_boleto_agencia:'001',gateway_boleto_linha_digitavel:'1'.repeat(47),gateway_boleto_codigo_barras:'1'.repeat(44),
 gateway_issuer_polo_id:polo,gateway_boleto_issued_at:'2026-01-01T10:00:00Z',gateway_financial_terms_confirmed_at:'2026-01-01T10:00:00Z',
 gateway_financial_terms:{nominalAmount:200},gateway_submission_channel:'API',gateway_submission_status:'API_REGISTERED'}:{},...patch};
 const keys=Object.keys(row);
 await db.query(`INSERT INTO public.contas_receber(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')})`,
 Object.values(row).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));
 if(bank) {
 await db.query(`INSERT INTO public.payment_gateway_transactions(id,receivable_id,provider_code,environment,payment_method,amount,
 origin_polo_id,issuer_polo_id,remote_payment_id,remote_status,bank_slip_our_number,bank_slip_digitable_line,bank_slip_barcode)
 VALUES($1,$2,'banese_card','production','BOLETO',200,$3,$3,$4,'PENDING',$4,$5,$6)`,[id(n+10000),id(n),polo,String(n).padStart(9,'0'),'1'.repeat(47),'1'.repeat(44)]);
 await db.query("INSERT INTO public.banese_reconciliation_queue(receivable_id,state) VALUES($1,'READY')",[id(n)]);
 }
 return id(n);
};
const prepare = async (rid,n,amount='100.00') => {
 await setting('role','authenticated'); const data=input(rid,n,amount); data.fingerprint=(await preview(rid,data)).fingerprint;
 await begin(rid,data); await setting('role','service_role'); const lease=await claim(data.requestId); return {data,lease};
};
try {
 await db.exec(source('other_credit_cancellation.fixture.sql'));
 await db.exec(source('financial_payment.fixture.sql'));
 await db.exec(`CREATE SCHEMA internal_academic;
 ALTER TABLE public.contas_receber ADD COLUMN gateway_payment_link_id text,ADD COLUMN asaas_payment_link_id text,ADD COLUMN asaas_status text;
 ALTER TABLE public.receivable_manual_settlements ADD COLUMN state text;`);
 for(const file of ['20261014175840_other_credit_cancellation_storage.sql',
 '20261014183502_financial_payment_ledger.sql','20261014183505_financial_payment_preview.sql',
 '20261014183509_financial_payment_append.sql','20261014183512_financial_payment_source_guards.sql',
 '20261014183558_receivable_payment_saga.sql','20261014183602_receivable_payment_commands.sql',
 '20261014183605_receivable_payment_completion.sql','20261014183608_receivable_payment_fences.sql',
 '20261014183611_receivable_payment_capabilities.sql','20261014191409_receivable_payment_safe_preflight.sql','20261014191414_financial_payment_completed_replay.sql']) {
 await db.exec(source(`../migrations/${file}`));
 }
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[actor,otherActor]);
 await db.query('INSERT INTO public.polos(id) VALUES($1)',[polo]);
 await db.query("INSERT INTO public.parceiros VALUES($1,'00000000000')",[payer]);
 await db.query(`INSERT INTO public.usuarios_sistema(auth_user_id,perfil,status,permissoes,polo_ids)
 VALUES($1,'financeiro','ativo',$3::jsonb,ARRAY[$4::uuid]),($2,'financeiro','ativo',$3::jsonb,ARRAY[$4::uuid])`,
 [actor,otherActor,JSON.stringify({modules:['financeiro'],tabs:{financeiro:['outros-creditos','receber','despesas']}}),polo]);
 await db.query("INSERT INTO public.contas_bancarias(id,polo_id,nome) VALUES($1,$3,'Caixa'),($2,$3,'Banco')",[account,secondAccount,polo]);
 await db.query('INSERT INTO public.contas_bancarias_polos VALUES($1,$3),($2,$3)',[account,secondAccount,polo]);
 for(const [key,value] of Object.entries({uid:actor,identity:true,role:'authenticated'})) await setting(key,value);

 const active = value => db.query('UPDATE public.contas_bancarias SET ativo=$2 WHERE id=$1',[account,value]);
 const count = () => scalar('SELECT count(*)::int value FROM public.financial_payment_events');
 assert.equal(await scalar("SELECT has_function_privilege('authenticated','internal_financial_payments.normalized_replay_input(uuid,jsonb)','EXECUTE') value"),false);
 for(const amount of ['100.00','200.00']) {
   const n=amount==='100.00'?500:501; const rid=await add(n); const prepared=await prepare(rid,n+20000,amount);
   const result=await complete(prepared.data.requestId,prepared.lease.leaseToken,proof());
   const before=await count(); await active(false); await setting('role','authenticated');
   assert.equal((await begin(rid,prepared.data)).attemptId,prepared.data.requestId);
   await setting('role','service_role'); const replay=await claim(prepared.data.requestId);
   assert.equal(replay.mode,'COMPLETE'); assert.equal(replay.result.paymentId,result.paymentId); assert.equal(replay.result.replayed,true);
   await setting('role','authenticated');
   await fail(()=>begin(rid,{...prepared.data,notes:'changed'}),'REQUEST_CONFLICT');
   await setting('uid',otherActor); await fail(()=>begin(rid,prepared.data),'REQUEST_CONFLICT'); await setting('uid',actor);
   await db.query("UPDATE public.usuarios_sistema SET status='inativo' WHERE auth_user_id=$1",[actor]);
   await fail(()=>begin(rid,prepared.data),'UNAUTHORIZED');
   await db.query("UPDATE public.usuarios_sistema SET status='ativo' WHERE auth_user_id=$1",[actor]);
   await fail(()=>begin(rid,{...prepared.data,requestId:id(n+30000)}),'ACCOUNT_UNAVAILABLE');
   assert.equal(await count(),before); await active(true);
 }
 // A failed preflight is also terminal and must let the client discard its old request.
 const failedSource=await add(502); const failed=await prepare(failedSource,20502);
 await rpc('review_receivable_payment_service',[failed.data.requestId,failed.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR']);
 await active(false); await setting('role','authenticated');
 assert.equal((await begin(failedSource,failed.data)).attemptId,failed.data.requestId);
 await setting('role','service_role'); assert.equal((await claim(failed.data.requestId)).mode,'FAILED_SAFE');
 await active(true);
 // Active attempts still require a usable account; completion is not fabricated.
 const activeSource=await add(503); const pending=await prepare(activeSource,20503);
 await active(false); await setting('role','authenticated');
 await fail(()=>begin(activeSource,pending.data),'ACCOUNT_UNAVAILABLE'); await active(true);
 // Direct expense/payable confirmations replay the recorded immutable event.
 for(const kind of ['EXPENSE','PAYABLE']) for(const amount of ['100.00','200.00']) {
   const n=(kind==='EXPENSE'?600:700)+(amount==='200.00'?1:0); const rid=id(n);
   const table=kind==='EXPENSE'?'despesas_lancamentos':'contas_pagar';
   await db.query(`INSERT INTO public.${table}(id,polo_id,valor,status,data_vencimento) VALUES($1,$2,200,'PENDENTE','2028-10-31')`,[rid,polo]);
   const data=input(rid,n+20000,amount);
   data.fingerprint=(await rpc('preview_financial_payment_secure',[kind,rid,JSON.stringify(data)])).fingerprint;
   const confirm = value => rpc('confirm_expense_payment_secure',[kind,rid,JSON.stringify(value)]);
   const result=await confirm(data); const before=await count(); await active(false);
   const replay=await confirm(data); assert.equal(replay.paymentId,result.paymentId); assert.equal(replay.replayed,true);
   await fail(()=>confirm({...data,discount:'1.00'}),'REQUEST_REUSED');
   await fail(()=>confirm({...data,fingerprint:'changed'}),'REQUEST_REUSED');
   await setting('uid',otherActor); await fail(()=>confirm(data),'REQUEST_REUSED'); await setting('uid',actor);
   await db.query("UPDATE public.usuarios_sistema SET status='inativo' WHERE auth_user_id=$1",[actor]);
   await fail(()=>confirm(data),'UNAUTHORIZED');
   await db.query("UPDATE public.usuarios_sistema SET status='ativo' WHERE auth_user_id=$1",[actor]);
   await fail(()=>confirm({...data,requestId:id(n+30000)}),'ACCOUNT_UNAVAILABLE');
   assert.equal(await count(),before); await active(true);
 }
 console.log('PASS completed replay: partial/full receipts, expenses and payables; inactive account, authorization, payload, no duplicate; active attempts remain guarded');
} finally { await db.close(); }
