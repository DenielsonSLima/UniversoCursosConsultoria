import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {definition,id,prepareServiceReceivables,scope} from './nfse_service_receivables.fixture.mjs';
const modulePath=process.env.NFSE_TEST_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');

test('service receivables follow fiscal authorization with durable scope and no duplicated history',async t=>{
  const db=new PGlite();
  const value=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  const count=table=>value(`SELECT count(*)::integer value FROM ${table}`);
  const save=(input=definition,request=id(500))=>value(
    'SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
    [...Object.values(scope),request,input]);
  const list=(polo=scope.polo,search=null,status='ALL',page=1,size=50)=>value(
    'SELECT public.listar_servicos_receber_secure($1,$2,NULL,NULL,$3,$4,$5) value',[polo,search,status,page,size]);
  const authorize=async(service,operation,changes={})=>{
    const args=[operation,scope.polo,changes.environment||'PRODUCAO',
      {source:{kind:changes.kind||'PARTNER_SERVICE',id:service}}, {number:String(operation).slice(-3),accessKey:'1'.repeat(50)}];
    await db.query('INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result) VALUES($1,$2,$3,\'PROCESSING\',$4,$5)',args);
    await db.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id=$1",[operation]);
  };
  let created;
  try{
    await prepareServiceReceivables(db);
    await t.test('backfill moves only linked titles and does not invent historical debt',async()=>{
      assert.equal(await count('public.contas_receber'),1);
      assert.equal(await count('private.nfse_service_receivables'),1);
      assert.equal((await list()).rows[0].id,id(200));
      await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(301)}'`);
      assert.equal(await count('public.contas_receber'),1);
    });
    await t.test('NFSe user without Financeiro must plan, but creates no title at save',async()=>{
      await db.exec("SET test.finance='false'; SET test.receber='false'");
      created=await save();
      assert.equal(created.data.receivableAction,'PENDING');
      assert.equal(created.data.receivableId,null);
      assert.equal(await count('public.contas_receber'),1);
      assert.deepEqual(await save(),created);
      const options=await value('SELECT public.get_nfse_partner_service_options_secure($1,$2,$3,$4) value',Object.values(scope));
      assert.equal(options.data.capabilities.canGenerateReceivable,true);
      assert.equal(options.data.capabilities.canLinkExistingReceivable,false);
      assert.ok(options.data.categories.some(c=>c.id===id(40)));
      assert.deepEqual(options.data.existingReceivables,[]);
      await assert.rejects(save({...definition,generateReceivable:false,dueDate:null,categoryId:null},id(501)),e=>e.code==='22023');
      await assert.rejects(save({...definition,dueDate:null},id(501)),e=>e.code==='22023');
      await assert.rejects(save({...definition,categoryId:id(999)},id(501)),e=>e.code==='22023');
      await assert.rejects(list(),e=>e.code==='42501');
    });
    await t.test('authorization creates exactly one title, even after category deactivation and replays',async()=>{
      await db.exec(`UPDATE public.categorias_financeiras SET status='inativo' WHERE id='${id(40)}'`);
      await authorize(created.data.id,id(302));
      await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(302)}'`);
      const first=await value('SELECT private.ensure_nfse_service_receivable($1) value',[id(302)]);
      assert.equal(await value('SELECT private.ensure_nfse_service_receivable($1) value',[id(302)]),first);
      assert.equal(await count('public.contas_receber'),2);
      const title=await value('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[first]);
      assert.equal(title.status,'PENDENTE'); assert.equal(title.valor,120); assert.equal(title.valor_pago,null);
      assert.equal(title.data_vencimento,'2026-11-30'); assert.equal(title.gateway_provider,null);
      await db.exec("SET test.receber='true'");
      assert.equal((await list()).total_items,2);
      await db.exec(`UPDATE public.categorias_financeiras SET status='ativo' WHERE id='${id(40)}'`);
    });
    await t.test('legacy draft fallback is explicit and homologation/academic authorization creates no debt',async()=>{
      await authorize(id(102),id(303));
      const plan=await value('SELECT to_jsonb(p) value FROM private.nfse_service_financial_plans p WHERE service_id=$1',[id(102)]);
      assert.equal(plan.rule,'LEGACY_SERVICE_DATE'); assert.equal(plan.due_date,'2026-11-02');
      await authorize(id(999),id(304),{kind:'ACADEMIC_QUEUE'});
      await authorize(id(999),id(305),{environment:'HOMOLOGACAO'});
      assert.equal(await count('public.contas_receber'),3);
    });
    await t.test('cancelled fiscal evidence preserves paid and pending financial titles',async()=>{
      const before=await value('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) value FROM public.contas_receber c');
      await db.exec(`INSERT INTO private.nfse_individual_cancellations(id,operation_id,state)
        VALUES('${id(400)}','${id(300)}','CANCELLED'),('${id(401)}','${id(302)}','CANCELLED')`);
      assert.deepEqual(await value('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) value FROM public.contas_receber c'),before);
      assert.equal((await list()).rows.filter(r=>r.nfse_fiscal_cancelled_at).length,2);
    });
    await t.test('Receber scope routes payment authorization without granting ordinary Outros Créditos',async()=>{
      const serviceId=(await list()).rows[0].id;
      await value("SELECT internal_financial_payments.authorize_source($1,'RECEIVABLE',$2) value",[id(11),serviceId]);
      await db.exec(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria)
        VALUES('${id(201)}','${id(1)}','${id(20)}','Crédito comum',99,'2026-11-30','PENDENTE','OUTROS_CREDITOS')`);
      await assert.rejects(value("SELECT internal_financial_payments.authorize_source($1,'RECEIVABLE',$2) value",[id(11),id(201)]),e=>e.code==='42501');
      await db.exec("SET test.finance='true'; SET test.receber='false'");
      await assert.rejects(value("SELECT internal_financial_payments.authorize_source($1,'RECEIVABLE',$2) value",[id(11),serviceId]),e=>e.code==='42501');
      const others=await value('SELECT public.listar_outros_creditos_secure($1) value',[id(1)]);
      assert.deepEqual(others.map(r=>r.id),[id(201)]);
      await db.exec("SET test.receber='true'");
    });
    await t.test('pagination, filters, summary, tenant guards and private ACL are enforced in SQL',async()=>{
      assert.equal((await list(id(1),null,'ALL',1,1)).rows.length,1);
      assert.equal((await list(id(1),null,'ALL',2,1)).total_items,3);
      assert.equal((await list(id(1),'Histórico')).rows[0].id,id(200));
      assert.equal((await list(id(1),null,'RECEIVED')).total_items,1);
      const summary=(await db.query('SELECT * FROM public.get_servicos_receber_summary($1)',[id(1)])).rows[0];
      assert.equal(Number(summary.pending_value),190); assert.equal(Number(summary.received_value),50);
      await assert.rejects(list(id(2)),e=>e.code==='42501');
      await assert.rejects(list(null),e=>e.code==='42501');
      await assert.rejects(list(id(1),null,'bad'),e=>e.code==='22023');
      await assert.rejects(list(id(1),null,'ALL',1,101),e=>e.code==='22023');
      assert.equal(await value("SELECT has_table_privilege('authenticated','private.nfse_service_receivables','SELECT') value"),false);
      assert.equal(await value("SELECT has_function_privilege('authenticated','private.ensure_nfse_service_receivable(uuid)','EXECUTE') value"),false);
    });
    await t.test('a legacy paid-credit writer cannot bypass Receber through Outros-only authorization',async()=>{
      await db.exec(`CREATE FUNCTION public.test_legacy_paid_credit_reversal(p_id uuid) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
          PERFORM internal_finance.authorize_other_credit_plan('${id(1)}'::uuid,true);
          UPDATE public.contas_receber SET status='ESTORNADO' WHERE id=p_id AND status='PAGO';END$$;
        SET test.finance='true';SET test.receber='false'`);
      await assert.rejects(value('SELECT public.test_legacy_paid_credit_reversal($1) value',[id(200)]),e=>e.code==='42501');
      assert.equal(await value('SELECT status value FROM public.contas_receber WHERE id=$1',[id(200)]),'PAGO');
      await db.exec("SET test.receber='true'");
      await value('SELECT public.test_legacy_paid_credit_reversal($1) value',[id(200)]);
      assert.equal(await value('SELECT status value FROM public.contas_receber WHERE id=$1',[id(200)]),'ESTORNADO');
      await db.exec(`UPDATE public.contas_receber SET status='PAGO' WHERE id='${id(200)}'`);
    });
    await t.test('existing title is linked once with bank/payment history preserved and identity fenced',async()=>{
      await db.exec(`UPDATE public.contas_receber SET valor_pago=20,payment_summary='{"previouslyPaid":"20.00","remainingBefore":"79.00"}',
        gateway_provider='banese',gateway_invoice_url='https://bank.example.test/existing' WHERE id='${id(201)}'`);
      const before=await value('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[id(201)]);
      const linked=await save({...definition,serviceDescription:'Crédito comum',amount:'99.00',
        existingReceivableId:id(201),dueDate:null,categoryId:null},id(502));
      assert.equal(linked.data.receivableAction,'LINKED');
      await assert.rejects(db.exec(`UPDATE public.contas_receber SET valor=100 WHERE id='${id(201)}'`),e=>e.code==='55000');
      await authorize(linked.data.id,id(306));
      assert.equal(await count('public.contas_receber'),4);
      assert.deepEqual(await value('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[id(201)]),before);
      assert.equal((await list(id(1),'Crédito comum')).rows[0].asaas_invoice_url,'https://bank.example.test/existing');
      assert.deepEqual(await value('SELECT public.listar_outros_creditos_secure($1) value',[id(1)]),[]);
    });
  }finally{await db.close();}
});
