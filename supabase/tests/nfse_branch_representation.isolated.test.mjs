import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const fixture = name => readFile(new URL(name, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const cnpj = base => { let value = base; for (const weights of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
  const rest = [...value].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 11;
  value += String(rest < 2 ? 0 : 11 - rest); } return value; };
const cpf = base => { let value = base; for (const weight of [10,11]) value += String(
  ([...value].reduce((sum, digit, i) => sum + Number(digit) * (weight - i), 0) * 10 % 11) % 10); return value; };
const denies = (promise, code = '22023') => assert.rejects(promise, error => error.code === code);
const body = (source, name) => {
  const start = source.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.', '\\.') }\\(`));
  assert(start >= 0, `Missing owning function ${name}`);
  const end = source.indexOf('$function$;', source.indexOf('AS $function$', start)) + '$function$;'.length;
  assert(end > start); return source.slice(start, end).replace(/^CREATE FUNCTION/, 'CREATE OR REPLACE FUNCTION');
};
const migrations = ['20261112011358_nfse_branch_representation.sql','20261112011400_nfse_branch_operation_credentials.sql',
  '20261112011403_nfse_branch_queue_credentials.sql','20261112011405_nfse_branch_relay_scope.sql'];

test('production branches reuse only their authorized same-environment matrix signer and keep canonical issuer/leases', async t => {
  const db = new PGlite(); const actor = id(11), context = id(10), company = id(100);
  const taxIds = new Map([1,2,3,4,5].map(n => [n, cnpj(`00000000000${n}`)]));
  taxIds.set(6, cnpj('111111110006'));
  const model = { name:'MODELO SINTÉTICO',active:true,nationalServiceCode:'080201',nbsCode:'122020000',
    serviceDescription:'DESCRIÇÃO MODELO',complementaryInfo:'COMPLEMENTO SINTÉTICO',issTreatment:'TRIBUTAVEL',
    peopleOptions:{version:2,competenceMode:'FIXED_DATE',competenceDate:'2026-11-10'} };
  const call = async (name, args) => (await db.query(`SELECT ${name}(${args.map((_, i) => `$${i+1}`).join(',')}) value`, args)).rows[0].value;
  const scope = (polo = 2, environment = 'PRODUCAO') => [actor,context,id(polo),environment,'2026-11'];
  const material = (polo = 2, environment = 'PRODUCAO') => call('public.get_nfse_production_material_internal',scope(polo,environment));
  const relay = (polo = 2) => call('public.get_nfse_production_relay_config_internal',scope(polo));
  const op = (polo, request, action, preview = null, input = null) => call('public.nfse_individual_operation_internal',
    [...scope(polo),id(request),action,preview,input]);
  const preview = (polo, request, source = 38 + polo, kind = 'PARTNER_SERVICE') =>
    op(polo,request,'PREVIEW_QUEUE',null,{source:{kind,id:id(source)}});
  const scenario = async (query, args, check) => {
    await db.exec('BEGIN'); try { await db.query(query,args); await check(); } finally { await db.exec('ROLLBACK'); }
  };
  let rows;
  try {
    await db.exec(await fixture('./nfse_individual_production.fixture.sql'));
    await db.exec(await fixture('./nfse_queue_emission.fixture.sql'));
    await db.exec(await fixture('./nfse_branch_representation.fixture.sql'));
    const configSource = await sql('20261109015954_nfse_configuration_store.sql');
    await db.exec(body(configSource,'private.authorize_nfse_configuration_scope'));
    const validator = await sql('20261110190702_nfse_fiscal_review_store.sql');
    await db.exec(body(validator,'private.nfse_review_valid_document'));
    await db.query('INSERT INTO public.usuarios_sistema VALUES($1,$2,NULL,false,$3)',[context,actor,{modules:['configuracoes']}]);
    for (let n = 1; n <= 6; n++) {
      await db.query('INSERT INTO public.polos VALUES($1,$2,$3,$4,$5)',[id(n),taxIds.get(n),'ativo',n===5?id(101):company,n===1]);
      await db.query('INSERT INTO public.test_scope_access VALUES($1,$2,$3,true)',[actor,context,id(n)]);
      await db.query("INSERT INTO private.nfse_configurations VALUES($1,'PRODUCAO',$2,$3,3,$4)",
        [id(n),id(1),{municipalityCode:'2803401',portalAccess:'CERTIFICATE',credentialSource:'MATRIZ'},actor]);
    }
    for (const [environment, secret, marker] of [['PRODUCAO',80,'a'],['HOMOLOGACAO',81,'b']]) {
      await db.query('INSERT INTO private.nfse_certificates VALUES($1,$2,$3,$4,now()-interval \'1 day\',now()+interval \'1 year\',$5,$6)',
        [id(1),environment,id(secret),taxIds.get(1),marker.repeat(64),actor]);
      await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2,$3)',[id(secret),`synthetic-${environment}`,JSON.stringify({
        certificatePem:'-----BEGIN CERTIFICATE-----SYNTHETIC',chainPem:'',privateKeyPem:'-----BEGIN RSA PRIVATE KEY-----SYNTHETIC'})]);
    }
    await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2,$3)',[id(82),'nfse_production_relay_config',JSON.stringify({
      url:'https://universo-cursos-consultoria-qsnk8l1zn-denielson-limas-projects.vercel.app/api/nfse-production-relay',key:'f'.repeat(64)})]);
    await db.query("INSERT INTO private.nfse_models VALUES($1,$2,'PRODUCAO',$3,7,$4,$4)",[id(20),id(1),model,actor]);
    for (let n=2;n<=4;n++) {
      await db.query("INSERT INTO public.parceiros(id,nome,cpf_cnpj,tipo,status,polo_id,polo_ids) VALUES($1,'ALUNO SINTÉTICO',$2,'ALUNO','ativo',$3,'{}')",
        [id(30+n),cpf(`00000000${n}`),id(n)]);
      await db.query(`INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,service_description,amount,
        partner_snapshot,model_snapshot,receivable_action,created_by) VALUES($1,$2,'PRODUCAO',$3,$4,'2026-11-10','DESCRIÇÃO DA ORIGEM',260,'{}',$5,'NONE',$6)`,
      [id(38+n),id(n),id(30+n),id(20),{...model,id:id(20),version:7},actor]);
    }
    for (const name of ['20261111001718_nfse_individual_store.sql','20261111004615_nfse_queue_operation_basis.sql',
      '20261111004617_nfse_operation_core_amounts.sql','20261111004620_nfse_queue_preview.sql','20261111004622_nfse_queue_operation_bridge.sql',
      '20261111030145_nfse_service_competence_rule.sql']) await db.exec(await sql(name));
    await db.exec(body(await sql('20261111121000_nfse_shared_model_scope.sql'),'private.nfse_model_visible_to_polo'));
    const payment = await sql('20261111123000_nfse_fiscal_review_payment_dates.sql');
    await db.exec(body(payment,'private.nfse_academic_payment_reference'));
    await db.exec(body(payment,'private.nfse_queue_operation_basis'));
    for (const name of migrations) await db.exec(await sql(name));
    await db.exec("SET request.jwt.claims='{"+'"role":"service_role"'+"}'");

    await t.test('three branch emitters keep their own identity and point to one original PROD certificate',async()=>{
      const matrix=await material(1);
      for(let n=2;n<=4;n++) { const result=await material(n); assert.equal(result.issuer.cnpj,taxIds.get(n));
        assert.equal(result.poloId,id(n));assert.equal(result.environment,'PRODUCAO');assert.equal(result.configurationVersion,3);
        assert.equal(result.certificate.fingerprint,'a'.repeat(64));assert.deepEqual(result.material,matrix.material); }
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_certificates')).rows[0].n,2);
    });
    await t.test('branch and matrix permissions are both required; authorizes before credential/history access',async()=>{
      for(const target of [1,2]) for(const check of [()=>material(),()=>relay(),()=>preview(2,90)]) {
        await scenario('UPDATE public.test_scope_access SET allowed=false WHERE polo_id=$1',[id(target)],()=>denies(check(),'42501'));
      }
      await scenario('UPDATE public.usuarios_sistema SET permissoes=$1',[{modules:[]}],()=>denies(material(),'42501'));
      await denies(call('public.get_nfse_production_material_internal',[id(12),context,id(2),'PRODUCAO','2026-11']),'42501');
      await denies(material(2,'HOMOLOGACAO'),'42501');
      await db.exec("SET request.jwt.claims='{"+'"role":"authenticated"'+"}'");await denies(material(),'42501');
      await db.exec("SET request.jwt.claims='{"+'"role":"service_role"'+"}'");
    });
    await t.test('different root/company, inactive units, unrelated credential reference and changed signer are rejected',async()=>{
      await denies(material(5));await denies(material(6));
      await scenario("UPDATE public.polos SET status='inativo' WHERE id=$1",[id(2)],()=>denies(material(),'42501'));
      await scenario('UPDATE private.nfse_configurations SET credential_polo_id=$1 WHERE polo_id=$2',[id(3),id(2)],()=>denies(material()));
      await scenario("UPDATE private.nfse_certificates SET cnpj=$1 WHERE environment='PRODUCAO'",[taxIds.get(2)],()=>denies(material()));
      await scenario("UPDATE private.nfse_certificates SET expires_at=now()-interval '1 second' WHERE environment='PRODUCAO'",[],()=>denies(material()));
      await scenario("DELETE FROM private.nfse_certificates WHERE environment='PRODUCAO'",[],()=>denies(material()));
      await denies(call('private.resolve_nfse_production_certificate',[id(2),'PRODUCAO',taxIds.get(1)]));
    });
    await t.test('relay retains fixed URL/key contract and rejects other origins; private helper has no application grants',async()=>{
      const value=await relay();assert.equal(value.key,'f'.repeat(64));assert.match(value.url,/qsnk8l1zn/);
      await scenario("UPDATE vault.decrypted_secrets SET decrypted_secret=$1 WHERE name='nfse_production_relay_config'",
        [JSON.stringify({url:'https://example.invalid/api/nfse-production-relay',key:'f'.repeat(64)})],()=>denies(relay()));
      const privileges=(await db.query(`SELECT has_function_privilege('authenticated','public.get_nfse_production_material_internal(uuid,uuid,uuid,text,text)','execute') material,
        has_function_privilege('anon','public.get_nfse_production_relay_config_internal(uuid,uuid,uuid,text,text)','execute') relay,
        has_function_privilege('service_role','private.resolve_nfse_production_certificate(uuid,text,text)','execute') helper`)).rows[0];
      assert.deepEqual(privileges,{material:false,relay:false,helper:false});
    });
    await t.test('branch queue snapshots preserve shared model, own issuer/config and pinned matrix fingerprint',async()=>{
      rows=await Promise.all([2,3,4].map(n=>preview(n,48+n)));
      for(let n=2;n<=4;n++) { const row=rows[n-2];assert.equal(row.snapshot.issuer.cnpj,taxIds.get(n));
        assert.equal(row.configurationVersion,3);assert.equal(row.certificateFingerprint,'a'.repeat(64));
        assert.equal(row.snapshot.model.id,id(20));assert.equal(row.snapshot.model.version,7);
        assert.equal(row.snapshot.command.amount,'260.00');assert.equal(row.snapshot.command.competenceDate,'2026-11-10'); }
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_individual_operations')).rows[0].n,3);
      await denies(preview(2,99),'40001');await denies(preview(3,98,40),'40001');
    });
    const prepared=row=>{const issuer=row.snapshot.issuer.cnpj;const dps=`DPS28034012${issuer}${row.series}${row.number.padStart(15,'0')}`;
      return {dpsId:dps,signedDpsXml:`<DPS Id="${dps}"><Signature/></DPS>`,fiscalInput:{environment:'PRODUCAO',series:row.series,
        number:row.number,issuedAt:row.issuedAt,competence:row.snapshot.command.competenceDate,issuer:{taxId:{type:'CNPJ',value:issuer}},
        recipient:{taxId:{type:'CPF',value:row.snapshot.recipient.document},name:row.snapshot.recipient.name},
        service:{nationalTaxCode:'080201',nbs:'122020000',description:row.snapshot.source.serviceDescription,complementaryInfo:'COMPLEMENTO SINTÉTICO'},
        values:{serviceAmount:'260.00'},review:{ibscbs:'DECLARED_CONFIRMED'}}};};
    await t.test('persisted DPS cannot replace the branch emitter with the signer CNPJ; new rotations block CLAIM',async()=>{
      const row=rows[0],input=prepared(row),wrong=globalThis.structuredClone(input);wrong.fiscalInput.issuer.taxId.value=taxIds.get(1);
      await denies(op(2,50,'PREPARE',row.previewId,wrong));await op(2,50,'PREPARE',row.previewId,input);
      await scenario("UPDATE private.nfse_certificates SET fingerprint=repeat('c',64) WHERE environment='PRODUCAO'",[],()=>denies(op(2,50,'CLAIM',row.previewId),'40001'));
      await scenario('UPDATE private.nfse_configurations SET version=version+1 WHERE polo_id=$1',[id(2)],()=>denies(op(2,50,'CLAIM',row.previewId),'40001'));
      await scenario('UPDATE public.polos SET cnpj=$1 WHERE id=$2',[taxIds.get(3),id(2)],()=>denies(op(2,50,'CLAIM',row.previewId),'40001'));
      assert.equal((await op(2,50,'CLAIM',row.previewId)).dispatch,true);assert.equal((await op(2,50,'CLAIM',row.previewId)).dispatch,false);
    });
    await t.test('replay stays authenticated and returns immutable data before mutable certificate lookup',async()=>{
      await scenario("UPDATE private.nfse_certificates SET expires_at=now()-interval '1 day' WHERE environment='PRODUCAO'",[],async()=>{
        assert.deepEqual(await preview(3,51),rows[1]);assert.equal((await op(2,50,'CLAIM',rows[0].previewId)).dispatch,false); });
      await scenario('UPDATE public.test_scope_access SET allowed=false WHERE polo_id=$1',[id(3)],()=>denies(preview(3,51),'42501'));
      await denies(op(3,50,'READ',rows[0].previewId),'42501');
    });
    await t.test('expired unleased preview renews the same identity only with the same source and signer',async()=>{
      const row=rows[2];await db.query("UPDATE private.nfse_individual_operations SET expires_at=now()-interval '1 minute' WHERE id=$1",[row.previewId]);
      await scenario("UPDATE private.nfse_certificates SET fingerprint=repeat('c',64) WHERE environment='PRODUCAO'",[],()=>denies(preview(4,52),'40001'));
      const renewed=await preview(4,52);assert.equal(renewed.previewId,row.previewId);assert.equal(renewed.number,row.number);
      assert.deepEqual(renewed.snapshot,row.snapshot);assert(Date.parse(renewed.expiresAt)>Date.now());
    });
    await t.test('academic branch source uses its reviewed payment day and keeps reserved finance after one claim',async()=>{
      await db.query(`INSERT INTO private.nfse_queue_documents(id,batch_id,polo_id,environment,queue_month,payment_month,student_id,class_id,model_id,model_version,
        amount,receipt_count,snapshot,created_by) VALUES($1,$2,$3,'PRODUCAO','2026-11','2026-11',$4,$5,$6,7,260,1,$7,$8)`,
      [id(60),id(61),id(3),id(33),id(62),id(20),{academic:{descriptionContext:{version:1}}},actor]);
      await db.query('INSERT INTO private.test_review_facts VALUES($1,$2)',[id(60),{issues:[],token:'f'.repeat(64),
        basis:{financial:{currentReceipts:[{paymentDate:'2026-11-10'}]}}}]);
      await db.query('INSERT INTO private.nfse_fiscal_review_revisions(document_id,revision,model_id,model_version,basis_fingerprint,definition) VALUES($1,1,$2,7,$3,$4)',
        [id(60),id(20),'f'.repeat(64),{competenceDate:'2026-11-10',serviceDate:'2026-11-10'}]);
      await db.query("INSERT INTO public.contas_receber(id,valor,status,polo_id,cliente_id) VALUES($1,260,'PAGO',$2,$3)",[id(70),id(3),id(33)]);
      await db.query("INSERT INTO private.nfse_receipt_reservations VALUES('PRODUCAO',$1,$1,$2,260)",[id(70),id(60)]);
      const row=await preview(3,53,60,'ACADEMIC_QUEUE');assert.equal(row.snapshot.issuer.cnpj,taxIds.get(3));
      await op(3,53,'PREPARE',row.previewId,prepared(row));assert.equal((await op(3,53,'CLAIM',row.previewId)).dispatch,true);
      await denies(db.query('INSERT INTO private.nfse_queue_removals VALUES($1)',[id(60)]),'55000');
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_receipt_reservations')).rows[0].n,1);
      assert.equal((await db.query('SELECT valor::text FROM public.contas_receber')).rows[0].valor,'260');
    });
  } finally { await db.close(); }
});
