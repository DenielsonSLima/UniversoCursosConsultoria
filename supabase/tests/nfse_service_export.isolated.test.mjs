import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareServiceGroups,createGroupService,id,call,value,filters} from './nfse_service_groups.fixture.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const exportRows=(db,args=filters())=>call(db,'exportar_servicos_receber_secure',args);
const summary=(db,args)=>value(db,'SELECT to_jsonb(s) value FROM public.get_servicos_receber_summary($1,$2,$3,$4,$5) s',args);

test('service export uses the complete authorized selection and canonical summary without truncation',async t=>{
  const db=new PGlite();
  try{
    await prepareServiceGroups(db);
    await db.exec(await readFile(new URL('../migrations/20261112225300_nfse_service_receivable_export.sql',import.meta.url),'utf8'));
    const a=await createGroupService(db,1000,{installments:3,amount:'100.01'});
    const b=await createGroupService(db,1001,{partner:id(21),amount:'80.00'});
    const today=await value(db,"SELECT (now() AT TIME ZONE 'America/Maceio')::date::text value");
    await db.query('UPDATE public.contas_receber SET data_vencimento=($2::date-1) WHERE id=$1',[a.titles[0],today]);
    await db.query('UPDATE public.contas_receber SET data_vencimento=$2::date WHERE id=$1',[a.titles[1],today]);
    await db.query('UPDATE public.contas_receber SET data_vencimento=($2::date+1) WHERE id=$1',[a.titles[2],today]);
    await db.query('UPDATE public.contas_receber SET data_vencimento=($2::date+2) WHERE id=$1',[b.titles[0],today]);
    await db.query(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,tipo_lancamento)
      VALUES($1,$2,$3,'Outro crédito comum',777,$4,'PENDENTE','OUTROS_CREDITOS','OUTRO_CREDITO')`,[id(999),id(1),id(20),today]);
    await t.test('full DTO retains canonical projection, ordering, snapshot timestamp and exact totals',async()=>{
      const result=await exportRows(db),list=await call(db,'listar_servicos_receber_secure',[...filters(),1,100]);
      assert.equal(result.total_items,5);assert.deepEqual(result.rows,list.rows);
      assert.deepEqual(result.summary,await summary(db,filters()));
      assert.equal(result.rows[0].id,id(200));assert.equal(result.rows[1].id,a.titles[0]);
      assert.equal(result.rows[1].cliente_id,id(20));assert.equal(result.rows[1].nfse_number,'1000');
      assert.equal(result.rows[1].operation_capabilities.canSettle,true);
      assert.ok(Number.isFinite(Date.parse(result.generated_at)));
      // Compare timestamptz values: JSON uses ISO formatting, Postgres text need not.
      assert.equal(await value(db,"SELECT (public.exportar_servicos_receber_secure($1)->>'generated_at')::timestamptz=statement_timestamp() value",[id(1)]),true);
    });
    await t.test('search, civil dates and status select the same rows and server summary as the list',async()=>{
      const selections=[filters('UPCOMING'),filters('RECEIVED'),filters('PENDING','Beta Serviços'),
        [id(1),null,today,today,'ALL'],filters('ALL','sem correspondência')];
      for(const args of selections){
        const result=await exportRows(db,args),list=await call(db,'listar_servicos_receber_secure',[...args,1,100]);
        assert.deepEqual(result.rows,list.rows);assert.equal(result.total_items,list.total_items);
        assert.deepEqual(result.summary,await summary(db,args));
      }
      assert.equal((await exportRows(db,filters('UPCOMING'))).total_items,3);
      assert.equal((await exportRows(db,filters('ALL','sem correspondência'))).summary.all_count,0);
      await assert.rejects(exportRows(db,filters('invalid')),e=>e.code==='22023');
    });
    await t.test('Receive and polo authorization is enforced before filtering and preserves the authenticated-only ACL',async()=>{
      await db.exec("SET test.finance='false';SET test.receber='true'");
      assert.equal((await exportRows(db)).total_items,5);
      await assert.rejects(exportRows(db,filters('ALL',null,id(2))),e=>e.code==='42501');
      await assert.rejects(exportRows(db,filters('ALL',null,null)),e=>e.code==='42501');
      await db.exec("SET test.finance='true';SET test.receber='false'");
      await assert.rejects(exportRows(db,filters('invalid')),e=>e.code==='42501');
      await db.exec("SET test.receber='true';SET test.actor=''");
      await assert.rejects(exportRows(db),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'`);
      for(const [role,allowed] of [['anon',false],['service_role',false],['authenticated',true]]){
        assert.equal(await value(db,"SELECT has_function_privilege($1,'public.exportar_servicos_receber_secure(uuid,text,date,date,text)','EXECUTE') value",[role]),allowed);
      }
      assert.equal(await value(db,"SELECT provolatile='s' AND prosecdef AND proconfig @> ARRAY['search_path=\"\"'] value FROM pg_proc WHERE oid='public.exportar_servicos_receber_secure(uuid,text,date,date,text)'::regprocedure"),true);
    });
    await t.test('over 5000 selected titles refuses export instead of returning a partial report',async()=>{
      const bulk=[];
      for(let n=3000;n<3084;n++){
        const created=await createGroupService(db,n,{installments:n===3083?21:60,amount:'600.00'});
        bulk.push(...created.titles);
      }
      await db.query("UPDATE public.contas_receber SET descricao='Lote limite sintético' WHERE id=ANY($1::uuid[])",[bulk]);
      assert.equal(bulk.length,5001);
      await assert.rejects(exportRows(db,filters('ALL','Lote limite sintético')),e=>e.code==='54000'&&/Refine os filtros/.test(e.message));
      assert.equal((await exportRows(db,filters('ALL','Beta Serviços'))).total_items,1);
      await db.query("UPDATE public.contas_receber SET descricao='Fora do limite selecionado' WHERE id=$1",[bulk[0]]);
      const boundary=await exportRows(db,filters('ALL','Lote limite sintético'));
      assert.equal(boundary.total_items,5000);assert.equal(boundary.rows.length,5000);assert.equal(boundary.summary.all_count,5000);
    });
  }finally{await db.close();}
});
