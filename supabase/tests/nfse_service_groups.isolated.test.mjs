import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareServiceGroups,createGroupService,id,call,value,groups,items,filters} from './nfse_service_groups.fixture.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const capability=(db,title)=>value(db,'SELECT private.nfse_service_receivable_capabilities(c) value FROM public.contas_receber c WHERE id=$1',[title]);
const title=(db,key)=>value(db,'SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[key]);

test('service groups expose bounded canonical rows, filters and protected financial capabilities',async t=>{
  const db=new PGlite();let a,b,c;
  try{
    await prepareServiceGroups(db);
    a=await createGroupService(db,1000,{installments:3,amount:'100.01'});
    b=await createGroupService(db,1001,{partner:id(21),amount:'80.00'});
    c=await createGroupService(db,1002,{partner:id(22),amount:'90.00'});
    const today=await value(db,"SELECT (now() AT TIME ZONE 'America/Maceio')::date::text value");
    await db.query(`UPDATE public.contas_receber SET data_vencimento=($2::date-2) WHERE id=$1`,[a.titles[0],today]);
    await db.query('UPDATE public.contas_receber SET data_vencimento=$2::date WHERE id=$1',[a.titles[1],today]);
    await db.query('UPDATE public.contas_receber SET data_vencimento=($2::date+2) WHERE id=$1',[a.titles[2],today]);
    await db.query('UPDATE public.contas_receber SET data_vencimento=($2::date+3) WHERE id=$1',[b.titles[0],today]);
    await db.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=valor,data_vencimento=($2::date+4) WHERE id=$1",[c.titles[0],today]);
    await db.query(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,tipo_lancamento)
      VALUES($1,$2,$3,'Outro crédito comum',777,$4,'PENDENTE','OUTROS_CREDITOS','OUTRO_CREDITO')`,[id(999),id(1),id(20),today]);
    await t.test('pagination counts partners independently from receipts and preserves first canonical projection',async()=>{
      const page=await groups(db,{size:2});assert.equal(page.total_items,3);assert.equal(page.total_receivables,6);
      assert.deepEqual(page.groups.map(x=>x.label),['Alfa Serviços','Beta Serviços']);
      assert.equal(page.groups[0].key,id(20));assert.equal(page.groups[0].item_count,4);
      assert.equal(page.groups[0].pending_count,3);assert.equal(page.groups[0].received_count,1);
      assert.equal(page.groups[0].canceled_count,0);assert.equal(page.groups[0].first.id,id(200));
      assert.equal(page.groups[0].first.cliente_id,id(20));assert.equal(page.groups[0].first.nfse_number,'1');
      assert.equal(page.groups[0].first.operation_capabilities.canSettle,false);
      assert.equal(page.groups[1].first.operation_capabilities.canSettle,true);
      assert.equal(page.groups[0].first.operation_capabilities.canEmit,false);
      const next=await groups(db,{size:2,page:2});assert.deepEqual(next.groups.map(x=>x.key),[id(22)]);
      assert.equal(next.total_receivables,6);assert.equal((await groups(db,{page:100})).groups.length,0);
    });
    await t.test('UPCOMING includes today and future open titles without including future paid titles',async()=>{
      const upcoming=await groups(db,{status:'UPCOMING'});assert.equal(upcoming.total_items,2);
      assert.equal(upcoming.total_receivables,3);assert.equal(upcoming.groups[0].item_count,2);
      assert.equal(upcoming.groups[0].next_due,today);
      const all=(await db.query('SELECT * FROM public.get_servicos_receber_summary($1)',[id(1)])).rows[0];
      const future=(await db.query('SELECT * FROM public.get_servicos_receber_summary($1,NULL,NULL,NULL,$2)',[id(1),'UPCOMING'])).rows[0];
      assert.equal(Number(all.pending_value),180.01);assert.equal(Number(all.received_value),140);
      assert.equal(Number(future.pending_value),146.68);assert.equal(Number(future.received_value),0);
      assert.equal((await groups(db,{status:'PENDING'})).total_receivables,4);
      assert.equal((await groups(db,{status:'RECEIVED'})).total_receivables,2);
      assert.equal((await groups(db,{status:'OVERDUE'})).total_receivables,1);
      assert.equal((await groups(db,{status:'CANCELLED'})).total_receivables,0);
      const flat=await call(db,'listar_servicos_receber_secure',[...filters('UPCOMING'),1,50]);
      assert.equal(flat.total_items,3);assert.equal(flat.rows[0].operation_capabilities.canSettle,true);
    });
    await t.test('partner items remain scoped by partner, period and canonical search',async()=>{
      assert.equal((await items(db,id(20))).total_items,4);
      assert.deepEqual((await items(db,id(21))).rows.map(x=>x.id),b.titles);
      assert.equal((await items(db,id(999))).total_items,0);
      assert.equal((await groups(db,{search:'Beta Serviços'})).groups[0].key,id(21));
      assert.equal((await items(db,id(20),{search:'Beta Serviços'})).total_items,0);
      const dated=await call(db,'listar_servicos_receber_group_items',[id(1),null,today,today,'ALL',id(20),1,25]);
      assert.deepEqual(dated.rows.map(x=>x.id),[a.titles[1]]);
      await assert.rejects(groups(db,{polo:id(2)}),e=>e.code==='42501');
      await assert.rejects(items(db,id(20),{polo:id(2)}),e=>e.code==='42501');
    });
    await t.test('expanded partner receipts are limited to25 without truncating totals or duplicating pages',async()=>{
      await createGroupService(db,1003,{installments:30,amount:'300.00'});
      const first=await items(db,id(20)),second=await items(db,id(20),{page:2});
      assert.equal(first.rows.length,25);assert.equal(second.rows.length,9);assert.equal(first.total_items,34);
      assert.equal(new Set([...first.rows,...second.rows].map(x=>x.id)).size,34);
      assert.ok(first.rows.every(x=>x.cliente_id===id(20)));assert.equal((await groups(db)).total_receivables,36);
      await assert.rejects(items(db,id(20),{size:26}),e=>e.code==='22023');
      await assert.rejects(groups(db,{size:101}),e=>e.code==='22023');
      await assert.rejects(groups(db,{status:'unknown'}),e=>e.code==='22023');
      await assert.rejects(call(db,'get_servicos_receber_groups',[id(1),null,'2026-12-01','2026-11-01','ALL',1,20]),e=>e.code==='22023');
    });
    await t.test('partial collection stays canonical while fiscal cancellation makes it read-only without changing money',async()=>{
      const key=a.titles[2];
      await db.query(`INSERT INTO public.financial_payment_events(id,source_kind,source_id,received_amount,original_cents,payment_cents,principal_cents)
        VALUES($1,'RECEIVABLE',$2,10,3335,1000,1000)`,[id(998),key]);
      await db.query("UPDATE public.contas_receber SET valor_pago=10,data_pagamento='2026-11-12' WHERE id=$1",[key]);
      const partial=await capability(db,key);assert.equal(partial.canSettle,true);assert.equal(partial.provenanceKind,'MANUAL_PAYMENT_LEDGER');
      const before=await title(db,key);await db.query('UPDATE private.nfse_service_receivables SET fiscal_cancelled_at=now() WHERE receivable_id=$1',[key]);
      const blocked=await capability(db,key);assert.equal(blocked.canSettle,false);assert.match(blocked.readOnlyReason,/NFS-e cancelada/);
      assert.deepEqual(await title(db,key),before);assert.equal(await value(db,'SELECT count(*)::int value FROM public.financial_payment_events'),1);
      assert.equal((await items(db,id(20))).rows.find(x=>x.id===key).operation_capabilities.canSettle,false);
    });
    await t.test('pending/review cancellation blocks settlement but never changes the physical financial state',async()=>{
      const key=b.titles[0];
      await db.query("INSERT INTO private.nfse_individual_cancellations(id,operation_id,state) VALUES($1,$2,'PROCESSING')",[id(900),b.operation]);
      await db.query(`INSERT INTO private.nfse_service_cancellation_jobs(receivable_id,service_id,operation_id,cancellation_id,
        fiscal_actor_id,fiscal_context_key,bank_actor_id,polo_id,month,intent)
        SELECT c.id,l.service_id,l.operation_id,$2,$3,$4,$3,c.polo_id,'2026-11',private.nfse_service_cancellation_identity(c,l)
        FROM public.contas_receber c JOIN private.nfse_service_receivables l ON l.receivable_id=c.id WHERE c.id=$1`,[key,id(900),id(11),id(10)]);
      const before=await title(db,key);assert.equal((await capability(db,key)).canSettle,false);
      assert.match((await capability(db,key)).readOnlyReason,/processamento/);
      await db.query("UPDATE private.nfse_service_cancellation_jobs SET state='REVIEW' WHERE receivable_id=$1",[key]);
      assert.match((await capability(db,key)).readOnlyReason,/revisão/);assert.deepEqual(await title(db,key),before);
      assert.equal((await capability(db,c.titles[0])).canSettle,false);
    });
    await t.test('existing BolePix uses canonical identity and never grants new issue/cancel permission',async()=>{
      const key=a.titles[0];
      await db.query(`UPDATE public.contas_receber SET gateway_provider='banese_card',gateway_environment='production',
        gateway_payment_method='BOLETO',gateway_payment_id='000004681',gateway_boleto_nosso_numero='000004681' WHERE id=$1`,[key]);
      assert.equal((await capability(db,key)).canOpenExisting,false);
      await db.query(`INSERT INTO public.payment_gateway_transactions(receivable_id,provider_code,environment,payment_method,remote_payment_id,
        amount,bank_slip_our_number) SELECT id,'banese_card','production','BOLETO','000004681',valor,'000004681' FROM public.contas_receber WHERE id=$1`,[key]);
      const cap=await capability(db,key);assert.equal(cap.canOpenExisting,true);assert.equal(cap.canEmit,false);assert.equal(cap.canCancel,false);
      await db.query('INSERT INTO internal_proesc.obligation_links VALUES($1)',[key]);assert.equal((await capability(db,key)).canSettle,false);
      assert.equal((await capability(db,key)).canOpenExisting,false);
    });
    await t.test('authorization precedes the page and capabilities cannot replace caller permissions',async()=>{
      await db.exec("SET test.receber='false';SET test.finance='true'");
      await assert.rejects(groups(db),e=>e.code==='42501');await assert.rejects(items(db,id(20)),e=>e.code==='42501');
      assert.equal((await capability(db,a.titles[1])).canSettle,false);
      await db.exec("SET test.receber='true';SET test.actor=''");await assert.rejects(groups(db),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'`);await assert.rejects(groups(db,{polo:null}),e=>e.code==='42501');
      for(const role of ['anon','service_role'])assert.equal(await value(db,"SELECT has_function_privilege($1,'public.get_servicos_receber_groups(uuid,text,date,date,text,integer,integer)','EXECUTE') value",[role]),false);
      assert.equal(await value(db,"SELECT has_function_privilege('authenticated','private.nfse_service_receivable_capabilities(public.contas_receber)','EXECUTE') value"),false);
      assert.equal(await value(db,"SELECT has_function_privilege('authenticated','public.listar_servicos_receber_group_items(uuid,text,date,date,text,uuid,integer,integer)','EXECUTE') value"),true);
    });
  }finally{await db.close();}
});
