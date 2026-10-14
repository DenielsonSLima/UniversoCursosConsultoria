import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Actual PostgreSQL/WASM functions with synthetic rows only; no network or credentials.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo=id(1), otherPolo=id(2), actor=id(3), otherActor=id(4), payer=id(5);
const reason='Emissão sintética incorreta';
const scalar = async (sql, params=[]) => (await db.query(sql,params)).rows[0].value;
const setting = (name,value) => db.query('SELECT set_config($1,$2,false)',[`test.${name}`,String(value)]);
const permissions={modules:['financeiro'],tabs:{financeiro:['outros-creditos']}};
const begin = (request,ids,why=reason) => scalar('SELECT public.begin_other_credit_cancellation($1,$2::uuid[],$3) value',[request,ids,why]);
const call = (name,args) => scalar(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args);
const claim = (operation,receivable) => call('claim_other_credit_cancellation',[operation,receivable]);
const start = (operation,receivable,token) => call('start_other_credit_cancellation',[operation,receivable,token]);
const complete = (operation,receivable,token,evidence) => call('complete_other_credit_cancellation',[operation,receivable,token,JSON.stringify(evidence)]);
const review = (operation,receivable,token,why='REMOTE_AMBIGUOUS') => call('review_other_credit_cancellation',[operation,receivable,token,why]);
const status = receivable => scalar('SELECT status value FROM public.contas_receber WHERE id=$1',[receivable]);
const denied = callback => assert.rejects(callback,error=>error.code==='42501');
const fail = (callback,message) => assert.rejects(callback,new RegExp(message));
const update = async (receivable,patch) => {
  const entries=Object.entries(patch);
  await db.query(`UPDATE public.contas_receber SET ${entries.map(([k],i)=>`${k}=$${i+2}`).join(',')} WHERE id=$1`,
    [receivable,...entries.map(([,v])=>v && typeof v==='object' ? JSON.stringify(v):v)]);
};
const add = async (n,bank=false,patch={}) => {
  const row={id:id(n),polo_id:polo,cliente_id:payer,descricao:'Crédito sintético',valor:100,
    data_vencimento:'2028-10-31',status:'PENDENTE',categoria:'OUTROS_CREDITOS',tipo_lancamento:'OUTRO_CREDITO',
    origem_pagamento:'LOCAL',...bank ? {
      origem_pagamento:'BANESE',forma_pagamento:'BOLETO',gateway_provider:'banese_card',gateway_environment:'production',
      gateway_payment_method:'BOLETO',gateway_status:'PENDING',gateway_payment_id:String(n).padStart(9,'0'),
      gateway_boleto_nosso_numero:String(n).padStart(9,'0'),gateway_boleto_convenio:'123456',gateway_boleto_agencia:'001',
      gateway_boleto_linha_digitavel:'1'.repeat(47),gateway_boleto_codigo_barras:'1'.repeat(44),gateway_issuer_polo_id:polo,
      gateway_boleto_issued_at:'2026-10-14T10:00:00Z',gateway_financial_terms_confirmed_at:'2026-10-14T10:00:00Z',
      gateway_financial_terms:{nominalAmount:100},gateway_submission_channel:'API',gateway_submission_status:'API_REGISTERED',
    }: {},...patch};
  const keys=Object.keys(row);
  await db.query(`INSERT INTO public.contas_receber(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')})`,
    Object.values(row).map(v=>typeof v==='object'?JSON.stringify(v):v));
  if(bank) {
    await db.query(`INSERT INTO public.payment_gateway_transactions(id,receivable_id,provider_code,environment,
      payment_method,amount,origin_polo_id,issuer_polo_id,remote_payment_id,remote_status,bank_slip_our_number,
      bank_slip_digitable_line,bank_slip_barcode) VALUES($1,$2,'banese_card','production','BOLETO',100,$3,$3,$4,'PENDING',$4,$5,$6)`,
      [id(n+10000),id(n),polo,String(n).padStart(9,'0'),'1'.repeat(47),'1'.repeat(44)]);
    await db.query("INSERT INTO public.banese_reconciliation_queue(receivable_id,state) VALUES($1,'READY')",[id(n)]);
  }
  return id(n);
};
const proof = (bank=false,patch={}) => ({remoteStatus:bank?'CANCELED':'LOCAL',situationCode:bank?5:null,
  confirmedAt:new Date().toISOString(),evidenceFingerprint:'a'.repeat(64),strictEffectivePayments:true,
  identityValidated:true,termsValidated:true,paymentsCount:0,mutationAttempted:bank,alreadyCanceled:false,
  convenio:bank?'123456':null,nossoNumero:bank?'000000101':null,...patch});
