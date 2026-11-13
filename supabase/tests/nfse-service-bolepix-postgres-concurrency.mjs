import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { prepareServiceBolepix } from './nfse_service_bolepix.fixture.mjs';
import { definition,id,scope } from './nfse_service_receivables.fixture.mjs';
if (!process.env.NFSE_SERVICE_PG_MODULE || !process.env.NFSE_SERVICE_TEST_DATABASE_URL) {
  throw new Error('Requires an empty disposable PostgreSQL17 database and NFSE_SERVICE_PG_MODULE/NFSE_SERVICE_TEST_DATABASE_URL.');
}
const databaseUrl=new URL(process.env.NFSE_SERVICE_TEST_DATABASE_URL);
if (!['postgres:','postgresql:'].includes(databaseUrl.protocol)
  || !['localhost','127.0.0.1'].includes(databaseUrl.hostname)
  || databaseUrl.pathname!=='/nfse_service_bolepix_test') {
  throw new Error('This fixture only accepts the local disposable nfse_service_bolepix_test database.');
}
const module=await import(pathToFileURL(process.env.NFSE_SERVICE_PG_MODULE).href);
const { Client }=module.default??module;
const clients=await Promise.all([0,1,2].map(async()=>{
  const client=new Client({connectionString:process.env.NFSE_SERVICE_TEST_DATABASE_URL});await client.connect();return client;
}));
const [admin,a,b]=clients;
const value=async(client,sql,args)=>(await client.query(sql,args)).rows[0].value;
const call=(client,name,args=[])=>value(client,`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
try {
  assert.equal(Math.floor(Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num)/10000),17);
  await prepareServiceBolepix({exec:sql=>admin.query(sql),query:(sql,args)=>admin.query(sql,args)});
  const input={installments:1,firstDueDate:'2026-11-30',categoryId:id(40),monthlyInterestPercent:0,penaltyPercent:0,
    discountType:'FIXO',discountValue:0,discountDaysBeforeDue:0,periodicity:'MENSAL_CALENDARIO',issueBolePix:true};
  const plan=(await call(admin,'preview_nfse_service_financial_plan_secure',[...Object.values(scope),id(20),'120.00','Descrição',input])).data;
  const saved=await call(admin,'save_nfse_partner_service_secure',[...Object.values(scope),id(500),{...definition,serviceDescription:'Descrição',financialPlan:plan.financialPlan}]);
  await admin.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,authorized_xml)
    VALUES($1,$2,'PRODUCAO','PROCESSING',$3,'{"number":"9"}',$4)`,[id(302),id(1),
    {source:{kind:'PARTNER_SERVICE',id:saved.data.id}},'<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>9</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Descrição</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>']);
  await admin.query(`UPDATE private.nfse_individual_operations SET environment='PRODUCAO',state='AUTHORIZED' WHERE id=$1`,[id(302)]);
  await admin.query('UPDATE private.nfse_service_bolepix_control SET enabled=true');
  for(const client of clients)await client.query(`SET test.actor='${id(11)}';SET test.polo='${id(1)}';SET test.receber='true';SET test.role='service_role';SET statement_timeout='2s'`);
  await a.query('BEGIN');
  const first=await call(a,'claim_nfse_service_bolepix_job_internal');
  assert(first?.jobId);
  assert.equal(await call(b,'claim_nfse_service_bolepix_job_internal'),null,'Concurrent worker skips the locked job.');
  await a.query('COMMIT');
  assert.equal(await call(b,'claim_nfse_service_bolepix_job_internal'),null,'An active lease never duplicates dispatch.');
  await a.query('BEGIN');
  assert.equal((await call(a,'get_nfse_service_bolepix_material_internal',[first.jobId,first.leaseToken])).action,'CREATE');
  await assert.rejects(call(b,'get_nfse_service_bolepix_material_internal',[first.jobId,first.leaseToken]),error=>error.code==='55P03');
  await a.query('COMMIT');
  await admin.query("UPDATE private.nfse_service_bolepix_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[first.jobId]);
  const second=await call(b,'claim_nfse_service_bolepix_job_internal');
  assert.equal(second.jobId,first.jobId);assert.notEqual(second.leaseToken,first.leaseToken);
  await assert.rejects(call(a,'get_nfse_service_bolepix_material_internal',[first.jobId,first.leaseToken]),error=>error.code==='40001');
  const current=await call(b,'get_nfse_service_bolepix_material_internal',[second.jobId,second.leaseToken]);
  assert.equal(current.receivable.gateway_creation_token,second.leaseToken,'Only the current dispatch lease may mark a new POST.');
  assert.equal(second.jobId,first.jobId,'The durable one-title bank intent survives lease renewal.');
  console.log('PASS PostgreSQL17: SKIP LOCKED single-flight, NOWAIT material, expired lease nonce and persistent one-title intent.');
}finally{
  await Promise.all(clients.map(async client=>{try{await client.query('ROLLBACK');}finally{await client.end();}}));
}
