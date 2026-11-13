import {readFile} from 'node:fs/promises';
import {prepareServiceCancellation,call,value} from './nfse_service_cancellation.fixture.mjs';
import {id,scope,definition} from './nfse_service_receivables.fixture.mjs';
export {id,scope,call,value};
export const groupMigrations=['20261112225000_nfse_service_receivable_capabilities.sql',
  '20261112225100_nfse_service_receivable_groups.sql'];
const migration=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
export async function prepareServiceGroups(db){
  await prepareServiceCancellation(db);
  await db.exec(`CREATE SCHEMA internal_academic;
    ALTER TABLE public.contas_receber ADD COLUMN regra_financeira_tecnica_snapshot jsonb;
    CREATE TABLE public.banese_cancellation_outbox(receivable_id uuid,state text);
    CREATE TABLE internal_academic.technical_manual_cycle_runs(state text,receivable_ids uuid[]);`);
  const ledger=await migration('20261014183502_financial_payment_ledger.sql');
  await db.exec(ledger.slice(ledger.indexOf('CREATE FUNCTION internal_financial_payments.cents('),
    ledger.indexOf('create function internal_financial_payments.actor_allowed(')));
  await db.exec(await migration('20261014183611_receivable_payment_capabilities.sql'));
  for(const name of groupMigrations)await db.exec(await migration(name));
  await db.exec(`SET test.role='authenticated';UPDATE public.parceiros SET nome='Alfa Serviços' WHERE id='${id(20)}';
    INSERT INTO public.parceiros(id,nome,cpf_cnpj,tipo,status,polo_id,polo_ids)
      VALUES('${id(21)}','Beta Serviços','00000000191','PF','ativo','${id(1)}','{}'),
        ('${id(22)}','Gama Serviços','00000000191','PF','ativo','${id(1)}','{}');`);
}
export async function createGroupService(db,n,{partner=id(20),installments=1,amount='120.00'}={}){
  const description=`Serviço sintético ${n}`;
  const plan=(await call(db,'preview_nfse_service_financial_plan_secure',[...Object.values(scope),partner,amount,description,
    {installments,firstDueDate:definition.dueDate,categoryId:id(40),issueBolePix:false}])).data.financialPlan;
  const saved=await call(db,'save_nfse_partner_service_secure',[...Object.values(scope),id(n),{
    ...definition,partnerId:partner,amount,serviceDescription:description,financialPlan:plan}]);
  const operation=id(n+10000);
  await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,actor_id,context_id,month)
    VALUES($1,$2,'PRODUCAO','PROCESSING',$3,$4,$5,$6,'2026-11')`,[operation,id(1),
    {source:{kind:'PARTNER_SERVICE',id:saved.data.id}},{number:String(n)},id(11),id(10)]);
  await db.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id=$1",[operation]);
  const titles=(await db.query('SELECT receivable_id id FROM private.nfse_service_receivables WHERE service_id=$1 ORDER BY installment_number',[saved.data.id])).rows.map(r=>r.id);
  return {operation,service:saved.data.id,titles};
}
export const filters=(status='ALL',search=null,polo=id(1))=>[polo,search,null,null,status];
export const groups=(db,options={})=>call(db,'get_servicos_receber_groups',[
  ...filters(options.status,options.search,options.polo),options.page??1,options.size??20]);
export const items=(db,partner,options={})=>call(db,'listar_servicos_receber_group_items',[
  ...filters(options.status,options.search,options.polo),partner,options.page??1,options.size??25]);
