import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const modulePath=process.env.NFSE_ACCOUNTING_PGLITE_MODULE||process.env.NFSE_TEST_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const xml=({cbs='0.01',ibs='0.02',amount='10.01'}={})=>`<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><dhProc>2026-11-15T12:00:00Z</dhProc><DPS><infDPS><dCompet>2026-11-15</dCompet><toma><xNome>Teste &amp; Escola</xNome><CPF>00000000000</CPF></toma><serv><cServ><cTribNac>080201</cTribNac><cNBS>122020000</cNBS></cServ></serv><valores><vServPrest><vServ>${amount}</vServ></vServPrest></valores><IBSCBS><vCBS>99999.99</vCBS></IBSCBS></infDPS></DPS><IBSCBS><totCIBS><gCBS>${cbs===null?'':`<vCBS>${cbs}</vCBS>`}</gCBS><gIBS>${ibs===null?'':`<vIBSTot>${ibs}</vIBSTot>`}<gIBSUF><vIBSUF>777.77</vIBSUF></gIBSUF></gIBS></totCIBS></IBSCBS></infNFSe></NFSe>`;

test('RPC v3 fiscal executado em PostgreSQL isolado: XML, agregados e escopo',async t=>{
 const db=new PGlite();
 const q=async(sql,args)=>(await db.query(sql,args)).rows[0]?.value;
 const report=(mode='GERAL',polo=1,context=10,environment='PRODUCAO',from='2026-11-01',to='2026-11-30')=>q('select public.get_nfse_accounting_report_v3_secure($1,$2,$3,$4,$5,$6,$7) value',[id(context),id(polo),environment,'2026-11',from,to,mode]);
 const reset=()=>db.exec('truncate private.nfse_operation_source_projection,private.nfse_individual_operations,private.nfse_confirmed_cancellations');
 const insert=async(n,polo=1,options={},state='AUTHORIZED',environment='PRODUCAO')=>{
  await db.query('insert into private.nfse_individual_operations values($1,$2)',[id(n),xml(options)]);
  await db.query(`insert into private.nfse_operation_source_projection(operation_id,source_id,source_kind,polo_id,environment,month,issue_state,state,snapshot,command,result,number,access_key) values($1,$1,'PARTNER_SERVICE',$2,$3,'2026-11',$4,$4,'{}','{"amount":"99999.99"}','{}',$5,$6)`,[id(n),id(polo),environment,state,String(n),String(n).padStart(50,'0')]);
 };
 try {
  await db.exec(await readFile(new URL('./nfse_issued_period.fixture.sql',import.meta.url),'utf8'));
  await db.exec(`create table public.polos(id uuid primary key,nome text,company_id uuid,is_matriz boolean,status text,cnpj text,cidade text,estado text);
   insert into public.polos values('${id(1)}','Matriz','${id(99)}',true,'ativo',null,null,null),('${id(2)}','Filial','${id(99)}',false,'ativo',null,null,null),('${id(3)}','Vazio','${id(99)}',false,'ativo',null,null,null),('${id(4)}','Outra','${id(98)}',true,'ativo',null,null,null);
   create function public.is_active_status(text) returns boolean language sql as $$select $1='ativo'$$;
   create or replace function private.authorize_nfse_model_scope(c uuid,p uuid,e text,m text) returns void language plpgsql as $$begin
   if c is null or c not in('${id(10)}','${id(11)}') or e is distinct from 'PRODUCAO' or (c='${id(11)}' and p is distinct from '${id(1)}'::uuid) then raise insufficient_privilege;end if;end$$;`);
  const original=await readFile(new URL('../migrations/20261111014607_nfse_issued_document_filters.sql',import.meta.url),'utf8');
  await db.exec(original.slice(original.indexOf('CREATE FUNCTION private.nfse_authorized_xml_emitted_at'),original.indexOf('REVOKE ALL ON FUNCTION private.nfse_authorized_xml_emitted_at')).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
  await db.exec(await readFile(new URL('../migrations/20261117133452_nfse_accounting_tax_summary.sql',import.meta.url),'utf8'));
  await t.test('paths canônicos, entidades XML escapadas e soma decimal exata sem adicionar componentes IBS',async()=>{
   await insert(101);await insert(102,2,{cbs:'0.02',ibs:'0.01',amount:'20.02'});
   await insert(103,4,{cbs:'999.00'});await insert(104,1,{cbs:'999.00'},'AUTHORIZED','HOMOLOGACAO');
   const d=(await report()).data;
   assert.equal(d.validItems,2);assert.equal(d.totalAmount,'30.03');
   assert.deepEqual(d.taxSummary,{cbsAmount:'0.03',ibsAmount:'0.03',cbsReportedCount:2,ibsReportedCount:2});
   assert.equal(d.pages.flat()[0].recipientName,'Teste & Escola');assert.deepEqual(d.byCode,[]);
   assert.equal((await report('POLO',2)).data.taxSummary.cbsAmount,'0.02');
  });
  await t.test('zero explícito não é ausência; cobertura parcial não publica subtotal',async()=>{
   await reset();await insert(101,1,{cbs:'0.00',ibs:'0'});
   assert.deepEqual((await report()).data.taxSummary,{cbsAmount:'0.00',ibsAmount:'0.00',cbsReportedCount:1,ibsReportedCount:1});
   await insert(102,2,{cbs:null,ibs:'0.02'});
   assert.deepEqual((await report()).data.taxSummary,{cbsAmount:null,ibsAmount:'0.02',cbsReportedCount:1,ibsReportedCount:2});
   await reset();await insert(101,1,{cbs:null,ibs:null});
   assert.deepEqual((await report()).data.taxSummary,{cbsAmount:null,ibsAmount:null,cbsReportedCount:0,ibsReportedCount:0});
   await reset();assert.equal((await report()).data.taxSummary.cbsAmount,null);
  });
  await t.test('cancelada confirmada e não autorizadas não contam, cancelamento pendente conta',async()=>{
   await reset();await insert(101);await insert(102,1,{cbs:'999.00',ibs:null});
   await db.query('insert into private.nfse_confirmed_cancellations values($1)',[id(102)]);
   for(const [i,state] of ['REJECTED','BLOCKED','PROCESSING','AWAITING_CONFIRMATION','PREVIEWED'].entries())await insert(200+i,1,{cbs:'999.00'},state);
   await db.query("update private.nfse_operation_source_projection set state='CANCELLED' where operation_id=$1",[id(101)]);
   const d=(await report()).data;
   assert.equal(d.validItems,1);assert.equal(d.taxSummary.cbsAmount,'0.01');assert.equal(d.totalItems,6);
   assert.equal(d.pages.flat().find(r=>r.id===id(101)).state,'CANCELLATION_PENDING');
   for(const row of d.pages.flat().filter(r=>r.dateSource==='CREATED'))assert.equal(row.cbsAmount,null);
  });
  await t.test('formatos inválidos não viram valor, XML inseguro ou inválido é recusado',async()=>{
   for(const bad of ['-0.01','1,20','1.001','1e2','NaN']){
    await reset();await insert(101,1,{cbs:bad});assert.equal((await report()).data.taxSummary.cbsAmount,null);
   }
   for(const bad of ['<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>','<broken>','<NFSe/>','<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe/><infNFSe/></NFSe>'])
    assert.equal(await q('select private.nfse_accounting_xml_fields_v3($1) value',[bad]),null);
  });
  await t.test('escopo matriz, acesso parcial, ambiente e datas falham fechados; grants mínimos',async()=>{
   await assert.rejects(()=>report('GERAL',2),/exclusivo da matriz/);
   await assert.rejects(()=>report('GERAL',1,11),/insufficient_privilege/);
   await assert.rejects(()=>report('POLO',1,88),/insufficient_privilege/);
   await assert.rejects(()=>report('POLO',1,10,'HOMOLOGACAO'),/insufficient_privilege/);
   await assert.rejects(()=>report('POLO',1,10,'PRODUCAO','2026-02-30'),/Datas de emissão/);
   await assert.rejects(()=>report('POLO',1,10,'PRODUCAO','2026-12-01'),/Intervalo/);
   await assert.rejects(()=>report('INVALID'),/modelo e período/);
   const fn='public.get_nfse_accounting_report_v3_secure(uuid,uuid,text,text,text,text,text)';
   assert.deepEqual(await q(`select jsonb_build_object('anon',has_function_privilege('anon','${fn}','execute'),'auth',has_function_privilege('authenticated','${fn}','execute'),'service',has_function_privilege('service_role','${fn}','execute'),'xml',has_function_privilege('authenticated','private.nfse_accounting_xml_fields_v3(text)','execute')) value`),{anon:false,auth:true,service:false,xml:false});
   const before=await q('select jsonb_agg(to_jsonb(t)) value from private.nfse_individual_operations t');await report();
   assert.deepEqual(await q('select jsonb_agg(to_jsonb(t)) value from private.nfse_individual_operations t'),before);
  });
 }finally{await db.close();}
});
