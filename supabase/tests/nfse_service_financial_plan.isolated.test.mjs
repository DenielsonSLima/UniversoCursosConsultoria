import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {definition,id,prepareServiceReceivables,scope} from './nfse_service_receivables.fixture.mjs';
const modulePath=process.env.NFSE_TEST_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const financialPlan={installments:3,firstDueDate:'2026-11-30',categoryId:id(40),monthlyInterestPercent:2,
  penaltyPercent:2,discountType:'PERCENTUAL',discountValue:5,discountDaysBeforeDue:3,
  periodicity:'MENSAL_CALENDARIO',issueBolePix:false};

test('service installments use the canonical engine, bind the preview and freeze authorized boleto metadata',async t=>{
  const db=new PGlite();const value=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  const preview=(plan=financialPlan,amount='100.01',description='Serviço agendado')=>value(
    'SELECT public.preview_nfse_service_financial_plan_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    [...Object.values(scope),id(20),amount,description,plan]);
  let plan,saved;
  try{
    await prepareServiceReceivables(db);
    await db.exec("SET test.finance='false';SET test.receber='false'");
    await t.test('three installments preserve principal cents, calendar and standard late terms',async()=>{
      plan=(await preview()).data;
      assert.equal(plan.token,plan.financialPlan.previewToken);
      assert.deepEqual(plan.preview.parcelas.map(p=>p.valor),[33.33,33.33,33.35]);
      assert.deepEqual(plan.preview.parcelas.map(p=>p.dataVencimento),['2026-11-30','2026-12-30','2027-01-30']);
      assert.equal(plan.preview.totalNominal,100.01);
      assert.equal(plan.preview.totalTaxas,0);
      assert.equal(plan.preview.parcelas.every(p=>p.papel==='PARCELA'),true);
      assert.deepEqual(plan.preview.parcelas[0].financialTerms.interest,{type:'monthly-percentage',value:2,startsOn:'2026-12-01'});
      assert.equal(plan.preview.parcelas[0].financialTerms.discount.validUntil,'2026-11-27');
      assert.equal((await preview({...financialPlan,installments:1})).data.preview.parcelas[0].valor,100.01);
      await assert.rejects(preview({...plan.financialPlan,installments:2}),e=>e.code==='40001');
      await assert.rejects(preview({...financialPlan,installments:60},'0.59'),e=>e.code==='22023');
    });
    await t.test('only Receber permission enables BolePix while NFSe-only retains local planning',async()=>{
      await assert.rejects(preview({...financialPlan,issueBolePix:true}),e=>e.code==='42501');
      await db.exec("SET test.receber='true'");
      assert.equal((await preview({...financialPlan,issueBolePix:true})).data.financialPlan.issueBolePix,true);
    });
    await t.test('save freezes terms and authorization creates all parcels with exact authorized text and number',async()=>{
      const input={...definition,serviceDescription:'Serviço agendado',amount:'100.01',financialPlan:plan.financialPlan};
      saved=await value('SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
        [...Object.values(scope),id(500),input]);
      assert.equal(await value('SELECT count(*)::integer value FROM public.contas_receber'),1);
      await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,snapshot,result,authorized_xml)
        VALUES($1,$2,'PRODUCAO','PROCESSING',$3,'{"number":"7"}',$4)`,
        [id(302),id(1),{source:{kind:'PARTNER_SERVICE',id:saved.data.id,serviceDescription:'Texto de prévia'}},
          '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><nNFSe>999</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Serviço &amp; período autorizado</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>']);
      await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(302)}'`);
      const titles=(await db.query(`SELECT c.*,l.fiscal_number,l.fiscal_description,l.installment_number,l.installment_count
        FROM private.nfse_service_receivables l JOIN public.contas_receber c ON c.id=l.receivable_id
        WHERE service_id=$1 ORDER BY installment_number`,[saved.data.id])).rows;
      assert.deepEqual(titles.map(c=>Number(c.valor)),[33.33,33.33,33.35]);
      for(const c of titles){
        assert.equal(c.fiscal_description,'Serviço & período autorizado'); assert.equal(c.fiscal_number,'999');
        assert.equal(c.descricao,`Serviço & período autorizado · NFS-e 999 · Parcela ${c.installment_number}/3`);
        assert.equal(c.gateway_financial_terms_confirmed_at,null);
        assert.equal(c.gateway_financial_terms.nominalAmount,Number(c.valor));
        assert.equal(c.installment_count,3);
      }
      await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(302)}'`);
      await value('SELECT private.ensure_nfse_service_receivable($1) value',[id(302)]);
      assert.equal(await value('SELECT count(*)::integer value FROM public.contas_receber'),4);
    });
    await t.test('document context is service-only and caller read capability follows Receber and polo',async()=>{
      const first=await value('SELECT receivable_id value FROM private.nfse_service_receivables WHERE service_id=$1 AND installment_number=1',[saved.data.id]);
      await assert.rejects(value('SELECT public.get_nfse_service_boleto_context_internal($1) value',[first]),e=>e.code==='42501');
      assert.equal(await value('SELECT public.can_read_nfse_service_boleto_secure($1) value',[first]),true);
      await db.exec("SET test.role='service_role'");
      const context=await value('SELECT public.get_nfse_service_boleto_context_internal($1) value',[first]);
      const ids=(await db.query('SELECT receivable_id FROM private.nfse_service_receivables WHERE service_id=$1 ORDER BY installment_number',[saved.data.id]))
        .rows.map(row=>row.receivable_id);
      assert.deepEqual(context,{invoiceNumber:'999',serviceDescription:'Serviço & período autorizado',installmentNumber:1,
        installmentCount:3,operationId:id(302),serviceId:saved.data.id,receivableIds:ids});
      assert.equal(await value('SELECT public.get_nfse_service_boleto_context_internal($1) value',[id(999)]),null);
      await db.exec("SET test.role='authenticated';SET test.receber='false'");
      assert.equal(await value('SELECT public.can_read_nfse_service_boleto_secure($1) value',[first]),false);
      await db.exec(`SET test.receber='true';SET test.polo='${id(2)}'`);
      assert.equal(await value('SELECT public.can_read_nfse_service_boleto_secure($1) value',[first]),false);
    });
    await t.test('classification and fiscal cancellation publish finance invalidation metadata',async()=>{
      assert.equal(await value("SELECT count(*)::integer value FROM public.finance_realtime_events WHERE source_table='contas_receber'"),4);
      await db.exec(`INSERT INTO private.nfse_individual_cancellations(id,operation_id,state) VALUES('${id(400)}','${id(302)}','CANCELLED')`);
      assert.equal(await value("SELECT count(*)::integer value FROM public.finance_realtime_events WHERE source_table='contas_receber'"),7);
      assert.equal(await value('SELECT state value FROM private.nfse_individual_operations WHERE id=$1',[id(302)]),'AUTHORIZED');
      const first=await value('SELECT receivable_id value FROM private.nfse_service_receivables WHERE service_id=$1 AND installment_number=1',[saved.data.id]);
      await db.exec("SET test.role='service_role'");
      const context=await value('SELECT public.get_nfse_service_boleto_context_internal($1) value',[first]);
      assert.equal(context.invoiceNumber,'999');assert.equal(context.serviceDescription,'Serviço & período autorizado');
      await db.exec(`SET test.role='authenticated';SET test.receber='true';SET test.polo='${id(1)}'`);
      assert.equal(await value('SELECT public.can_read_nfse_service_boleto_secure($1) value',[first]),true);
    });
    await t.test('preview binds the final rendered period while save preserves the fiscal template contract',async()=>{
      await db.exec(`SET test.polo='${id(1)}';SET test.receber='true';
        INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
        SELECT '${id(31)}',polo_id,environment,definition||'{"serviceDescription":"Serviço {{periodo}}"}',created_by,updated_by
          FROM private.nfse_models WHERE id='${id(30)}'`);
      const expanded='Serviço 01/11/2026 ATÉ 30/11/2026';
      const prepared=(await preview(financialPlan,'90.00',expanded)).data;
      const input={...definition,modelId:id(31),serviceDescription:'Serviço {{periodo}}',amount:'90.00',
        servicePeriodStart:'2026-11-01',servicePeriodEnd:'2026-11-30',financialPlan:prepared.financialPlan};
      const save=(changes,request)=>value('SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
        [...Object.values(scope),request,{...input,...changes}]);
      await assert.rejects(save({servicePeriodEnd:'2026-12-01'},id(501)),e=>e.code==='40001');
      const result=await save({},id(502));
      assert.equal(await value('SELECT service_description value FROM private.nfse_partner_services WHERE id=$1',[result.data.id]),expanded);
      assert.equal(await value('SELECT count(*)::integer value FROM private.nfse_service_receivables WHERE service_id=$1',[result.data.id]),0);
    });
  }finally{await db.close();}
});
