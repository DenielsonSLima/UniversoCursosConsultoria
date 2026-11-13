import {readFile} from 'node:fs/promises';
import {prepareServiceBolepix,installServiceBolepixScheduler} from './nfse_service_bolepix.fixture.mjs';
import {id,scope,definition} from './nfse_service_receivables.fixture.mjs';
export const cancellationMigrations=[
  '20261112221900_nfse_service_cancellation_store.sql',
  '20261112221910_nfse_service_cancellation_proof.sql',
  '20261112222000_nfse_service_cancellation_material.sql',
  '20261112222100_nfse_service_cancellation_commands.sql',
  '20261112222200_nfse_service_cancellation_completion.sql',
  '20261112222300_nfse_service_cancellation_routes.sql',
];
export const value=async(db,query,args=[])=>(await db.query(query,args)).rows[0].value;
export const call=(db,name,args=[])=>value(db,`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
export const eventXml=key=>`<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT${key}101101001"><nSeqEvento>001</nSeqEvento><pedRegEvento><infPedReg Id="PRE${key}101101"><tpAmb>1</tpAmb><chNFSe>${key}</chNFSe><e101101><cMotivo>1</cMotivo></e101101></infPedReg></pedRegEvento></infEvento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/></evento>`;
export async function prepareServiceCancellation(db){
  await prepareServiceBolepix(db);await installServiceBolepixScheduler(db);
  await db.exec(`ALTER TABLE private.nfse_individual_operations ADD COLUMN actor_id uuid,ADD COLUMN context_id uuid,ADD COLUMN month text;
    ALTER TABLE private.nfse_individual_cancellations ADD COLUMN result jsonb,ADD COLUMN access_key text,
      ADD COLUMN event_reference_id text,ADD COLUMN event_input jsonb,ADD COLUMN signed_event_xml text,ADD COLUMN event_xml text;
    CREATE TABLE public.financial_payment_events(id uuid PRIMARY KEY,source_kind text,source_id uuid,received_amount numeric,
      original_cents bigint DEFAULT 2000000,payment_cents bigint DEFAULT 2000,principal_cents bigint DEFAULT 2000,
      discount_cents bigint DEFAULT 0,reversed_at timestamptz,payment_date date DEFAULT '2026-11-12',created_at timestamptz DEFAULT now());
    CREATE TABLE public.financial_payment_components(event_id uuid,account_id uuid,method text,sequence integer);
    CREATE TABLE public.receivable_manual_settlements(receivable_id uuid);
    CREATE TABLE public.banese_reconciliation_queue(receivable_id uuid PRIMARY KEY,state text,lease_run_id uuid,
      lease_until timestamptz,next_check_at timestamptz,last_result text,updated_at timestamptz);
    CREATE TABLE internal_other_credit_cancellation.items(receivable_id uuid PRIMARY KEY);
    CREATE FUNCTION private.authorize_nfse_individual_internal(p_actor uuid,p_context uuid,p_polo uuid,p_env text,p_month text)
      RETURNS void LANGUAGE plpgsql AS $$BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.test_context WHERE id=p_context AND actor=p_actor AND allowed AND p_polo=ANY(polos))
        OR p_env<>'PRODUCAO' OR p_month<>'2026-11' THEN RAISE EXCEPTION 'NFSE_DENIED' USING ERRCODE='42501'; END IF;END$$;
    UPDATE private.nfse_service_bolepix_control SET enabled=true;`);
  for(const name of cancellationMigrations)await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  // Load the actual shared projection guard: history cannot be hidden behind
  // CANCELADO and a partial payment cannot be silently promoted to PAGO.
  const ledger=await readFile(new URL('../migrations/20261014183502_financial_payment_ledger.sql',import.meta.url),'utf8');
  await db.exec(ledger.slice(ledger.indexOf('CREATE FUNCTION internal_financial_payments.money('),ledger.indexOf('CREATE FUNCTION internal_financial_payments.cents(')));
  const preview=await readFile(new URL('../migrations/20261014183505_financial_payment_preview.sql',import.meta.url),'utf8');
  await db.exec(preview.slice(preview.indexOf('CREATE FUNCTION internal_financial_payments.summary('),preview.indexOf('CREATE FUNCTION internal_financial_payments.preview_for_actor(')));
  const guard=await readFile(new URL('../migrations/20261014183512_financial_payment_source_guards.sql',import.meta.url),'utf8');
  await db.exec(guard.slice(guard.indexOf('CREATE FUNCTION internal_financial_payments.protect_source('),guard.indexOf('CREATE TRIGGER zzz_financial_payment_source_guard')));
  await db.exec('CREATE TRIGGER actual_payment_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.protect_source()');
}
export async function service(db,n,{bolepix=false,installments=1,amount='20000.00'}={}){
  await db.exec("SET test.role='authenticated';SET test.finance='true';SET test.receber='true'");
  const preview=(await call(db,'preview_nfse_service_financial_plan_secure',[...Object.values(scope),id(20),amount,
    definition.serviceDescription,{installments,firstDueDate:definition.dueDate,categoryId:id(40),issueBolePix:bolepix}])).data;
  const saved=await call(db,'save_nfse_partner_service_secure',[...Object.values(scope),id(n),{
    ...definition,amount,financialPlan:preview.financialPlan}]);
  const operation=id(n+10000),key=String(n).padStart(50,'0');
  await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,authorized_xml,actor_id,context_id,month)
    VALUES($1,$2,'PRODUCAO','PROCESSING',$3,$4,$5,$6,$7,'2026-11')`,[operation,id(1),
    {source:{kind:'PARTNER_SERVICE',id:saved.data.id}},{number:String(n),accessKey:key},
    `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>${n}</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Descrição fiscal ${n}</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>`,id(11),id(10)]);
  await db.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id=$1",[operation]);
  const titles=(await db.query('SELECT receivable_id id FROM private.nfse_service_receivables WHERE service_id=$1 ORDER BY installment_number',[saved.data.id])).rows.map(r=>r.id);
  await db.exec("SET test.role='service_role'");
  return {operation,key,titles,cancellation:id(n+20000),serviceId:saved.data.id};
}
export async function cancelFiscal(db,s,{valid=true}={}){
  await db.query(`INSERT INTO private.nfse_individual_cancellations(id,operation_id,state,access_key,event_reference_id,event_input,signed_event_xml,result,event_xml)
    VALUES($1,$2,'CANCELLED',$3,$4,$5,'synthetic-signed-pedRegEvento',$6,$7)`,[s.cancellation,s.operation,s.key,
    `PRE${s.key}101101`,{environment:'PRODUCAO',eventCode:'101101',accessKey:s.key},
    {state:'CANCELLED',code:'CONFIRMED',eventCode:'101101',accessKey:s.key,eventId:`EVT${s.key}101101001`},
    valid?eventXml(s.key):'<evento/>']);
}
export const proof=(outcome,extra={})=>({outcome,remoteStatus:outcome==='LOCAL_CANCELLED'?'LOCAL':outcome==='PAID'?'PAID':'CANCELED',
  confirmedAt:new Date().toISOString(),evidenceFingerprint:'a'.repeat(64),...extra});
export async function dispatchAmbiguous(db){
  const job=await call(db,'claim_nfse_service_bolepix_job_internal');
  const material=await call(db,'get_nfse_service_bolepix_material_internal',[job.jobId,job.leaseToken]);
  await db.query(`UPDATE public.contas_receber SET gateway_boleto_nosso_numero='000004681',gateway_boleto_convenio='123',
    gateway_boleto_agencia='033' WHERE id=$1`,[job.receivableId]);
  await call(db,'claim_banese_api_submission_attempt',[job.receivableId,'production','123','033','000004681',
    material.receivable.valor,'2026-11-30',job.leaseToken]);
  return {job,material};
}
export const bankProof=terms=>proof('CANCELLED',{situationCode:5,convenio:'123',nossoNumero:'000004681',
  strictEffectivePayments:true,identityValidated:true,termsValidated:true,paymentsCount:0,mutationAttempted:true,alreadyCanceled:false,
  bankSlipDigitableLine:'04793303180064900000704681047223515390002000000',
  bankSlipBarcode:'04795153900020000003303100649000000468104722',financialTerms:terms});
