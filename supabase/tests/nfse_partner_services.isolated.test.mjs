import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = name => readFile(new URL(`../migrations/${name}`, import.meta.url),'utf8');
const fixture = await readFile(new URL('./nfse_partner_services.fixture.sql',import.meta.url),'utf8');
const modelStore = await readMigration('20261108225453_nfse_models_private_store.sql');
const financeRpc = await readMigration('20261013170200_other_credit_plans_rpc.sql');
const financeGuards = financeRpc.slice(financeRpc.indexOf('CREATE FUNCTION internal_finance.authorize'),
  financeRpc.indexOf('CREATE FUNCTION public.preview'));
const migrations = await Promise.all(['20261108234843_nfse_partner_services_store.sql',
  '20261108234854_nfse_partner_services_reads.sql','20261108234906_nfse_partner_services_save.sql'].map(readMigration));
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12,'0')}`;
const scope = {context:id(10),polo:id(1),environment:'HOMOLOGACAO',month:'2026-11'};
const base = {partnerId:id(20),modelId:id(30),modelVersion:1,serviceDate:'2026-11-08',
  serviceDescription:'Serviço contratado para parceiro sintético',amount:'1250.50',generateReceivable:false,
  existingReceivableId:null,dueDate:null,categoryId:null};

test('partner service preparation keeps the canonical financial opt-in atomic and scoped',async t=>{
  const db=new PGlite();
  const query=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  const save=(changes={},definition=base,request=id(100))=>query(
    'SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
    [...Object.values({...scope,...changes}),request,definition]);
  const list=(changes={},page=1,size=50)=>query(
    'SELECT public.get_nfse_partner_services_secure($1,$2,$3,$4,$5,$6) value',
    [...Object.values({...scope,...changes}),page,size]);
  const options=(changes={})=>query('SELECT public.get_nfse_partner_service_options_secure($1,$2,$3,$4) value',
    Object.values({...scope,...changes}));
  const counts=()=>query(`SELECT jsonb_build_object('services',(SELECT count(*) FROM private.nfse_partner_services),
    'titles',(SELECT count(*) FROM public.contas_receber),'requests',(SELECT count(*) FROM private.nfse_partner_service_requests)) value`);
  let created,financial;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.polos VALUES('${id(1)}','ativo'),('${id(2)}','ativo'),('${id(3)}','inativo');
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.usuarios_sistema VALUES('${id(11)}','gestor','ativo');
      INSERT INTO public.parceiros(id,nome,tipo,status,polo_id,polo_ids) VALUES
        ('${id(20)}','Parceiro PJ global','PJ','ativo',null,'{}'),
        ('${id(21)}','Parceiro PF local','PF','ativo','${id(1)}','{}'),
        ('${id(22)}','Parceiro outro polo','PJ','ativo','${id(2)}','{}'),
        ('${id(23)}','Aluno sintético','Aluno','ativo','${id(1)}','{}'),
        ('${id(24)}','Inativo sintético','PJ','inativo',null,'{}'),
        ('${id(25)}','Polo por array','PJ','ativo',null,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.categorias_financeiras VALUES('${id(40)}','Serviços','OUTRO_CREDITO','ativo'),
        ('${id(41)}','Despesa','DESPESA_FIXA','ativo'),('${id(42)}','Inativa','OUTRO_CREDITO','inativo');
      SET test.actor='${id(11)}'; SET test.polo='${id(1)}'; SET test.finance='true';`);
    await db.exec(modelStore); await db.exec(financeGuards);
    await db.exec(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by) VALUES
      ('${id(30)}','${id(1)}','HOMOLOGACAO','{"name":"Modelo de serviço","active":true}','${id(11)}','${id(11)}'),
      ('${id(31)}','${id(2)}','HOMOLOGACAO','{"name":"Modelo outro polo","active":true}','${id(11)}','${id(11)}'),
      ('${id(32)}','${id(1)}','PRODUCAO','{"name":"Modelo produção","active":true}','${id(11)}','${id(11)}');`);
    for(const sql of migrations) await db.exec(sql);
    await t.test('options expose only active PF/PJ in the current polo, categories and capabilities',async()=>{
      const result=(await options()).data;
      assert.deepEqual(result.partners.map(p=>p.id).sort(),[id(20),id(21),id(25)].sort());
      assert.deepEqual(result.categories,[{id:id(40),name:'Serviços'}]);
      assert.equal(result.capabilities.canGenerateReceivable,true);
      assert.deepEqual(result.existingReceivables,[]);
    });
    await t.test('default No creates only the private preparation and lists backend totals',async()=>{
      created=await save(); assert.equal(created.data.receivableAction,'NONE');
      assert.equal(created.data.receivableId,null);
      assert.deepEqual(await counts(),{services:1,titles:0,requests:1});
      const result=(await list()).data;
      assert.equal(result.rows[0].partnerName,'Parceiro PJ global');
      assert.equal(result.rows[0].modelName,'Modelo de serviço');
      assert.equal(result.rows[0].status,'PREPARADO');
      assert.equal(result.rows[0].amount,'1250.50'); assert.equal(result.totalAmount,'1250.50');
      assert.equal((await list({month:'2026-10'})).data.totalItems,0);
      assert.equal((await list({environment:'PRODUCAO'})).data.totalItems,0);
      assert.deepEqual(await save(),created);
      await assert.rejects(save({}, {...base,amount:'1251.00'}),e=>e.code==='22023');
    });
    await t.test('parallel replay requests return the same preparation without extra rows',async()=>{
      // PGlite schedules a single connection; this checks API replay, not cross-session lock contention.
      const before=await counts();
      const results=await Promise.all([save(),save(),save()]);
      for(const result of results) assert.deepEqual(result,created);
      assert.deepEqual(await counts(),before);
    });
    await t.test('explicit Yes creates one local pending canonical title, with no paid/bank state',async()=>{
      const definition={...base,generateReceivable:true,dueDate:'2026-11-20',categoryId:id(40)};
      financial=await save({},definition,id(101)); assert.equal(financial.data.receivableAction,'CREATED');
      const title=await query('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[financial.data.receivableId]);
      assert.equal(title.valor,1250.5); assert.equal(title.status,'PENDENTE');
      assert.equal(title.categoria,'OUTROS_CREDITOS'); assert.equal(title.tipo_lancamento,'OUTRO_CREDITO');
      assert.equal(title.origem_pagamento,'LOCAL'); assert.equal(title.cliente_id,id(20));
      for(const field of ['matricula_id','turma_id','origem_cronograma_id','data_pagamento','valor_pago',
        'forma_pagamento','gateway_provider','gateway_payment_id','gateway_payment_method',
        'gateway_submission_status','manual_settlement_id']) assert.equal(title[field],null,field);
      const financialReplays=await Promise.all([save({},definition,id(101)),save({},definition,id(101))]);
      for(const result of financialReplays) assert.deepEqual(result,financial);
      assert.deepEqual(await counts(),{services:2,titles:1,requests:2});
      await assert.rejects(save({},definition,id(102)),e=>e.code==='23505');
    });
    await t.test('link uses the existing canonical title without modifying it or duplicating it',async()=>{
      await db.exec(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria)
        VALUES('${id(50)}','${id(1)}','${id(21)}','Conta existente',89.90,'2026-11-25','PAGO','OUTROS_CREDITOS');`);
      const before=await query('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[id(50)]);
      const selected=(await options()).data.existingReceivables.find(c=>c.id===id(50));
      assert.equal(selected.amount,'89.90');
      const definition={...base,partnerId:id(21),amount:'89.90',generateReceivable:true,existingReceivableId:id(50)};
      await assert.rejects(save({}, {...definition,amount:'89.91'},id(103)),e=>e.code==='22023');
      await assert.rejects(save({}, {...definition,partnerId:id(20)},id(103)),e=>e.code==='22023');
      const linked=await save({},definition,id(104)); assert.equal(linked.data.receivableAction,'LINKED');
      assert.equal(linked.data.receivableId,id(50));
      assert.deepEqual(await query('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[id(50)]),before);
      assert.equal((await options()).data.existingReceivables.some(c=>c.id===id(50)),false);
      await assert.rejects(save({},definition,id(105)),e=>e.code==='22023');
      await assert.rejects(save({environment:'PRODUCAO'},{...definition,modelId:id(32)},id(106)),e=>e.code==='22023');
      assert.deepEqual(await counts(),{services:3,titles:2,requests:3});
    });
    await t.test('permission revocation blocks financial replay but preserves safe draft-only preparation',async()=>{
      await db.exec("SET test.finance='false'");
      const result=(await options()).data;
      assert.equal(result.capabilities.canGenerateReceivable,false);
      assert.deepEqual(result.categories,[]); assert.deepEqual(result.existingReceivables,[]);
      await assert.rejects(save({}, {...base,generateReceivable:true,dueDate:'2026-11-20',categoryId:id(40)},id(101)),e=>e.code==='42501');
      assert.deepEqual(await save(),created);
      await db.exec("SET test.finance='true'");
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(save(),e=>e.code==='42501'); await assert.rejects(list(),e=>e.code==='42501');
      await db.exec(`UPDATE public.test_context SET allowed=true; SET test.actor='${id(99)}'`);
      await assert.rejects(options(),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'`);
    });
    await t.test('foreign/inactive partners, students, stale models and scopes are rejected',async()=>{
      for(const partnerId of [id(22),id(23),id(24),id(999)])
        await assert.rejects(save({}, {...base,partnerId},id(110)),e=>e.code==='22023');
      for(const change of [{modelId:id(31)},{modelVersion:2}])
        await assert.rejects(save({}, {...base,...change},id(110)),e=>e.code==='40001');
      await db.exec(`UPDATE private.nfse_models SET definition=definition || '{"active":false}' WHERE id='${id(30)}'`);
      await assert.rejects(save({},base,id(110)),e=>e.code==='40001');
      await db.exec(`UPDATE private.nfse_models SET definition=definition || '{"active":true}' WHERE id='${id(30)}'`);
      for(const change of [{context:id(99)},{polo:id(2)},{polo:id(3)}]) {
        await assert.rejects(save(change),e=>e.code==='42501'); await assert.rejects(options(change),e=>e.code==='42501');
      }
      await assert.rejects(save({month:'2026-10'},base,id(110)),e=>e.code==='22023');
      await assert.rejects(list({},0),e=>e.code==='22023');
    });
    await t.test('invalid money, variables, dates, categories and finance contradictions do not write',async()=>{
      const before=await counts();
      for(const change of [{amount:'0'},{amount:'-1.00'},{amount:'1.001'},{amount:'1,50'},{amount:1.5},
        {amount:'NaN'},{amount:'1000000000000.00'},{amount:'1e2'},{modelVersion:'1'},
        {serviceDescription:'{{mes_referencia}}'},{serviceDescription:'x}}'},{serviceDescription:'x'.repeat(1001)},
        {serviceDate:'2026-02-30'},{generateReceivable:'false'},{dueDate:'2026-11-25'},
        {generateReceivable:true},{generateReceivable:true,dueDate:'invalid',categoryId:id(40)},
        {generateReceivable:true,dueDate:'2026-11-25',categoryId:id(41)},
        {generateReceivable:true,dueDate:'2026-11-25',categoryId:id(42)},
        {generateReceivable:true,existingReceivableId:id(50),dueDate:'2026-11-25'},{unexpected:true}])
        await assert.rejects(save({}, {...base,...change},id(111)),e=>e.code==='22023');
      assert.deepEqual(await counts(),before);
    });
    await t.test('academic, foreign and convênio titles never become linkable',async()=>{
      await db.exec(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,matricula_id)
        VALUES('${id(60)}','${id(1)}','${id(20)}','Acadêmico',1250.50,'2026-11-25','PENDENTE','OUTROS_CREDITOS','${id(90)}'),
        ('${id(61)}','${id(2)}','${id(20)}','Outro polo',1250.50,'2026-11-25','PENDENTE','OUTROS_CREDITOS',null),
        ('${id(62)}','${id(1)}','${id(20)}','Convênio',1250.50,'2026-11-25','PENDENTE','OUTROS_CREDITOS',null);
        INSERT INTO public.convenios_financeiros_creditos VALUES('${id(62)}');`);
      for(const existingReceivableId of [id(60),id(61),id(62)])
        await assert.rejects(save({}, {...base,generateReceivable:true,existingReceivableId},id(112)),e=>e.code==='22023');
      assert.equal((await options()).data.existingReceivables.length,0);
    });
    await t.test('failure after title creation rolls back title, preparation and request together',async()=>{
      const before=await counts();
      await db.exec(`CREATE FUNCTION private.test_fail_service() RETURNS trigger LANGUAGE plpgsql AS
        $$BEGIN RAISE EXCEPTION 'synthetic failure'; END$$;
        CREATE TRIGGER test_fail_service BEFORE INSERT ON private.nfse_partner_services
          FOR EACH ROW EXECUTE FUNCTION private.test_fail_service();`);
      await assert.rejects(save({}, {...base,serviceDescription:'Outro serviço para falha',generateReceivable:true,
        dueDate:'2026-11-26',categoryId:id(40)},id(113)),/synthetic failure/);
      assert.deepEqual(await counts(),before);
      await db.exec('DROP TRIGGER test_fail_service ON private.nfse_partner_services');
    });
    await t.test('omitted financial opt-in defaults to No and sums stay canonical in the backend',async()=>{
      const {generateReceivable,...withoutOptIn}=base;
      const saved=await save({}, {...withoutOptIn,amount:'0.10',partnerId:id(25)},id(114));
      assert.equal(saved.data.receivableAction,'NONE');
      const result=(await list({},1,2)).data;
      assert.equal(result.rows.length,2); assert.equal(result.totalItems,4);
      assert.equal(result.totalAmount,'2591.00');
      assert.equal((await list({},2,2)).data.rows.length,2);
    });
    await t.test('only authenticated RPCs are executable and private stores remain inaccessible',async()=>{
      const signatures=['public.get_nfse_partner_service_options_secure(uuid,uuid,text,text)',
        'public.get_nfse_partner_services_secure(uuid,uuid,text,text,integer,integer)',
        'public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb)'];
      for(const signature of signatures) {
        const grants=await query(`SELECT jsonb_build_object('authenticated',has_function_privilege('authenticated',$1,'EXECUTE'),
          'anon',has_function_privilege('anon',$1,'EXECUTE'),'service_role',has_function_privilege('service_role',$1,'EXECUTE')) value`,[signature]);
        assert.deepEqual(grants,{authenticated:true,anon:false,service_role:false});
      }
      await db.exec('SET ROLE authenticated'); assert.equal((await list()).data.totalItems,4);
      await assert.rejects(db.query('SELECT * FROM private.nfse_partner_services'),e=>e.code==='42501');
      await assert.rejects(db.query('SELECT * FROM private.nfse_partner_service_requests'),e=>e.code==='42501');
      await db.exec('RESET ROLE');
    });
  } finally {await db.close();}
});
