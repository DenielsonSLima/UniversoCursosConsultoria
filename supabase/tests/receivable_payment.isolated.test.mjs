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
 '20261014183611_receivable_payment_capabilities.sql','20261014191409_receivable_payment_safe_preflight.sql']) {
 await db.exec(source(`../migrations/${file}`));
 }
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[actor,otherActor]);
 await db.query('INSERT INTO public.polos(id) VALUES($1)',[polo]);
 await db.query("INSERT INTO public.parceiros VALUES($1,'00000000000')",[payer]);
 await db.query(`INSERT INTO public.usuarios_sistema(auth_user_id,perfil,status,permissoes,polo_ids)
 VALUES($1,'financeiro','ativo',$3::jsonb,ARRAY[$4::uuid]),($2,'financeiro','ativo',$3::jsonb,ARRAY[$4::uuid])`,
 [actor,otherActor,JSON.stringify({modules:['financeiro'],tabs:{financeiro:['outros-creditos','receber']}}),polo]);
 await db.query("INSERT INTO public.contas_bancarias(id,polo_id,nome) VALUES($1,$3,'Caixa'),($2,$3,'Banco')",[account,secondAccount,polo]);
 await db.query('INSERT INTO public.contas_bancarias_polos VALUES($1,$3),($2,$3)',[account,secondAccount,polo]);
 for(const [key,value] of Object.entries({uid:actor,identity:true,role:'authenticated'})) await setting(key,value);
 for(const signature of ['claim_receivable_payment_service(uuid)','start_receivable_payment_service(uuid,uuid)',
 'complete_receivable_payment_service(uuid,uuid,jsonb)','review_receivable_payment_service(uuid,uuid,text)']) {
 assert.equal(await scalar("SELECT has_function_privilege('authenticated',$1,'EXECUTE') value",['public.'+signature]),false);
 assert.equal(await scalar("SELECT has_function_privilege('anon',$1,'EXECUTE') value",['public.'+signature]),false);
 }
 assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.begin_receivable_payment_secure(uuid,jsonb)','EXECUTE') value"),true);
 assert.equal(await scalar("SELECT has_function_privilege('service_role','public.begin_receivable_payment_secure(uuid,jsonb)','EXECUTE') value"),false);
 assert.equal(await scalar("SELECT has_function_privilege('service_role','internal_receivable_payments.inspect(uuid,jsonb)','EXECUTE') value"),false);
 const local=await add(100);
 const first=await prepare(local,20100);
 assert.equal(first.lease.mode,'LOCAL'); assert.equal((await claim(first.data.requestId)).mode,'BUSY');
 await fail(()=>db.query("UPDATE public.contas_receber SET status='PAGO' WHERE id=$1",[local]),'Recebimento em andamento');
 await fail(()=>db.query("INSERT INTO public.receivable_manual_settlements VALUES($1,'STARTED')",[local]),'Recebimento em andamento');
 await complete(first.data.requestId,first.lease.leaseToken,proof());
 let row=await scalar('SELECT to_jsonb(r) value FROM public.contas_receber r WHERE id=$1',[local]);
 assert.equal(row.status,'PENDENTE'); assert.equal(row.valor_pago,100); assert.equal(row.payment_summary.remainingBefore,'100.00');
 const capability=await scalar('SELECT internal_academic.receivable_operation_capabilities(r) value FROM public.contas_receber r WHERE id=$1',[local]);
 assert.equal(capability.canSettle,true); assert.equal(capability.canEmit,false); assert.equal(capability.canCancel,false);
 await fail(()=>db.query("UPDATE public.contas_receber SET gateway_provider='banese_card',gateway_status='CREATING',gateway_creation_token=$2 WHERE id=$1",[local,id(88000)]),'BANK_HISTORY_REQUIRES_REVIEW');
 await setting('role','authenticated'); assert.equal((await begin(local,first.data)).attemptId,first.data.requestId);
 await setting('uid',otherActor); await fail(()=>begin(local,first.data),'REQUEST_CONFLICT'); await setting('uid',actor);
 await setting('role','service_role'); assert.equal((await claim(first.data.requestId)).result.replayed,true);
 await fail(()=>db.query("INSERT INTO public.receivable_manual_settlements VALUES($1,'STARTED')",[local]),'histórico');
 await fail(()=>db.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=200 WHERE id=$1",[local]),'PROJECTION_MISMATCH');
 const second=await prepare(local,20101); await complete(second.data.requestId,second.lease.leaseToken,proof());
 row=await scalar('SELECT to_jsonb(r) value FROM public.contas_receber r WHERE id=$1',[local]);
 assert.equal(row.status,'PAGO'); assert.equal(row.valor_pago,200); assert.equal(row.payment_summary.remainingBefore,'0.00');
 assert.equal((await scalar('SELECT internal_academic.receivable_operation_capabilities(r) value FROM public.contas_receber r WHERE id=$1',[local])).canSettle,false);
 assert.equal(await scalar("SELECT count(*)::int value FROM public.financial_payment_events WHERE source_id=$1",[local]),2);
 const bank=await add(101,true); const b=await prepare(bank,20200);
 assert.equal(b.lease.mode,'CANCEL_ALLOWED');
 await fail(()=>complete(b.data.requestId,b.lease.leaseToken,proof(true,101)),'BANK_PROOF_INVALID');
 await start(b.data.requestId,b.lease.leaseToken);
 await fail(()=>db.query("UPDATE public.banese_reconciliation_queue SET state='LEASED',lease_run_id=$2 WHERE receivable_id=$1",[bank,id(111)]),'Recebimento em andamento');
 await fail(()=>complete(b.data.requestId,b.lease.leaseToken,proof(true,999)),'BANK_PROOF_INVALID');
 await complete(b.data.requestId,b.lease.leaseToken,proof(true,101));
 row=await scalar('SELECT to_jsonb(r) value FROM public.contas_receber r WHERE id=$1',[bank]);
 assert.equal(row.status,'PENDENTE'); assert.equal(row.gateway_status,'CANCELED'); assert.equal(row.gateway_payment_id,'000000101');
 await fail(()=>db.query("UPDATE public.contas_receber SET gateway_status='PAID' WHERE id=$1",[bank]),'BANK_STATUS_REQUIRES_REVIEW');
 await fail(()=>db.query("UPDATE public.payment_gateway_transactions SET remote_status='PAID' WHERE receivable_id=$1",[bank]),'BANK_TRANSACTION_REQUIRES_REVIEW');
 const b2=await prepare(bank,20201); assert.equal(b2.lease.mode,'CANCEL_ALLOWED');
 await complete(b2.data.requestId,b2.lease.leaseToken,proof(true,101,{mutationAttempted:false,alreadyCanceled:true}));
 assert.equal(await scalar('SELECT status value FROM public.contas_receber WHERE id=$1',[bank]),'PAGO');
 const ambiguous=await add(102,true); const amb=await prepare(ambiguous,20300);
 await start(amb.data.requestId,amb.lease.leaseToken);
 await rpc('review_receivable_payment_service',[amb.data.requestId,amb.lease.leaseToken,'REMOTE_AMBIGUOUS']);
 const recovered=await claim(amb.data.requestId); assert.equal(recovered.mode,'CONFIRM_ONLY');
 await fail(()=>start(amb.data.requestId,recovered.leaseToken),'LEASE_OR_INTENT');
 await complete(amb.data.requestId,recovered.leaseToken,proof(true,102,{mutationAttempted:false,alreadyCanceled:true}));
 const changed=await add(103); const stale=input(changed,20400); stale.fingerprint=(await preview(changed,stale)).fingerprint;
 await db.query('UPDATE public.contas_receber SET valor=201 WHERE id=$1',[changed]);
 await fail(()=>begin(changed,stale),'PREVIEW_CHANGED');
 const forbidden=await add(104,true,{gateway_submission_status:'API_AMBIGUOUS'});
 const f=input(forbidden,20500); f.fingerprint=(await preview(forbidden,f)).fingerprint;
 await fail(()=>begin(forbidden,f),'REMOTE_TITLE_UNSUPPORTED');
 const imported=await add(106,true);
 await db.query("UPDATE public.payment_gateway_transactions SET raw_payload='{\"importSource\":\"BANESE_API_LEGACY_DISCOVERY\"}' WHERE receivable_id=$1",[imported]);
 const imp=input(imported,20700); imp.fingerprint=(await preview(imported,imp)).fingerprint;
 await fail(()=>begin(imported,imp),'TRANSACTION_CHANGED');
 const loan=await add(105); await db.query('INSERT INTO public.emprestimos_financeiros VALUES($1)',[loan]);
 const l=input(loan,20600); l.fingerprint=(await preview(loan,l)).fingerprint; await fail(()=>begin(loan,l),'TITLE_REQUIRES_REVIEW');
 // A rejected GET before durable intent must release the title for paid reconciliation.
 const preflight=await add(107,true); const pre=await prepare(preflight,20800);
 await fail(()=>rpc('review_receivable_payment_service',[pre.data.requestId,id(99999),'REMOTE_PREFLIGHT_ERROR']),'REVIEW_SCOPE');
 assert.equal(await scalar('SELECT state value FROM internal_receivable_payments.attempts WHERE id=$1',[pre.data.requestId]),'LEASED');
 const safelyFailed=await rpc('review_receivable_payment_service',[pre.data.requestId,pre.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR']);
 assert.deepEqual(safelyFailed,{reviewed:true,state:'FAILED_SAFE',safeToEdit:true});
 assert.equal(await scalar('SELECT intent_at IS NULL AND completed_at IS NOT NULL value FROM internal_receivable_payments.attempts WHERE id=$1',[pre.data.requestId]),true);
 assert.equal((await claim(pre.data.requestId)).mode,'FAILED_SAFE');
 await fail(()=>start(pre.data.requestId,pre.lease.leaseToken),'LEASE_OR_INTENT');
 await fail(()=>complete(pre.data.requestId,pre.lease.leaseToken,proof(true,107)),'LEASE_EXPIRED');
 await db.query("UPDATE public.banese_reconciliation_queue SET state='LEASED',lease_run_id=$2 WHERE receivable_id=$1",[preflight,id(111)]);
 await db.query("UPDATE public.payment_gateway_transactions SET remote_status='PAID' WHERE receivable_id=$1",[preflight]);
 await db.query("UPDATE public.contas_receber SET status='PAGO',gateway_status='PAID' WHERE id=$1",[preflight]);
 // Failed safe attempts remain audited, but no longer monopolize the same source.
 const recoverable=await add(108); const rec=await prepare(recoverable,20900);
 await rpc('review_receivable_payment_service',[rec.data.requestId,rec.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR']);
 const replacement=await prepare(recoverable,20901); await complete(replacement.data.requestId,replacement.lease.leaseToken,proof());
 const afterPartial=await prepare(recoverable,20902);
 assert.equal((await rpc('review_receivable_payment_service',[afterPartial.data.requestId,afterPartial.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR'])).safeToEdit,true);
 assert.equal(await scalar('SELECT count(*)::int value FROM public.financial_payment_events WHERE source_id=$1',[recoverable]),1);
 // Lost start response cannot convert a persisted intent into a safe failure.
 const lostStart=await add(109,true); const lost=await prepare(lostStart,21000); await start(lost.data.requestId,lost.lease.leaseToken);
 assert.equal((await rpc('review_receivable_payment_service',[lost.data.requestId,lost.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR'])).safeToEdit,false);
 assert.equal((await claim(lost.data.requestId)).mode,'CONFIRM_ONLY');
 await fail(()=>db.query("UPDATE public.contas_receber SET status='PAGO' WHERE id=$1",[lostStart]),'Recebimento em andamento');
 // Defensive ledger check is keyed to this request, including inconsistent recovery data.
 const ledgerConflict=await add(110); const conflict=await prepare(ledgerConflict,21100);
 await db.query(`INSERT INTO public.financial_payment_events(request_id,actor_id,source_kind,source_id,polo_id,payment_date,
 original_cents,principal_cents,interest_cents,penalty_cents,addition_cents,discount_cents,payment_cents,input,payload_hash,preview)
 VALUES($1,$2,'RECEIVABLE',$3,$4,'2026-01-01',20000,10000,0,0,0,0,10000,'{}','synthetic','{}')`,[conflict.data.requestId,actor,ledgerConflict,polo]);
 assert.equal((await rpc('review_receivable_payment_service',[conflict.data.requestId,conflict.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR'])).safeToEdit,false);
 // A genuinely superseded lease cannot terminate the replacement worker's attempt.
 const leaseRace=await add(111); const leaseA=await prepare(leaseRace,21200);
 await db.query("UPDATE internal_receivable_payments.attempts SET lease_until=now()-interval '1 minute' WHERE id=$1",[leaseA.data.requestId]);
 const leaseB=await claim(leaseA.data.requestId); assert.notEqual(leaseB.leaseToken,leaseA.lease.leaseToken);
 await fail(()=>rpc('review_receivable_payment_service',[leaseA.data.requestId,leaseA.lease.leaseToken,'REMOTE_PREFLIGHT_ERROR']),'REVIEW_SCOPE');
 await fail(()=>db.query("UPDATE public.contas_receber SET status='PAGO' WHERE id=$1",[leaseRace]),'Recebimento em andamento');
 assert.equal((await rpc('review_receivable_payment_service',[leaseA.data.requestId,leaseB.leaseToken,'REMOTE_PREFLIGHT_ERROR'])).safeToEdit,true);
 // Current worker regression: one busy receipt used to abort the whole batch.
 await db.exec(source('receivable_reconciliation.fixture.sql'));
 await db.exec(source('receivable_reconciliation.baseline.sql'));
 await db.query("UPDATE public.banese_reconciliation_queue SET state='DONE',lease_run_id=NULL,lease_until=NULL");
 const busyTitle=await add(112,true); const busyReceipt=await prepare(busyTitle,21300);
 await rpc('review_receivable_payment_service',[busyReceipt.data.requestId,busyReceipt.lease.leaseToken,'REMOTE_AMBIGUOUS']);
 const availableTitle=await add(113,true);
 await fail(()=>rpc('prepare_banese_reconciliation_batch_v3',[]),'Recebimento em andamento');
 assert.equal(await scalar('SELECT count(*)::int value FROM public.banese_reconciliation_runs'),0);
 await db.exec(source('../migrations/20261014191412_receivable_payment_reconciliation_queue.sql'));
 for(const role of ['anon','authenticated']) assert.equal(await scalar("SELECT has_function_privilege($1,'public.receivable_payment_reconciliation_available_service(uuid,boolean)','EXECUTE') value",[role]),false);
 const batch=await rpc('prepare_banese_reconciliation_batch_v3',[]);
 assert.equal(batch.claimed,1); assert.equal(batch.items[0].receivableId,availableTitle);
 assert.equal(await scalar('SELECT state value FROM public.banese_reconciliation_queue WHERE receivable_id=$1',[busyTitle]),'READY');
 assert.equal(await scalar('SELECT state value FROM internal_receivable_payments.attempts WHERE id=$1',[busyReceipt.data.requestId]),'REVIEW');
 assert.equal(await scalar('SELECT claimed value FROM public.banese_reconciliation_runs WHERE id=$1',[batch.runId]),1);
 await db.query("UPDATE public.usuarios_sistema SET status='inativo' WHERE auth_user_id=$1",[actor]);
 await fail(()=>claim(first.data.requestId),'UNAUTHORIZED');
 await fail(()=>claim(pre.data.requestId),'UNAUTHORIZED');
 console.log('Receivable saga PASS: partial100+100, bank proof, replay/auth, leases, ambiguous recovery, legacy and webhook fences, source/preview guards.');
} finally { await db.close(); }
