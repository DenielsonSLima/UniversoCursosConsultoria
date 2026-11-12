import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite }=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture=name=>readFile(new URL(name,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const denies=(promise,code='22023')=>assert.rejects(promise,e=>e.code===code);
const body=(source,name)=>{const start=source.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.','\\.')}\\(`));
  assert(start>=0);return source.slice(start,source.indexOf('$function$;',source.indexOf('AS $function$',start))+12).replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION');};
test('canonical service location is resolved from frozen model/configuration and checked before a single fiscal lease',async t=>{
  const db=new PGlite();let row;
  const model={name:'MODELO ÚNICO SINTÉTICO',active:true,nationalServiceCode:'080201',nbsCode:'122020000',serviceDescription:'SERVIÇO SINTÉTICO',
    complementaryInfo:'COMPLEMENTO',operationIndicatorCode:'030101',peopleOptions:{version:2,issuerRole:'PROVIDER'},
    serviceOptions:{version:1,countryCode:'BRA',municipalityCode:'2803401',includeIbsCbs:true,governmentPurchase:false}};
  const cfg={municipalityCode:'2800207',portalAccess:'CERTIFICATE',credentialSource:'MATRIZ'};
  const snapshot={issuer:{cnpj:'00000000000272'},configuration:cfg,recipient:{document:'00000000191',name:'ALUNO SINTÉTICO'},
    model:{id:id(20),version:7,definition:model},source:{serviceDescription:'SERVIÇO SINTÉTICO'}};
  const command={modelId:id(20),modelVersion:7,amount:'1.00',competenceDate:'2026-11-10',serviceDate:'2026-11-10'};
  const call=async(action,input=null)=>(await db.query('SELECT public.nfse_individual_operation_core_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [id(11),id(10),id(2),'PRODUCAO','2026-11',id(50),action,row.previewId,input])).rows[0].value;
  const location=async(definition=model,configuration=cfg)=>(await db.query('SELECT private.resolve_nfse_operation_service_location($1,$2) value',
    [definition,configuration])).rows[0].value;
  try{
    await db.exec(await fixture('./nfse_individual_production.fixture.sql'));
    await db.exec(await fixture('./nfse_queue_emission.fixture.sql'));
    await db.exec(await fixture('./nfse_branch_representation.fixture.sql'));
    await db.exec(body(await sql('20261109015954_nfse_configuration_store.sql'),'private.authorize_nfse_configuration_scope'));
    await db.exec(body(await sql('20261110190702_nfse_fiscal_review_store.sql'),'private.nfse_review_valid_document'));
    await db.exec(body(await sql('20261111121000_nfse_shared_model_scope.sql'),'private.nfse_model_visible_to_polo'));
    await db.query('INSERT INTO public.usuarios_sistema VALUES($1,$2,NULL,false,$3)',[id(10),id(11),{modules:['configuracoes']}]);
    for(const [n,cnpj]of [[1,'00000000000191'],[2,'00000000000272']]){
      await db.query("INSERT INTO public.polos VALUES($1,$2,'ativo',$3,$4)",[id(n),cnpj,id(100),n===1]);
      await db.query('INSERT INTO public.test_scope_access VALUES($1,$2,$3,true)',[id(11),id(10),id(n)]);
    }
    await db.query("INSERT INTO private.nfse_configurations VALUES($1,'PRODUCAO',$2,$3,3,$4)",[id(2),id(1),cfg,id(11)]);
    await db.query("INSERT INTO private.nfse_certificates VALUES($1,'PRODUCAO',$2,'00000000000191',now()-interval '1 day',now()+interval '1 year',repeat('a',64),$3)",[id(1),id(80),id(11)]);
    await db.query("INSERT INTO private.nfse_models VALUES($1,$2,'PRODUCAO',$3,7,$4,$4)",[id(20),id(1),model,id(11)]);
    for(const name of ['20261111001718_nfse_individual_store.sql','20261112011358_nfse_branch_representation.sql',
      '20261112012759_nfse_operation_service_location.sql','20261112012806_nfse_prepared_service_location_guard.sql'])await db.exec(await sql(name));
    await db.query(`INSERT INTO private.nfse_individual_operations(actor_id,context_id,polo_id,environment,month,request_id,command,snapshot,configuration_version,certificate_fingerprint)
      VALUES($1,$2,$3,'PRODUCAO','2026-11',$4,$5,$6,3,repeat('a',64))`,[id(11),id(10),id(2),id(50),command,snapshot]);
    await db.exec("SET request.jwt.claims='{"+'"role":"service_role"'+"}'");
    row={previewId:(await db.query('SELECT id FROM private.nfse_individual_operations')).rows[0].id};row=await call('READ');
    await t.test('only explicit030101 provider domestic nongovernment IBS uses issuer location',async()=>{
      assert.deepEqual(await location(),{source:'ISSUER_ESTABLISHMENT',countryCode:'BRA',municipalityCode:'2800207',modelMunicipalityCode:'2803401',operationIndicatorCode:'030101'});
      for(const mutate of [m=>{m.operationIndicatorCode='030102';},m=>{m.operationIndicatorCode='030103';},m=>{m.peopleOptions.issuerRole='RECIPIENT';},
        m=>{m.serviceOptions.includeIbsCbs=false;},m=>{m.serviceOptions.governmentPurchase=null;},m=>{m.serviceOptions.governmentPurchase=true;}]){
        const copy=globalThis.structuredClone(model);mutate(copy);const result=await location(copy);assert.equal(result.source,'MODEL_FIXED');assert.equal(result.municipalityCode,'2803401');
      }
      assert.equal(await location(model,{municipalityCode:null}),null);
      assert.equal(await location({...model,serviceOptions:{...model.serviceOptions,municipalityCode:2803401}}),null);
    });
    const input=code=>{const dps=`DPS28002072${snapshot.issuer.cnpj}${row.series}${row.number.padStart(15,'0')}`;
      return{dpsId:dps,signedDpsXml:`<DPS Id="${dps}"><Signature/></DPS>`,fiscalInput:{environment:'PRODUCAO',series:row.series,number:row.number,
        issuedAt:row.issuedAt,competence:command.competenceDate,issuer:{taxId:{type:'CNPJ',value:snapshot.issuer.cnpj}},recipient:{taxId:{type:'CPF',value:snapshot.recipient.document},name:snapshot.recipient.name},
        service:{municipalityCode:code,nationalTaxCode:'080201',nbs:'122020000',description:'SERVIÇO SINTÉTICO',complementaryInfo:'COMPLEMENTO'},values:{serviceAmount:'1.00'},review:{ibscbs:'DECLARED_CONFIRMED'}}};};
    await t.test('PREPARE rejects the old fixed municipality and persists effective location without changing raw model v7',async()=>{
      await denies(call('PREPARE',input('2803401')));row=await call('PREPARE',input('2800207'));
      assert.equal(row.fiscalInput.service.municipalityCode,'2800207');assert.deepEqual(row.snapshot,snapshot);
      assert.equal(row.snapshot.model.id,id(20));assert.equal(row.snapshot.model.version,7);
      assert.equal(row.snapshot.model.definition.serviceOptions.municipalityCode,'2803401');
    });
    await t.test('CLAIM blocks older divergent prepared input, never changes signed bytes, and dispatches corrected input once',async()=>{
      await db.query("UPDATE private.nfse_individual_operations SET fiscal_input=jsonb_set(fiscal_input,'{service,municipalityCode}','\"2803401\"') WHERE id=$1",[row.previewId]);
      await denies(call('CLAIM'),'40001');assert.equal((await call('READ')).signedDpsXml,row.signedDpsXml);
      await db.query("UPDATE private.nfse_individual_operations SET fiscal_input=jsonb_set(fiscal_input,'{service,municipalityCode}','\"2800207\"') WHERE id=$1",[row.previewId]);
      assert.equal((await call('CLAIM')).dispatch,true);assert.equal((await call('CLAIM')).dispatch,false);
    });
    await t.test('historical reads and reconciliation state remain independent from a new location rule',async()=>{
      await db.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='ORIGINAL XML',fiscal_input=jsonb_set(fiscal_input,'{service,municipalityCode}','\"2803401\"') WHERE id=$1",[row.previewId]);
      const historical=await call('READ');assert.equal(historical.authorizedXml,'ORIGINAL XML');assert.equal(historical.fiscalInput.service.municipalityCode,'2803401');
      assert.deepEqual(historical.snapshot,snapshot);assert.equal((await call('CLAIM')).dispatch,false);
    });
  }finally{await db.close();}
});
