import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {definition,id,prepareServiceReceivables,scope} from './nfse_service_receivables.fixture.mjs';
const url=new URL(process.env.NFSE_TEST_DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/nfse_service_receivables_test'){
  throw Error('A disposable local nfse_service_receivables_test database is required');
}
const module=await import(pathToFileURL(resolve(process.env.NFSE_PG_MODULE)).href);
const {Client}=module.default??module;
async function connect(name){
  const db=new Client({connectionString:url.href,application_name:name});await db.connect();
  db.exec=sql=>db.query(sql);return db;
}
const value=async(db,sql,args)=>(await db.query(sql,args)).rows[0].value;
async function blocked(observer,waiter,holder){
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    if(await value(observer,'SELECT $2=any(pg_blocking_pids($1)) value',[waiter,holder]))return;
    await new Promise(setImmediate);
  }
  throw Error('Expected a PostgreSQL row-lock dependency');
}
test('PostgreSQL17: duplicate authorization and concurrent payment preserve one service title',async()=>{
  const admin=await connect('service-fixture'),a=await connect('service-authorize-a'),b=await connect('service-authorize-b');
  try{
    await prepareServiceReceivables(admin);
    for(const db of [a,b])await db.exec(`SET test.actor='${id(11)}';SET test.polo='${id(1)}';
      SET test.finance='true';SET test.receber='true';SET statement_timeout='10s'`);
    const pidA=await value(a,'SELECT pg_backend_pid() value'),pidB=await value(b,'SELECT pg_backend_pid() value');
    const save=async(input,request)=>(await value(admin,
      'SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
      [...Object.values(scope),request,input])).data.id;
    const op=async(service,operation)=>admin.query(`INSERT INTO private.nfse_individual_operations
      (id,polo_id,environment,state,snapshot,result) VALUES($1,$2,'PRODUCAO','PROCESSING',$3,'{"number":"8"}')`,
      [operation,scope.polo,{source:{kind:'PARTNER_SERVICE',id:service}}]);
    const authorize=(db,operation)=>db.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id=$1",[operation]);
    const financial=(await value(admin,
      'SELECT public.preview_nfse_service_financial_plan_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
      [...Object.values(scope),id(20),'100.01',definition.serviceDescription,
        {installments:3,firstDueDate:definition.dueDate,categoryId:definition.categoryId,issueBolePix:false}])).data.financialPlan;
    const service=await save({...definition,amount:'100.01',financialPlan:financial},id(500));await op(service,id(302));
    await a.exec('BEGIN');await authorize(a,id(302));
    const duplicate=authorize(b,id(302));
    await blocked(admin,pidB,pidA);await a.exec('COMMIT');await duplicate;
    assert.equal(await value(admin,'SELECT count(*)::integer value FROM private.nfse_service_receivables WHERE service_id=$1',[service]),3);
    assert.equal(await value(admin,'SELECT sum(c.valor)::text value FROM private.nfse_service_receivables l JOIN public.contas_receber c ON c.id=l.receivable_id WHERE service_id=$1',[service]),'100.01');
    assert.equal(await value(admin,'SELECT count(*)::integer value FROM public.contas_receber'),4);

    await admin.exec(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria)
      VALUES('${id(201)}','${id(1)}','${id(20)}','Existente para recebimento',99,'2026-11-30','PENDENTE','OUTROS_CREDITOS')`);
    const linked=await save({...definition,amount:'99.00',existingReceivableId:id(201),dueDate:null,categoryId:null},id(501));
    await op(linked,id(303));
    await a.exec('BEGIN');await a.exec(`UPDATE public.contas_receber SET status='PAGO',valor_pago=99 WHERE id='${id(201)}'`);
    const afterPayment=authorize(b,id(303));
    await blocked(admin,pidB,pidA);await a.exec('COMMIT');await afterPayment;
    assert.equal(await value(admin,'SELECT status value FROM public.contas_receber WHERE id=$1',[id(201)]),'PAGO');
    assert.equal(await value(admin,'SELECT count(*)::integer value FROM public.contas_receber'),5);
    assert.equal(await value(admin,'SELECT receivable_id value FROM private.nfse_service_receivables WHERE service_id=$1',[linked]),id(201));

    await a.exec('BEGIN');await a.query('SELECT id FROM public.contas_receber WHERE id=$1 FOR UPDATE',[id(201)]);
    const identityChange=b.query('UPDATE public.contas_receber SET valor=100 WHERE id=$1',[id(201)]).then(()=>null,error=>error);
    await blocked(admin,pidB,pidA);await a.exec('COMMIT');assert.equal((await identityChange).code,'55000');
    assert.equal(await value(admin,'SELECT valor value FROM public.contas_receber WHERE id=$1',[id(201)]),'99');
  }finally{
    await Promise.all([a.query('ROLLBACK'),b.query('ROLLBACK')]);
    await Promise.all([a.end(),b.end(),admin.end()]);
  }
});
