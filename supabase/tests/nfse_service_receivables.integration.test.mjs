import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {definition,id,prepareServiceReceivables,scope} from './nfse_service_receivables.fixture.mjs';
const modulePath=process.env.NFSE_TEST_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const migration=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');

test('real queue bridge/removal rules accept pending plans and preserve observation after authorization',async()=>{
  const db=new PGlite();const value=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  try{
    await prepareServiceReceivables(db);
    await db.exec(`ALTER TABLE private.nfse_individual_operations ADD COLUMN month text,
      ADD COLUMN request_id uuid,ADD COLUMN signed_dps_xml text;
      CREATE TABLE private.nfse_partner_service_removals(service_id uuid PRIMARY KEY);
      CREATE FUNCTION private.nfse_error_archivable(private.nfse_individual_operations)
        RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
      CREATE FUNCTION private.authorize_nfse_individual_internal(uuid,uuid,uuid,text,text)
        RETURNS void LANGUAGE plpgsql AS $$BEGIN
          IF $1 IS DISTINCT FROM auth.uid() OR $3 IS DISTINCT FROM '${id(1)}'::uuid THEN
            RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;END$$;
      CREATE FUNCTION private.nfse_queue_operation_basis(text,uuid,uuid,text,text)
        RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'source must not be revalidated after authorization';END$$;
      CREATE FUNCTION public.nfse_individual_operation_core_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
        RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('state',state) FROM private.nfse_individual_operations WHERE id=$8$$;`);
    await db.exec(await migration('20261112171502_nfse_multiuser_operation_bridge.sql'));
    await db.exec(await migration('20261112173000_nfse_unsigned_service_removal.sql'));
    const saved=await value('SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
      [...Object.values(scope),id(500),definition]);
    assert.equal(saved.data.receivableAction,'PENDING');
    assert.equal(await value('SELECT private.nfse_partner_service_removable($1) value',[saved.data.id]),true);
    await db.query(`INSERT INTO private.nfse_individual_operations(id,polo_id,environment,month,request_id,state,snapshot,result)
      VALUES($1,$2,'PRODUCAO','2026-11',$3,'PROCESSING',$4,'{"number":"3"}')`,
      [id(302),id(1),id(600),{source:{kind:'PARTNER_SERVICE',id:saved.data.id}}]);
    await db.query('INSERT INTO private.nfse_queue_operation_links VALUES($1,$2,$3)',
      ['PARTNER_SERVICE',saved.data.id,id(302)]);
    await db.exec(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id='${id(302)}'`);
    assert.equal(await value('SELECT private.nfse_partner_service_removable($1) value',[saved.data.id]),false);
    for(const action of ['READ','CLAIM']){
      const result=await value('SELECT public.nfse_individual_operation_internal($1,$2,$3,$4,$5,$6,$7,$8,NULL) value',
        [id(11),...Object.values(scope),id(600),action,id(302)]);
      assert.equal(result.state,'AUTHORIZED');
    }
    assert.equal(await value('SELECT count(*)::integer value FROM private.nfse_service_receivables WHERE service_id=$1',[saved.data.id]),1);
  }finally{await db.close();}
});
