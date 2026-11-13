import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareServiceGroups,createGroupService,id,scope,call,value} from './nfse_service_groups.fixture.mjs';
import {definition} from './nfse_service_receivables.fixture.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const options=db=>call(db,'get_nfse_partner_service_options_secure',Object.values(scope));
const planInput={installments:3,firstDueDate:'2026-11-30',categoryId:id(40),monthlyInterestPercent:2.35,
  penaltyPercent:1.25,discountType:'PERCENTUAL',discountValue:5,discountDaysBeforeDue:3,
  periodicity:'MENSAL_CALENDARIO',issueBolePix:false};
const description='Serviço novo com categoria fixa';
const preview=(db,input=planInput,args=[])=>call(db,'preview_nfse_service_financial_plan_secure',
  [...Object.values(scope),id(20),'100.01',description,input,...args]);
const save=(db,request,input)=>call(db,'save_nfse_partner_service_secure',[...Object.values(scope),request,input]);

test('fixed service category governs new plans while preserving frozen financial history and request replays',async t=>{
  const db=new PGlite();let canonical,legacy,legacyRequest,frozenPlan,frozenTitles,newSaved;
  try{
    await prepareServiceGroups(db);
    canonical=await value(db,'SELECT default_category_id value FROM private.nfse_service_financial_policy');
    await t.test('reproduces arbitrary category acceptance before the patch',async()=>{
      assert((await options(db)).data.categories.some(c=>c.id===id(40)));
      assert.equal((await preview(db)).data.financialPlan.categoryId,id(40));
      legacy=await createGroupService(db,1500,{installments:3,amount:'100.01'});
      legacyRequest=await value(db,'SELECT to_jsonb(r) value FROM private.nfse_partner_service_requests r WHERE request_id=$1',[id(1500)]);
      frozenPlan=await value(db,'SELECT to_jsonb(p) value FROM private.nfse_service_financial_plans p WHERE service_id=$1',[legacy.service]);
      frozenTitles=await value(db,'SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) value FROM public.contas_receber c WHERE id=ANY($1::uuid[])',[legacy.titles]);
    });
    await db.exec(await readFile(new URL('../migrations/20261112225400_nfse_service_fixed_financial_category.sql',import.meta.url),'utf8'));
    await t.test('application changes no historical plan, title or already-issued request',async()=>{
      assert.deepEqual(await value(db,'SELECT to_jsonb(p) value FROM private.nfse_service_financial_plans p WHERE service_id=$1',[legacy.service]),frozenPlan);
      assert.deepEqual(await value(db,'SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) value FROM public.contas_receber c WHERE id=ANY($1::uuid[])',[legacy.titles]),frozenTitles);
      assert.deepEqual(await save(db,id(1500),legacyRequest.payload.definition),legacyRequest.response);
      assert.equal(await value(db,'SELECT count(*)::int value FROM private.nfse_partner_service_requests WHERE request_id=$1',[id(1500)]),1);
    });
    await t.test('NFSe-only options and preview expose one authoritative category without broader financial access',async()=>{
      await db.exec("SET test.finance='false';SET test.receber='false'");
      const result=(await options(db)).data;
      assert.deepEqual(result.categories,[{id:canonical,name:'Serviços NFS-e'}]);
      assert.deepEqual(result.existingReceivables,[]);assert.equal(result.capabilities.canIssueBolePix,false);
      for(const categoryId of [id(40),id(999),'not-a-category',null]){
        const plan=(await preview(db,{...planInput,categoryId})).data;
        assert.equal(plan.financialPlan.categoryId,canonical);
        assert.equal(plan.preview.input.categoriaFinanceiraId,canonical);
        assert.equal(plan.financialPlan.previewToken,plan.token);
        assert.deepEqual(plan.preview.parcelas.map(p=>p.valor),[33.33,33.33,33.35]);
        assert.equal(plan.preview.totalNominal,100.01);
      }
      await assert.rejects(preview(db,{...planInput,issueBolePix:true}),e=>e.code==='42501');
    });
    await t.test('save normalizes both untrusted category fields but preserves token, money, terms and BolePix permission',async()=>{
      const local=(await preview(db)).data.financialPlan;
      await assert.rejects(save(db,id(1501),{...definition,serviceDescription:description,amount:'100.01',
        financialPlan:{...local,installments:2}}),e=>e.code==='40001');
      await db.exec("SET test.receber='true'");
      const bank=(await preview(db,{...planInput,issueBolePix:true})).data.financialPlan;
      const input={...definition,serviceDescription:description,amount:'100.01',categoryId:id(40),
        financialPlan:{...bank,categoryId:id(999)}};
      newSaved=await save(db,id(1502),input);
      assert.equal(newSaved.data.receivableAction,'PENDING');
      const persisted=await value(db,'SELECT to_jsonb(p) value FROM private.nfse_service_financial_plans p WHERE service_id=$1',[newSaved.data.id]);
      assert.equal(persisted.category_id,canonical);assert.equal(persisted.financial_input.categoryId,canonical);
      assert.equal(persisted.financial_input.previewToken,bank.previewToken);
      assert.equal(persisted.financial_input.monthlyInterestPercent,2.35);assert.equal(persisted.financial_input.penaltyPercent,1.25);
      assert.equal(persisted.issue_bolepix,true);assert.equal(persisted.requested_by,id(11));assert.equal(persisted.context_key,id(10));
      assert.deepEqual(await save(db,id(1502),input),newSaved);
      assert.deepEqual(await save(db,id(1502),{...input,categoryId:canonical,financialPlan:bank}),newSaved);
      await assert.rejects(save(db,id(1502),{...input,amount:'101.00'}),e=>e.code==='40001');
    });
    await t.test('authorization materializes only the fixed category and preserves all three principal installments',async()=>{
      await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,actor_id,context_id,month)
        VALUES($1,$2,'PRODUCAO','PROCESSING',$3,'{"number":"331"}',$4,$5,'2026-11')`,
        [id(7000),id(1),{source:{kind:'PARTNER_SERVICE',id:newSaved.data.id}},id(11),id(10)]);
      await db.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id=$1",[id(7000)]);
      const rows=(await db.query(`SELECT c.categoria_financeira_id,c.valor,c.polo_id,c.cliente_id,l.installment_number
        FROM private.nfse_service_receivables l JOIN public.contas_receber c ON c.id=l.receivable_id
        WHERE l.service_id=$1 ORDER BY l.installment_number`,[newSaved.data.id])).rows;
      assert.deepEqual(rows.map(r=>Number(r.valor)),[33.33,33.33,33.35]);
      assert(rows.every(r=>r.categoria_financeira_id===canonical&&r.polo_id===id(1)&&r.cliente_id===id(20)));
      assert.equal(await value(db,'SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs WHERE service_id=$1',[newSaved.data.id]),3);
      assert.equal(await value(db,'SELECT count(*)::int value FROM public.contas_receber WHERE id=ANY($1::uuid[]) AND categoria_financeira_id=$2',[legacy.titles,id(40)]),3);
    });
    await t.test('scope, identity and ACL remain mandatory and unavailable canonical configuration fails closed',async()=>{
      await assert.rejects(call(db,'preview_nfse_service_financial_plan_secure',[id(10),id(2),'PRODUCAO','2026-11',id(20),'100.01',description,planInput]),e=>e.code==='42501');
      const functions=['public.get_nfse_partner_service_options_secure(uuid,uuid,text,text)',
        'public.preview_nfse_service_financial_plan_secure(uuid,uuid,text,text,uuid,text,text,jsonb)',
        'public.save_nfse_partner_service_secure(uuid,uuid,text,text,uuid,jsonb)'];
      for(const fn of functions)for(const [role,allowed] of [['authenticated',true],['anon',false],['service_role',false]]){
        assert.equal(await value(db,'SELECT has_function_privilege($1,$2,\'EXECUTE\') value',[role,fn]),allowed);
      }
      assert.equal(await value(db,"SELECT has_function_privilege('authenticated','private.nfse_service_required_category()','EXECUTE') value"),false);
      await db.query("UPDATE public.categorias_financeiras SET status='inativo' WHERE id=$1",[canonical]);
      await assert.rejects(preview(db),e=>e.code==='22023');await assert.rejects(options(db),e=>e.code==='22023');
      assert.deepEqual(await save(db,id(1500),legacyRequest.payload.definition),legacyRequest.response);
      const fixedRequest=await value(db,'SELECT to_jsonb(r) value FROM private.nfse_partner_service_requests r WHERE request_id=$1',[id(1502)]);
      assert.deepEqual(await save(db,id(1502),fixedRequest.payload.definition),newSaved);
      await db.exec("SET test.actor=''");
      await assert.rejects(preview(db),e=>e.code==='42501');await assert.rejects(options(db),e=>e.code==='42501');
      await assert.rejects(save(db,id(1599),definition),e=>e.code==='42501');
    });
  }finally{await db.close();}
});
