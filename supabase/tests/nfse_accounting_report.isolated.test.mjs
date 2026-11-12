import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const pgliteModule=process.env.NFSE_ACCOUNTING_PGLITE_MODULE||process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(pgliteModule ? pathToFileURL(resolve(pgliteModule)).href : '@electric-sql/pglite');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const xml=({amount='10.01',code='080201',date='2026-11-15T12:00:00Z',name='Empresa &amp; Teste'}={})=>`<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><dhProc>${date}</dhProc><DPS><infDPS><dCompet>2026-10-31</dCompet><toma><xNome>${name}</xNome><CPF>00000000000</CPF></toma><serv><cServ><cTribNac>${code}</cTribNac><cNBS>122020000</cNBS></cServ></serv><valores><vServPrest>${amount===null?'':`<vServ>${amount}</vServ>`}</vServPrest><trib><tribMun><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores></infDPS></DPS><valores><vISSQN>0.00</vISSQN></valores></infNFSe></NFSe>`;

test('relatório contábil: XML autorizado, escopo matriz, agregados, páginas e somente leitura',async t=>{
 const db=new PGlite();const query=async(sql,args)=>(await db.query(sql,args)).rows[0]?.value;
 const report=(mode='GERAL',polo=id(1),context=id(10),from='2026-11-01',to='2026-11-30')=>query('select public.get_nfse_accounting_report_secure($1,$2,$3,$4,$5,$6,$7) value',[context,polo,'PRODUCAO','2026-11',from,to,mode]);
 const insert=async(n,polo=1,options={})=>{
   await db.query('insert into private.nfse_individual_operations values($1,$2)',[id(n),xml(options)]);
   await db.query(`insert into private.nfse_operation_source_projection(operation_id,source_id,source_kind,polo_id,environment,month,issue_state,state,snapshot,command,result,number,access_key)
    values($1,$1,'PARTNER_SERVICE',$2,'PRODUCAO','2026-10','AUTHORIZED','AUTHORIZED',$3,'{"amount":"99999.99"}','{}',$4,$5)`,
    [id(n),id(polo),{recipient:{name:'Não usar cadastro atual'},command:{serviceDate:'2026-10-31'}},String(n),String(n).padStart(50,'0')]);
 };
 try {
  await db.exec(await readFile(new URL('./nfse_issued_period.fixture.sql',import.meta.url),'utf8'));
  await db.exec(`create table public.polos(id uuid primary key,nome text,company_id uuid,is_matriz boolean,status text);
    insert into public.polos values('${id(1)}','Matriz','${id(99)}',true,'ativo'),('${id(2)}','Filial','${id(99)}',false,'ativo'),
      ('${id(3)}','Sem notas','${id(99)}',false,'ativo'),('${id(4)}','Outra empresa','${id(98)}',true,'ativo');
    create function public.is_active_status(text) returns boolean language sql as $$select $1='ativo'$$;
    create or replace function private.authorize_nfse_model_scope(c uuid,p uuid,e text,m text) returns void language plpgsql as $$begin
      if c not in('${id(10)}','${id(11)}') or e<>'PRODUCAO' or (c='${id(11)}' and p<>'${id(1)}') then raise insufficient_privilege;end if;end$$;`);
  const original=await readFile(new URL('../migrations/20261111014607_nfse_issued_document_filters.sql',import.meta.url),'utf8');
  await db.exec(original.slice(original.indexOf('CREATE FUNCTION private.nfse_authorized_xml_emitted_at'),original.indexOf('REVOKE ALL ON FUNCTION private.nfse_authorized_xml_emitted_at')).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
  await db.exec(await readFile(new URL('../migrations/20261111120000_nfse_issued_period_report.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261112121741_nfse_accounting_xml_fields.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261112121751_nfse_accounting_report.sql',import.meta.url),'utf8'));
  await insert(101);await insert(102,2,{amount:'20.02',code:'170101'});await insert(103,4,{amount:'500.00'});
  await insert(104,1,{amount:'900.00'});await db.query('insert into private.nfse_confirmed_cancellations values($1)',[id(104)]);
  await insert(105,1,{date:'2026-12-01T03:00:00Z',amount:'300.00'});
  await t.test('usa XML, exclui canceladas/outra empresa, total exato e inclui polo sem notas',async()=>{
    const data=(await report()).data;assert.equal(data.totalItems,2);assert.equal(data.totalAmount,'30.03');
    assert.equal(data.pages.length,1);assert.equal(data.pages[0][0].recipientName,'Empresa & Teste');
    assert.equal(data.pages[0][0].serviceDate,'2026-10-31');assert.equal(data.pages[0][0].competenceDate,'2026-10-31');
    assert.deepEqual(data.byCode,[{code:'080201',count:1,amount:'10.01'},{code:'170101',count:1,amount:'20.02'}]);
    assert.equal(data.byPolo.find(p=>p.poloId===id(3)).amount,'0.00');
    assert.equal(data.summaryPages.flat().length,6);
    const one=(await report('POLO',id(2))).data;assert.equal(one.totalItems,1);assert.equal(one.totalAmount,'20.02');
    assert.equal(one.summaryPages.flat().length,2);
  });
  await t.test('matriz não permite consolidado parcial nem contexto não autorizado',async()=>{
    await assert.rejects(()=>report('GERAL',id(2)),/exclusivo da matriz/);
    await assert.rejects(()=>report('GERAL',id(1),id(11)),/insufficient_privilege/);
    await assert.rejects(()=>report('POLO',id(1),id(88)),/insufficient_privilege/);
    await assert.rejects(()=>report('POLO',id(1),id(10),'2026-02-30'),/Datas de emissão/);
    await assert.rejects(()=>report('POLO',id(1),id(10),'2026-12-01','2026-11-01'),/Intervalo/);
  });
  await t.test('valores desconhecidos não geram soma parcial e parser XML rejeita entidades/malformed',async()=>{
    await insert(106,1,{amount:null});const data=(await report()).data;assert.equal(data.totalAmount,null);
    assert.equal(data.byCode.find(c=>c.code==='080201').amount,null);assert.equal(data.byPolo.find(p=>p.poloId===id(1)).amount,null);
    for(const payload of ['<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>','<broken>', '<NFSe/>'])
      assert.equal(await query('select private.nfse_accounting_xml_fields($1) value',[payload]),null);
    await db.query('delete from private.nfse_operation_source_projection where operation_id=$1',[id(106)]);
  });
  await t.test('página de 8 notas determinística sem perda e recursos privados sem grants',async()=>{
    for(let n=110;n<128;n++)await insert(n,1);
    const data=(await report()).data;assert.deepEqual(data.pages.map(p=>p.length),[8,8,4]);
    assert.equal(data.pages.flat().length,data.totalItems);assert.equal(new Set(data.pages.flat().map(r=>r.id)).size,20);
    const grants=await query(`select jsonb_build_object('anon',has_function_privilege('anon','public.get_nfse_accounting_report_secure(uuid,uuid,text,text,text,text,text)','execute'),
      'auth',has_function_privilege('authenticated','public.get_nfse_accounting_report_secure(uuid,uuid,text,text,text,text,text)','execute'),
      'xml',has_function_privilege('authenticated','private.nfse_accounting_xml_fields(text)','execute')) value`);
    assert.deepEqual(grants,{anon:false,auth:true,xml:false});
  });
 } finally {await db.close();}
});