const expire = (operation,receivable) => db.query(`UPDATE internal_other_credit_cancellation.items
  SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1 AND receivable_id=$2`,[operation,receivable]);
const prepare = async (n,bank=false,patch={}) => {
  const receivable=await add(n,bank,patch),operation=id(n+20000);
  await setting('role','authenticated'); await begin(operation,[receivable]); await setting('role','service_role');
  return {receivable,operation};
};

try {
  await db.exec(source('other_credit_cancellation.fixture.sql'));
  const authorizer=source('../migrations/20261013170200_other_credit_plans_rpc.sql');
  await db.exec(authorizer.slice(authorizer.indexOf('CREATE FUNCTION internal_finance.authorize_other_credit_plan'),
    authorizer.indexOf('CREATE FUNCTION internal_finance.validate_other_credit_plan_references')));
  await db.query('INSERT INTO auth.users VALUES($1),($2)',[actor,otherActor]);
  await db.query('INSERT INTO public.polos(id) VALUES($1),($2)',[polo,otherPolo]);
  await db.query("INSERT INTO public.parceiros VALUES($1,'00000000000')",[payer]);
  await db.query(`INSERT INTO public.usuarios_sistema(auth_user_id,perfil,status,permissoes,polo_ids)
    VALUES($1,'financeiro','ativo',$3::jsonb,ARRAY[$4::uuid]),($2,'financeiro','ativo',$3::jsonb,ARRAY[$4::uuid])`,
    [actor,otherActor,JSON.stringify(permissions),polo]);
  for(const [key,value] of Object.entries({uid:actor,polo,tab:true,identity:true,role:'authenticated'})) await setting(key,value);
  const files=readdirSync(new URL('../migrations/',import.meta.url))
    .filter(name=>/^20261014175\d{3}_other_credit_cancellation_.*\.sql$/.test(name)).sort();
  assert.equal(files.length,4,'All four cancellation migrations are tested');
  for(const file of files) await db.exec(source(`../migrations/${file}`));

  const local=await add(100),bank=await add(101,true),operation=id(20100);
  const created=await begin(operation,[bank,local]);
  assert.deepEqual(created.receivableIds,[local,bank]);
  assert.equal((await begin(operation,[local,bank])).operationId,operation);
  assert.equal((await begin(id(29999),[bank,local])).operationId,operation,'Reload resumes original operation');
  await fail(()=>begin(operation,[local]),'REPLAY_CONFLICT');
  await fail(()=>begin(operation,[local,bank],'Outro motivo'),'REPLAY_CONFLICT');
  await fail(()=>begin(id(29998),[local]),'EXISTING_OPERATION');
  await fail(()=>begin(id(29997),[local,local]),'DUPLICATE_ITEMS');
  await fail(()=>begin(id(29996),[]),'INVALID_REQUEST');
  await fail(()=>begin(id(29995),[local],'erro'),'INVALID_REQUEST');
  await setting('uid',otherActor); await fail(()=>begin(operation,[local,bank]),'REPLAY_CONFLICT');
  await setting('uid',actor); await setting('tab',false); await denied(()=>begin(operation,[local,bank]));
  await setting('tab',true); await setting('polo',otherPolo); await denied(()=>begin(operation,[local,bank]));
  await setting('polo',polo); await setting('role','service_role');

  const [localClaim,otherClaim]=await Promise.all([claim(operation,local),claim(operation,local)]);
  assert.deepEqual([localClaim.mode,otherClaim.mode].sort(),['BUSY','LOCAL'],'Only one lease can proceed');
  await fail(()=>start(operation,local,localClaim.leaseToken),'SNAPSHOT_CHANGED');
  await fail(()=>complete(operation,local,id(9999),proof()),'LEASE_MISMATCH');
  await fail(()=>complete(operation,local,localClaim.leaseToken,proof(false,{confirmedAt:'2000-01-01T00:00:00Z'})),'STALE_PROOF');
  await fail(()=>complete(operation,local,localClaim.leaseToken,proof(false,{convenio:'123456'})),'LOCAL_PROOF_INVALID');
  const localProof=proof();
  await complete(operation,local,localClaim.leaseToken,localProof);
  assert.equal(await status(local),'CANCELADO');
  assert.equal((await claim(operation,local)).mode,'COMPLETE');
  await complete(operation,local,localClaim.leaseToken,localProof);
  await fail(()=>complete(operation,local,localClaim.leaseToken,{...localProof,evidenceFingerprint:'b'.repeat(64)}),'EVIDENCE_CONFLICT');

  const bankClaim=await claim(operation,bank); assert.equal(bankClaim.mode,'CANCEL_ALLOWED');
  await fail(()=>complete(operation,bank,bankClaim.leaseToken,proof(true)),'BANK_PROOF_INVALID');
  await start(operation,bank,bankClaim.leaseToken);
  assert.equal(await scalar('SELECT state value FROM public.banese_reconciliation_queue WHERE receivable_id=$1',[bank]),'DONE');
  await fail(()=>start(operation,bank,bankClaim.leaseToken),'LEASE_OR_INTENT');
  await fail(()=>complete(operation,bank,bankClaim.leaseToken,proof(true,{paymentsCount:1})),'BANK_PROOF_INVALID');
  await fail(()=>complete(operation,bank,bankClaim.leaseToken,proof(true,{nossoNumero:'000000999'})),'BANK_PROOF_INVALID');
  await fail(()=>complete(operation,bank,bankClaim.leaseToken,proof(true,{convenio:'654321'})),'BANK_PROOF_INVALID');
  assert.equal(await status(bank),'PENDENTE','Bank intent alone never cancels local balance');
  await review(operation,bank,bankClaim.leaseToken);
  const resumed=await claim(operation,bank); assert.equal(resumed.mode,'CONFIRM_ONLY');
  await fail(()=>start(operation,bank,resumed.leaseToken),'LEASE_OR_INTENT');
  await complete(operation,bank,resumed.leaseToken,proof(true,{mutationAttempted:false,alreadyCanceled:true}));
  assert.equal(await status(bank),'CANCELADO');
  assert.equal(await scalar('SELECT remote_status value FROM public.payment_gateway_transactions WHERE receivable_id=$1',[bank]),'CANCELED');

  for(const [n,patch] of [
    [200,{status:'PAGO'}],[201,{status:'PARCIAL'}],[202,{valor_pago:1}],
    [203,{data_pagamento:'2026-10-14'}],[204,{manual_settlement_id:id(9)}],
    [205,{gateway_settlement_evidence:{paid:true}}],[206,{gateway_status:'PAID'}],
    [207,{gateway_submission_channel:'CNAB'}],[208,{gateway_cnab_file_id:id(9)}],
    [209,{origem_pagamento:'SISTEMA_ANTERIOR'}],[210,{matricula_id:id(9)}],
    [211,{turma_id:id(9)}],[212,{origem_cronograma_id:'synthetic'}],
    [213,{regra_financeira_tecnica_snapshot:{scope:'technical'}}],
    [214,{regra_financeira_plano_unico_snapshot:{scope:'academic'}}],
    [215,{regra_financeira_dependencia_snapshot:{scope:'dependency'}}],
    [216,{regra_financeira_renegociacao_snapshot:{scope:'renegotiation'}}],
  ]) {
    const x=await prepare(n,false,patch);
    await fail(()=>claim(x.operation,x.receivable),'INELIGIBLE');
    assert.equal(await status(x.receivable),patch.status||'PENDENTE');
  }
  for(const [n,table,column] of [[220,'emprestimos_financeiros','conta_receber_id'],
    [221,'convenios_financeiros_creditos','conta_receber_id'],[222,'inscricoes_online','receivable_id'],
    [223,'matricula_dependencia_cobrancas','conta_receber_id'],[224,'receivable_manual_settlements','receivable_id']]) {
    const x=await prepare(n);
    await db.query(`INSERT INTO public.${table}(${column}) VALUES($1)`,[x.receivable]);
    await fail(()=>claim(x.operation,x.receivable),'INELIGIBLE');
  }

  const latePayment=await prepare(300,true),late=await claim(latePayment.operation,latePayment.receivable);
  await start(latePayment.operation,latePayment.receivable,late.leaseToken);
  await update(latePayment.receivable,{status:'PAGO',valor_pago:100});
  await fail(()=>complete(latePayment.operation,latePayment.receivable,late.leaseToken,proof(true)),'INELIGIBLE');
  assert.equal(await status(latePayment.receivable),'PAGO');
  await review(latePayment.operation,latePayment.receivable,late.leaseToken,'LOCAL_SYNC_AFTER_REMOTE');

  const drift=await prepare(301,true),driftClaim=await claim(drift.operation,drift.receivable);
  await update(drift.receivable,{descricao:'Descrição alterada'});
  await fail(()=>start(drift.operation,drift.receivable,driftClaim.leaseToken),'SNAPSHOT_CHANGED');
  assert.equal(await status(drift.receivable),'PENDENTE');
  const expired=await prepare(302,true),first=await claim(expired.operation,expired.receivable);
  await expire(expired.operation,expired.receivable);
  await fail(()=>start(expired.operation,expired.receivable,first.leaseToken),'LEASE_OR_INTENT');
  const reclaimed=await claim(expired.operation,expired.receivable); assert.equal(reclaimed.mode,'CANCEL_ALLOWED');
  assert.notEqual(reclaimed.leaseToken,first.leaseToken);
  await start(expired.operation,expired.receivable,reclaimed.leaseToken);
  await expire(expired.operation,expired.receivable);
  assert.equal((await claim(expired.operation,expired.receivable)).mode,'CONFIRM_ONLY');

  const revoked=await prepare(303),revokedClaim=await claim(revoked.operation,revoked.receivable);
  await db.query("UPDATE public.usuarios_sistema SET status='inativo' WHERE auth_user_id=$1",[actor]);
  await denied(()=>claim(revoked.operation,revoked.receivable));
  await denied(()=>complete(revoked.operation,revoked.receivable,revokedClaim.leaseToken,proof()));
  await review(revoked.operation,revoked.receivable,revokedClaim.leaseToken,'LOCAL_SYNC_AFTER_REMOTE');
  await db.query("UPDATE public.usuarios_sistema SET status='ativo' WHERE auth_user_id=$1",[actor]);

  // Service worker reauthorization must remain fail-closed after the user began.
  const access=await prepare(306);
  const actorAllowed=() => scalar('SELECT internal_other_credit_cancellation.actor_allowed($1,$2) value',[actor,polo]);
  const userPatch=async (column,value) => db.query(`UPDATE public.usuarios_sistema SET ${column}=$2 WHERE auth_user_id=$1`,
    [actor,value && typeof value==='object'?JSON.stringify(value):value]);
  for(const malformed of [
    {modules:{financeiro:false},tabs:{financeiro:['outros-creditos']}},
    {modules:['financeiro'],tabs:{financeiro:{'outros-creditos':false}}},
    {modules:['financeiro'],financeiroTabs:{'outros-creditos':false}},
    {modules:['financeiro'],tabs:{financeiro:['receber']},financeiroTabs:['outros-creditos']},
  ]) {
    await userPatch('permissoes',malformed);
    assert.equal(await actorAllowed(),false,'Malformed or denied effective permissions cannot authorize the worker');
    await denied(()=>claim(access.operation,access.receivable));
  }
  await userPatch('permissoes',permissions);
  for(const schedule of [
    {ativo:true,dias:[0,1,2,3,4,5,6]},
    {ativo:true,dias:[0,1,2,3,4,5,6],horario_inicio:'00:00'},
    {ativo:true,dias:[0,1,2,3,4,5,6],horario_fim:'23:59'},
    {ativo:'false'},
    {ativo:true,dias:[],horario_inicio:'00:00',horario_fim:'23:59'},
  ]) {
    await userPatch('restricao_horario',schedule);
    assert.equal(await actorAllowed(),false,'Incomplete schedules return false, never nullable authorization');
    await denied(()=>claim(access.operation,access.receivable));
  }
  await userPatch('restricao_horario',null);
  await setting('identity',false); await denied(()=>claim(access.operation,access.receivable));
  await setting('identity',true);
  await db.query('UPDATE public.usuarios_sistema SET polo_ids=ARRAY[$2::uuid] WHERE auth_user_id=$1',[actor,otherPolo]);
  await userPatch('permissoes',{...permissions,allPolos:true});
  await denied(()=>claim(access.operation,access.receivable));
  await db.query('UPDATE public.usuarios_sistema SET polo_ids=ARRAY[]::uuid[] WHERE auth_user_id=$1',[actor]);
  assert.equal(await actorAllowed(),true,'Global authorization applies only without an explicit polo list');
  await db.query("UPDATE public.polos SET status='inativo' WHERE id=$1",[polo]);
  assert.equal(await actorAllowed(),false,'Global scope excludes inactive polos');
  await db.query("UPDATE public.polos SET status='ativo' WHERE id=$1",[polo]);
  await db.query('UPDATE public.usuarios_sistema SET polo_ids=ARRAY[$2::uuid] WHERE auth_user_id=$1',[actor,polo]);
  await userPatch('permissoes',permissions);
  await db.query('INSERT INTO public.perfis_acesso(id,permissoes) VALUES($1,$2::jsonb)',
    [id(50),JSON.stringify({modules:['financeiro'],tabs:{financeiro:['receber']}})]);
  await db.query('UPDATE public.usuarios_sistema SET perfil_acesso_id=$2,personalizar_permissoes=false WHERE auth_user_id=$1',[actor,id(50)]);
  await denied(()=>claim(access.operation,access.receivable));
  await userPatch('personalizar_permissoes',true);
  assert.equal(await actorAllowed(),true,'Explicit customization restores user permission precedence');
  await db.query('UPDATE public.usuarios_sistema SET perfil_acesso_id=NULL,personalizar_permissoes=false WHERE auth_user_id=$1',[actor]);
  assert.equal((await claim(access.operation,access.receivable)).mode,'LOCAL');

  const busy=await prepare(304,true);
  await db.query("UPDATE public.banese_reconciliation_queue SET state='LEASED',lease_until=clock_timestamp()+interval '1 minute' WHERE receivable_id=$1",[busy.receivable]);
  await fail(()=>claim(busy.operation,busy.receivable),'RECONCILIATION_BUSY');
  const txDrift=await prepare(305,true);
  await db.query('UPDATE public.payment_gateway_transactions SET amount=101 WHERE receivable_id=$1',[txDrift.receivable]);
  await fail(()=>claim(txDrift.operation,txDrift.receivable),'TRANSACTION_CHANGED');

  await setting('role','authenticated'); await db.exec('SET ROLE authenticated');
  await denied(()=>claim(operation,local));
  await denied(()=>db.query('SELECT * FROM internal_other_credit_cancellation.items'));
  await db.exec('RESET ROLE'); await db.exec('SET ROLE anon');
  await denied(()=>begin(operation,[local,bank])); await db.exec('RESET ROLE');
  await fail(()=>db.query('DELETE FROM internal_other_credit_cancellation.items WHERE receivable_id=$1',[local]),'HISTORY_IMMUTABLE');
  await fail(()=>db.query("UPDATE internal_other_credit_cancellation.operations SET reason='Different' WHERE id=$1",[operation]),'HISTORY_IMMUTABLE');
  const list=await scalar('SELECT public.listar_outros_creditos_secure($1) value',[polo]);
  assert.equal(list.find(row=>row.id===local).other_credit_cancellation_eligible,false);
  assert.equal(list.find(row=>row.id===id(200)).other_credit_cancellation_eligible,false);
  console.log('PASS other credit cancellation: 4 actual migrations, scoped ACL/replay, one lease, LOCAL/Banese completion, immutable history, ambiguous retries, payments, drift, external ownership and reconciliation guards.');
} finally { await db.close(); }
