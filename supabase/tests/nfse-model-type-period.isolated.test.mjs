import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]));
const db = new PGlite();
const migration = name => readFileSync(new URL(`../migrations/2026111220300${name}.sql`, import.meta.url), 'utf8');
const period = migration('0_nfse_model_period_contract');
const save = migration('1_nfse_model_type_save');
const guards = migration('2_nfse_model_type_guards');
const prepare = migration('3_nfse_service_period_prepare');
await db.exec(`CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
await db.exec(period);
const scalar = async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
assert.equal(await scalar(`SELECT private.render_nfse_service_period($1,$2,$3,true) value`,
  ['Serviço no período de {{periodo}}, conforme relatório.','2026-09-09','2026-10-08']),
  'Serviço no período de 09/09/2026 ATÉ 08/10/2026, conforme relatório.');
assert.equal(await scalar(`SELECT private.render_nfse_service_period('Texto sem período',null,null) value`),'Texto sem período');
for (const [start,end] of [[null,null],['2026-02-30','2026-03-02'],['2026-11-12','2026-11-11'],['2026-01-01',null],['1999-01-01','2000-01-01']]) {
  await assert.rejects(scalar(`SELECT private.nfse_service_period($1,$2,true) value`,[start,end]),/período/);
}
assert.deepEqual(await scalar(`SELECT private.nfse_service_period('2028-02-29','2028-02-29') value`),
  {servicePeriodStart:'2028-02-29',servicePeriodEnd:'2028-02-29'});
await assert.rejects(scalar(`SELECT private.render_nfse_service_period('Texto {{desconhecido}}',null,null) value`),/variável/);
await assert.rejects(scalar(`SELECT private.render_nfse_service_period(repeat('x',1990)||'{{periodo}}','2026-01-01','2026-01-02') value`),/2.000/);
await db.query(`SELECT private.validate_nfse_description_template('Texto {{periodo}}')`);
await assert.rejects(db.query(`SELECT private.validate_nfse_description_template('Texto {{qualquer}}')`),/desconhecida/);
const input={partnerId:'11111111-1111-4111-8111-111111111111',modelId:'22222222-2222-4222-8222-222222222222',modelVersion:1,
 serviceDate:'2026-11-01',serviceDescription:'Texto {{periodo}}',amount:'100.00',servicePeriodStart:'2026-09-09',servicePeriodEnd:'2026-10-08'};
const normalized=await scalar(`SELECT private.normalize_nfse_partner_service($1::jsonb) value`,[JSON.stringify(input)]);
assert.equal(normalized.serviceDate,'2026-11-01'); // period never changes fiscal date
assert.equal(normalized.serviceDescription,'Texto {{periodo}}'); // expansion follows authorized model lookup
assert.equal(normalized.servicePeriodStart,'2026-09-09');
const legacy={...input,serviceDescription:'Literal'}; delete legacy.servicePeriodStart; delete legacy.servicePeriodEnd;
assert.equal(Object.hasOwn(await scalar(`SELECT private.normalize_nfse_partner_service($1::jsonb) value`,[JSON.stringify(legacy)]),'servicePeriodStart'),false);
for(const field of ['servicePeriodStart','servicePeriodEnd']) {
 const invalid={...input,[field]:null};
 await assert.rejects(scalar(`SELECT private.normalize_nfse_partner_service($1::jsonb) value`,[JSON.stringify(invalid)]));
}
assert.ok(save.indexOf('RETURN v_previous.response')<save.indexOf("Selecione o tipo do modelo"),'legacy model replay before new type requirement');
assert.ok(prepare.indexOf('authorize_nfse_model_scope')<prepare.indexOf('v_previous.response'));
assert.ok(prepare.indexOf('v_previous.response')<prepare.indexOf('render_nfse_service_period'),'replay does not re-render');
assert.ok(prepare.indexOf('render_nfse_service_period')<prepare.indexOf('INSERT INTO public.contas_receber'),'validate before financial side effect');
assert.match(guards,/NOT IN \('ALUNO','AMBOS'\)/);
assert.match(guards,/NOT IN \('SERVICO','AMBOS'\)/);
assert.match(guards,/nfse_model_visible_to_polo/);
for(const sql of [period,save,guards,prepare]) assert.ok(sql.split('\n').length<=500);
await db.exec(`
CREATE SCHEMA auth; CREATE SCHEMA internal_finance;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF $2<>'33333333-3333-4333-8333-333333333333'::uuid THEN RAISE EXCEPTION 'scope denied'; END IF; END $$;
CREATE FUNCTION private.nfse_model_visible_to_polo(uuid,uuid,jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT $1=$2 $$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='ATIVO' $$;
CREATE FUNCTION private.nfse_review_valid_document(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='SYNTHETIC' $$;
CREATE TABLE public.parceiros(id uuid,tipo text,status text,polo_id uuid,polo_ids uuid[],nome text,nome_fantasia text,cpf_cnpj text);
CREATE TABLE private.nfse_models(id uuid,polo_id uuid,environment text,version integer,definition jsonb,updated_at timestamptz);
CREATE TABLE private.nfse_partner_service_requests(actor_id uuid,request_id uuid,payload jsonb,response jsonb);
CREATE TABLE public.contas_receber(id uuid,polo_id uuid,cliente_id uuid,valor numeric);
CREATE TABLE private.nfse_partner_services(id uuid,polo_id uuid,environment text,partner_id uuid,model_id uuid,service_date date,
 service_description text,amount numeric,partner_snapshot jsonb,model_snapshot jsonb,receivable_id uuid,receivable_action text,created_by uuid);
INSERT INTO public.parceiros VALUES ('11111111-1111-4111-8111-111111111111','PJ','ATIVO','33333333-3333-4333-8333-333333333333','{}','Sintético','Teste','SYNTHETIC');
INSERT INTO private.nfse_models VALUES ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','PRODUCAO',1,
 '{"active":true,"modelType":"SERVICO","serviceDescription":"Texto {{periodo}}"}',now());
`);
await db.exec(prepare);
const callSave=async (definition,request='44444444-4444-4444-8444-444444444444',polo='33333333-3333-4333-8333-333333333333')=>scalar(
 `SELECT public.save_nfse_partner_service_secure('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,'PRODUCAO','2026-11',$2,$3::jsonb) value`,
 [polo,request,JSON.stringify(definition)]);
const first=await callSave(input);
assert.deepEqual(await callSave(input),first,'same request replays same result');
assert.equal(await scalar(`SELECT count(*)::integer value FROM private.nfse_partner_services`),1);
assert.equal(await scalar(`SELECT service_description value FROM private.nfse_partner_services`),'Texto 09/09/2026 ATÉ 08/10/2026');
assert.equal(await scalar(`SELECT service_date::text value FROM private.nfse_partner_services`),'2026-11-01');
assert.equal(await scalar(`SELECT service_period_start::text value FROM private.nfse_partner_services`),'2026-09-09');
await assert.rejects(callSave({...input,servicePeriodStart:'2026-09-10'}),/outro.*serviço/);
await assert.rejects(callSave(input,undefined,'99999999-9999-4999-8999-999999999999'),/scope denied/,'auth before replay');
await assert.rejects(callSave({...input,modelVersion:9},'55555555-5555-4555-8555-555555555555'),/modelo.*alterado/i);
await assert.rejects(callSave(legacy,'55555555-5555-4555-8555-555555555555'),/data inicial/,'model requires period even if textarea removed token');
await db.exec(`UPDATE private.nfse_models SET definition=jsonb_set(definition,'{modelType}','"ALUNO"');`);
await assert.rejects(callSave(input,'55555555-5555-4555-8555-555555555555'),/tipo Serviços/);
assert.equal(await scalar(`SELECT count(*)::integer value FROM private.nfse_partner_services`),1,'failed actions are atomic');
await db.exec(`CREATE TABLE private.nfse_model_requests(actor_id uuid,request_id uuid,context_id uuid,polo_id uuid,environment text,payload jsonb,response jsonb);`);
await db.exec(save);
const modelInput={name:'Modelo sintético',modelType:'SERVICO',active:true,nationalServiceCode:'080201',nbsCode:'122051900',operationIndicatorCode:'',
 serviceDescription:'Texto {{curso}}',issTreatment:'TRIBUTAVEL',immunityType:null,technicalResponsibilityDocument:'',referenceDocument:'',complementaryInfo:'',orderReference:''};
const callModel = definition => scalar(`SELECT public.save_nfse_model_core_20261112('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '33333333-3333-4333-8333-333333333333','PRODUCAO','2026-11','66666666-6666-4666-8666-666666666666',null,null,$1::jsonb) value`,[JSON.stringify(definition)]);
await assert.rejects(callModel(modelInput),/variáveis.*acadêmicos/);
await assert.rejects(callModel({...modelInput,modelType:'ALUNO',serviceDescription:'Texto {{periodo}}'}),/sem período manual/);
await assert.rejects(callModel({...modelInput,modelType:null}),/Selecione o tipo/);
const classification=migration('4_nfse_known_model_classification');
await db.exec(`INSERT INTO private.nfse_models VALUES
 ('99999999-9999-4999-8999-999999999999','33333333-3333-4333-8333-333333333333','PRODUCAO',3,
 '{"name":"Modelo sintético","serviceDescription":"Descrição anterior","nationalServiceCode":"080201","issTreatment":"TRIBUTAVEL","active":true}',now());`);
await db.exec(classification);
const mapping=[{id:'99999999-9999-4999-8999-999999999999',poloId:'33333333-3333-4333-8333-333333333333',
 environment:'PRODUCAO',expectedVersion:3,modelType:'SERVICO',serviceDescription:'Serviço sintético {{periodo}}'}];
const classify=async(request,items)=>db.query('SELECT private.classify_nfse_models_reviewed($1,$2) value',[request,JSON.stringify(items)]);
const request='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for(const role of ['anon','authenticated','service_role']) assert.equal(await scalar(`SELECT has_function_privilege('${role}','private.classify_nfse_models_reviewed(uuid,jsonb)','EXECUTE') value`),false);
await assert.rejects(classify(request,[{...mapping[0],poloId:'55555555-5555-4555-8555-555555555555'}]),/Modelo alterado/);
await assert.rejects(classify(request,[...mapping,{...mapping[0],id:'ffffffff-ffff-4fff-8fff-ffffffffffff'}]),/no rows/);
assert.equal(await scalar("SELECT version value FROM private.nfse_models WHERE id='99999999-9999-4999-8999-999999999999'"),3);
assert.equal(await scalar('SELECT count(*)::int value FROM private.nfse_model_classification_runs'),0);
const result=await classify(request,mapping);
assert.deepEqual(await classify(request,mapping),result);
await assert.rejects(classify(request,[{...mapping[0],modelType:'ALUNO'}]),/divergente/);
assert.equal(await scalar(`SELECT version value FROM private.nfse_models WHERE id='99999999-9999-4999-8999-999999999999'`),4);
assert.equal(await scalar(`SELECT definition->>'modelType' value FROM private.nfse_models WHERE id='99999999-9999-4999-8999-999999999999'`),'SERVICO');
assert.match(await scalar(`SELECT definition->>'serviceDescription' value FROM private.nfse_models WHERE id='99999999-9999-4999-8999-999999999999'`),/\{\{periodo\}\}/);
assert.equal(await scalar(`SELECT definition->>'issTreatment' value FROM private.nfse_models WHERE id='99999999-9999-4999-8999-999999999999'`),'TRIBUTAVEL');
await classify(request,mapping); // idempotent, does not increment twice
assert.equal(await scalar(`SELECT version value FROM private.nfse_models WHERE id='99999999-9999-4999-8999-999999999999'`),4);
await db.close();
console.log('PASS: period dates/render/limits, fiscal independence, normalization, legacy payload, type guards and replay ordering');
