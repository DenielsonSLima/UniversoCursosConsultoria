import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite }=await import(process.env.NFSE_TEST_PGLITE_MODULE
  ?pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href:'@electric-sql/pglite');
const sql=(name)=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const cpf=base=>{let value=base;for(const length of [10,11]) {
  const sum=[...value].reduce((total,digit,i)=>total+Number(digit)*(length-i),0);
  value+=String((sum*10%11)%10);}return value;};
const cnpj=base=>{let value=base;for(const weights of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
  const remainder=[...value].reduce((total,digit,i)=>total+Number(digit)*weights[i],0)%11;
  value+=String(remainder<2?0:11-remainder);}return value;};
const denies=(promise,code='22023')=>assert.rejects(promise,error=>error.code===code);

test('production preparation and durable own-document issue/cancellation reauthorize every command',async t=>{
  const db=new PGlite(); const issuer=cnpj('000000000001'); const document=cpf('000000001');
  const material={certificatePem:'-----BEGIN CERTIFICATE-----\nSYNTHETIC',chainPem:'',privateKeyPem:'-----BEGIN RSA PRIVATE KEY-----\nSYNTHETIC'};
  const call=async(fn,args)=>(await db.query(`SELECT public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
  const setup=(changes={})=>call('prepare_nfse_production_individual_secure',Object.values({context:id(10),polo:id(1),env:'PRODUCAO',month:'2026-11',
    request:id(40),model:id(20),modelVersion:1,cfgVersion:3,fingerprint:'a'.repeat(64),...changes}));
  const op=(action,changes={})=>call('nfse_individual_operation_internal',Object.values({actor:id(11),context:id(10),polo:id(1),env:'PRODUCAO',month:'2026-11',
    request:id(50),action,preview:null,input:null,...changes}));
  const cancel=(action,changes={})=>call('nfse_individual_cancellation_internal',Object.values({actor:id(11),context:id(10),polo:id(1),env:'PRODUCAO',month:'2026-11',
    request:id(50),action,preview:null,cancel:null,input:null,...changes}));
  let modelId; let row; let cancellation; let prepared; const key='0'.repeat(49)+'1';
  try {
    await db.exec(await readFile(new URL('./nfse_individual_production.fixture.sql',import.meta.url),'utf8'));
    const validator=await sql('20261110190702_nfse_fiscal_review_store.sql');
    await db.exec(validator.slice(validator.indexOf('CREATE FUNCTION private.nfse_review_valid_document'),validator.indexOf('CREATE FUNCTION private.nfse_fiscal_review_basis')));
    await db.query('INSERT INTO public.test_authorization VALUES($1,$2,$3,true)',[id(11),id(10),id(1)]);
    await db.query("INSERT INTO public.polos VALUES($1,$2,'ativo'),($3,$2,'ativo')",[id(1),issuer,id(2)]);
    await db.query(`INSERT INTO public.parceiros(id,nome,cpf_cnpj,tipo,status,polo_id,polo_ids)
      VALUES($1,'TOMADOR SINTÉTICO',$2,'PF','ativo',$3,'{}')`,[id(30),document,id(1)]);
    const definition={name:'MODELO SINTÉTICO',active:true,nationalServiceCode:'080201',nbsCode:'122020000',serviceDescription:'SERVIÇO SINTÉTICO',issTreatment:'TRIBUTAVEL'};
    await db.query("INSERT INTO private.nfse_models VALUES($1,$2,'HOMOLOGACAO',$3,1,$4,$4)",[id(20),id(1),definition,id(11)]);
    await db.query("INSERT INTO private.nfse_configurations VALUES($1,'HOMOLOGACAO',$1,$2,3,$3)",[id(1),
      {municipalityCode:'2803401',portalAccess:'CERTIFICATE',credentialSource:'MATRIZ',opSimpNac:'3',regApTribSN:'1',regEspTrib:'0'},id(11)]);
    await db.query(`INSERT INTO private.nfse_certificates VALUES($1,'HOMOLOGACAO',$2,$3,now()-interval '1 day',now()+interval '1 year',repeat('a',64),$4)`,[id(1),id(80),issuer,id(11)]);
    await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2,$3)',[id(80),'synthetic-material',JSON.stringify(material)]);
    await db.query("INSERT INTO public.contas_receber VALUES($1,99.99,'PAGO')",[id(99)]);
    for(const name of ['20261111001711_nfse_production_material.sql','20261111001714_nfse_production_preparation.sql',
      '20261111001716_nfse_production_relay_config.sql','20261111001718_nfse_individual_store.sql',
      '20261111001720_nfse_individual_operations.sql','20261111001723_nfse_individual_cancellation.sql']) await db.exec(await sql(name));
    await db.exec(`SET request.jwt.claim.sub='${id(11)}';SET request.jwt.claims='{"role":"authenticated"}'`);
    await t.test('authenticated preparation exposes only metadata, pins source and references the same encrypted secret',async()=>{
      const review=await call('review_nfse_production_preparation_secure',[id(10),id(1),'PRODUCAO','2026-11',id(20)]);
      assert.equal(review.data.certificate.fingerprint,'a'.repeat(64));assert.equal(JSON.stringify(review).includes('privateKeyPem'),false);
      await denies(setup({fingerprint:'b'.repeat(64)}),'40001');
      const result=await setup();modelId=result.data.modelId;assert.equal(result.data.readiness,'NOT_VERIFIED');
      assert.deepEqual(await setup(),result);
      const cert=(await db.query("SELECT vault_secret_id FROM private.nfse_certificates WHERE environment='PRODUCAO'")).rows[0];
      assert.equal(cert.vault_secret_id,id(80));
      await denies(setup({modelVersion:2}));
      await denies(op('READ'),'42501');
    });
    await db.exec(`SET request.jwt.claims='{"role":"service_role"}'`);
    await t.test('production material requires a real production row and never falls back to homologation',async()=>{
      const args=[id(11),id(10),id(1),'PRODUCAO','2026-11'];
      const get=()=>call('get_nfse_production_material_internal',args);
      assert.deepEqual((await get()).material,material);
      await denies(call('get_nfse_production_material_internal',[id(11),id(10),id(1),'HOMOLOGACAO','2026-11']),'42501');
      await db.exec("UPDATE private.nfse_certificates SET expires_at=now()-interval '1 minute' WHERE environment='PRODUCAO'");
      await denies(get());
      await db.exec("UPDATE private.nfse_certificates SET expires_at=now()+interval '1 year' WHERE environment='PRODUCAO'");
      const privileges=(await db.query("SELECT has_function_privilege('authenticated','public.get_nfse_production_material_internal(uuid,uuid,uuid,text,text)','EXECUTE') allowed")).rows[0];
      assert.equal(privileges.allowed,false);
    });
    await t.test('production relay configuration accepts only the exact reviewed Preview URL and service channel',async()=>{
      const args=[id(11),id(10),id(1),'PRODUCAO','2026-11'];
      const config={url:'https://universo-cursos-consultoria-6w67gc985-denielson-limas-projects.vercel.app/api/nfse-production-relay',key:'1'.repeat(64)};
      await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2,$3)',[id(81),'nfse_production_relay_config',JSON.stringify(config)]);
      assert.deepEqual(await call('get_nfse_production_relay_config_internal',args),config);
      await db.query('UPDATE vault.decrypted_secrets SET decrypted_secret=$1 WHERE id=$2',[
        JSON.stringify({...config,url:'https://universo-cursos-consultoria-other.vercel.app/api/nfse-production-relay'}),id(81)]);
      await denies(call('get_nfse_production_relay_config_internal',args));
      await db.query('UPDATE vault.decrypted_secrets SET decrypted_secret=$1 WHERE id=$2',[JSON.stringify(config),id(81)]);
      await denies(call('get_nfse_production_relay_config_internal',[id(11),id(10),id(1),'HOMOLOGACAO','2026-11']),'42501');
    });
    const command={partnerId:id(30),modelId,modelVersion:1,amount:'1.00',competenceDate:'2026-01-01',serviceDate:'2026-01-01'};
    await t.test('preview snapshots the authorized partner/model/config and preserves historical replay before mutable rereads',async()=>{
      await denies(op('PREVIEW',{env:'HOMOLOGACAO',input:command}),'42501');
      await denies(op('PREVIEW',{input:{...command,amount:'2.00'}}));
      row=await op('PREVIEW',{input:command});assert.equal(row.series,'49998');assert.equal(row.snapshot.recipient.document,document);
      await db.exec("UPDATE public.parceiros SET status='inativo',nome='CADASTRO ALTERADO'");
      assert.deepEqual(await op('PREVIEW',{input:command}),row);
      await denies(op('PREVIEW',{input:{...command,serviceDate:'2026-01-02'}}));
      await denies(op('PREVIEW',{request:id(51),input:command}));
      await db.exec("UPDATE public.parceiros SET status='ativo',nome='TOMADOR SINTÉTICO'");
    });
    const dps=`DPS28034012${issuer}${row.series}${row.number.padStart(15,'0')}`;
    prepared={dpsId:dps,fiscalInput:{environment:'PRODUCAO',series:row.series,number:row.number,issuedAt:row.issuedAt,competence:command.competenceDate,
      issuer:{taxId:{type:'CNPJ',value:issuer}},recipient:{taxId:{type:'CPF',value:document},name:'TOMADOR SINTÉTICO'},
      service:{nationalTaxCode:'080201',nbs:'122020000',description:'SERVIÇO SINTÉTICO'},values:{serviceAmount:'1.00'},review:{ibscbs:'NOT_APPLICABLE_CONFIRMED'}},
    signedDpsXml:`<DPS Id="${dps}"><Signature/></DPS>`};
    await t.test('signed DPS persists before one dispatch lease; every replay becomes GET-only',async()=>{
      await denies(op('CLAIM',{preview:row.previewId}),'40001');
      await denies(op('PREPARE',{preview:row.previewId,input:{...prepared,dpsId:'DPS0'}}));
      row=await op('PREPARE',{preview:row.previewId,input:prepared});assert.equal(row.signedDpsXml,prepared.signedDpsXml);
      await denies(op('PREPARE',{preview:row.previewId,input:{...prepared,signedDpsXml:`<DPS Id="${dps}"><Signature>different</Signature></DPS>`}}),'40001');
      row=await op('CLAIM',{preview:row.previewId});assert.equal(row.dispatch,true);
      assert.equal((await op('CLAIM',{preview:row.previewId})).dispatch,false);
      const read=await op('READ',{preview:row.previewId});assert.equal(read.state,'PROCESSING');assert.equal(read.dispatch,false);
      row=await op('FINISH',{preview:row.previewId,input:{state:'AWAITING_CONFIRMATION',dpsId:dps,message:'Consulta necessária.'}});
      assert.equal(row.state,'AWAITING_CONFIRMATION');
      assert.equal((await op('CLAIM',{preview:row.previewId})).dispatch,false);
    });
    await t.test('authorization requires the same DPS, key and own XML, then terminal replay does not resend',async()=>{
      await denies(op('FINISH',{preview:row.previewId,input:{state:'AUTHORIZED',dpsId:dps,accessKey:key,number:'1',message:'Autorizada.'}}));
      row=await op('FINISH',{preview:row.previewId,input:{state:'AUTHORIZED',dpsId:dps,accessKey:key,number:'1',message:'Autorizada.',authorizedXml:`<NFSe Id="NFS${key}"><Signature/></NFSe>`}});
      assert.equal(row.state,'AUTHORIZED');assert.equal('authorizedXml' in row.result,false);
      assert.equal((await op('READ',{preview:row.previewId})).result.accessKey,key);
      await denies(cancel('PREVIEW',{preview:id(999),input:{reasonCode:'1',justification:'Erro no valor informado.'}}),'42501');
    });
    await t.test('cancellation uses only this authorized document, persists exact signed event and leases once',async()=>{
      cancellation=await cancel('PREVIEW',{preview:row.previewId,input:{reasonCode:'1',justification:'Erro no valor informado.'}});
      const eventReferenceId=`PRE${key}101101`;
      const eventInput={environment:'PRODUCAO',occurredAt:cancellation.occurredAt,accessKey:key,eventCode:'101101',reasonCode:'1',reason:cancellation.justification,
        author:{type:'CNPJ',value:issuer}};
      await denies(cancel('CLAIM',{preview:row.previewId,cancel:cancellation.cancelPreviewId}),'40001');
      cancellation=await cancel('PREPARE',{preview:row.previewId,cancel:cancellation.cancelPreviewId,
        input:{eventInput,eventReferenceId,signedEventXml:`<pedRegEvento Id="${eventReferenceId}"><Signature/></pedRegEvento>`}});
      cancellation=await cancel('CLAIM',{preview:row.previewId,cancel:cancellation.cancelPreviewId});assert.equal(cancellation.dispatch,true);
      assert.equal((await cancel('CLAIM',{preview:row.previewId,cancel:cancellation.cancelPreviewId})).dispatch,false);
      assert.equal((await cancel('READ',{preview:row.previewId,cancel:cancellation.cancelPreviewId})).state,'PROCESSING');
      await denies(cancel('FINISH',{preview:row.previewId,cancel:cancellation.cancelPreviewId,input:{state:'CANCELLED',accessKey:key,message:'Cancelada.'}}));
      const eventId=`EVT${key}101101001`;
      cancellation=await cancel('FINISH',{preview:row.previewId,cancel:cancellation.cancelPreviewId,
        input:{state:'CANCELLED',accessKey:key,eventCode:'101101',eventId,eventXml:`<evento Id="${eventId}"><Signature/></evento>`,message:'Cancelada.'}});
      assert.equal(cancellation.state,'CANCELLED');assert.equal('eventXml' in cancellation.result,false);
    });
    await t.test('revoked scope blocks terminal reads and no receivable or financial data was touched',async()=>{
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await denies(op('READ',{preview:row.previewId}),'42501');
      await denies(cancel('READ',{preview:row.previewId,cancel:cancellation.cancelPreviewId}),'42501');
      const receipt=(await db.query('SELECT valor::text,status FROM public.contas_receber')).rows[0];
      assert.deepEqual(receipt,{valor:'99.99',status:'PAGO'});
    });
  } finally {await db.close();}
});
