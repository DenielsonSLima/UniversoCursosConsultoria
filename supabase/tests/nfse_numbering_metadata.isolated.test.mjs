import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const source=await readFile(new URL('../migrations/20261111010414_nfse_numbering_metadata.sql',import.meta.url),'utf8');
test('numbering reads local authorization and the actual allocator without advancing it',async t=>{
  const db=new PGlite();
  const get=(changes={})=>db.query('SELECT public.get_nfse_numbering_secure($1,$2,$3,$4) value',
    Object.values({context:id(10),polo:id(1),environment:'PRODUCAO',month:'2026-11',...changes})).then(r=>r.rows[0].value);
  const denies=(promise)=>assert.rejects(promise,e=>e.code==='42501');
  const allocator=async()=>(await db.query('SELECT last_value::text value,is_called FROM private.nfse_individual_operations_number_seq')).rows[0];
  try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      CREATE SCHEMA private;CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon')$$;
      CREATE TABLE public.test_access(allowed boolean);INSERT INTO public.test_access VALUES(true);
      CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$BEGIN
        IF auth.uid() IS DISTINCT FROM '${id(11)}'::uuid OR $1 IS DISTINCT FROM '${id(10)}'::uuid
          OR $2 NOT IN('${id(1)}'::uuid,'${id(2)}'::uuid) OR $3 NOT IN('PRODUCAO','HOMOLOGACAO')
          OR $4 !~ '^2026-[0-9]{2}$' OR NOT(SELECT allowed FROM public.test_access) THEN
          RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;RETURN '${id(1)}'::uuid;END$$;
      CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,environment text,
        series text DEFAULT '49998',number bigint GENERATED ALWAYS AS IDENTITY(MAXVALUE 5),state text,result jsonb,authorized_xml text,updated_at timestamptz DEFAULT now());
      CREATE TABLE private.nfse_individual_cancellations(operation_id uuid PRIMARY KEY,state text,event_xml text);
      CREATE TABLE private.nfse_homologation_pilots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,environment text,
        state text,result jsonb,authorized_xml text,updated_at timestamptz DEFAULT now());
      CREATE TABLE public.external_notes(number text);INSERT INTO public.external_notes VALUES('255');
      SET request.jwt.claim.sub='${id(11)}';SET request.jwt.claims='{"role":"authenticated"}';`);
    await db.exec(source);
    await t.test('absence stays null and does not infer external numbering',async()=>{
      const before=await allocator();const value=await get();
      assert.equal(value.data.lastAuthorized,null);assert.equal(value.data.dps.lastAllocated,null);assert.equal(value.data.dps.nextNumber,'1');
      assert.equal(value.data.dps.nextNumberIsEstimate,true);assert.equal(value.data.dps.allocatorScope,'SHARED_DATABASE_IDENTITY');
      assert.deepEqual(value.scope,{contextKey:id(10),poloId:id(1),environment:'PRODUCAO',month:'2026-11'});
      assert.deepEqual(await allocator(),before);
    });
    await db.query("INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,result) VALUES($1,$2,'PRODUCAO','REJECTED',$3)",[id(21),id(1),{codes:['E0120']}]);
    await db.query("INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,result) VALUES($1,$2,'PRODUCAO','PREVIEWED','{}')",[id(22),id(2)]);
    await db.query("INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,result,authorized_xml,updated_at) VALUES($1,$2,'PRODUCAO','AUTHORIZED',$3,'<NFSe/>','2026-11-10T17:00:00Z')",[id(23),id(1),{number:'7'}]);
    await db.query("INSERT INTO private.nfse_individual_operations(id,polo_id,environment,state,result,authorized_xml,updated_at) VALUES($1,$2,'PRODUCAO','AUTHORIZED',$3,'<NFSe/>','2026-11-10T18:00:00Z')",[id(24),id(1),{number:'5'}]);
    await db.query("INSERT INTO private.nfse_individual_cancellations VALUES($1,'CANCELLED','<evento/>')",[id(24)]);
    await t.test('latest authorization is chronological, retained after cancellation and unrelated to DPS number',async()=>{
      const before=await allocator();const value=await get();
      assert.equal(value.data.lastAuthorized.number,'5');assert.equal(value.data.lastAuthorized.state,'CANCELLED');
      assert.equal(value.data.lastAuthorized.authorizedAt,'2026-11-10T18:00:00+00:00');
      assert.equal(value.data.dps.series,'49998');assert.equal(value.data.dps.lastAllocated,'4');assert.equal(value.data.dps.nextNumber,'5');
      assert.deepEqual(await allocator(),before);
    });
    await t.test('scope partitions persisted allocations; shared next estimate comes from the actual sequence',async()=>{
      const other=await get({polo:id(2)});assert.equal(other.data.lastAuthorized,null);
      assert.equal(other.data.dps.lastAllocated,'2');assert.equal(other.data.dps.nextNumber,'5');
      const homo=await get({environment:'HOMOLOGACAO'});assert.equal(homo.data.lastAuthorized,null);assert.equal(homo.data.dps,null);
      await db.query("INSERT INTO private.nfse_homologation_pilots(polo_id,environment,state,result,authorized_xml) VALUES($1,'HOMOLOGACAO','AUTHORIZED',$2,'<NFSe/>')",[id(1),{number:'8'}]);
      assert.equal((await get({environment:'HOMOLOGACAO'})).data.lastAuthorized.number,'8');assert.equal((await get()).data.lastAuthorized.number,'5');
    });
    await t.test('rejections and preview allocations are included, while an aborted allocation is not falsely reused',async()=>{
      await db.exec('BEGIN');await db.query("INSERT INTO private.nfse_individual_operations(polo_id,environment,state,result) VALUES($1,'PRODUCAO','REJECTED','{}')",[id(1)]);await db.exec('ROLLBACK');
      const before=await allocator();assert.deepEqual(before,{value:'5',is_called:true});
      const value=await get();assert.equal(value.data.dps.lastAllocated,'4');assert.equal(value.data.dps.nextNumber,null);
      assert.deepEqual(await allocator(),before);
    });
    await t.test('scope revocation and non-user channels are denied before metadata reads',async()=>{
      await denies(get({polo:id(99)}));await denies(get({context:id(99)}));
      await db.exec('UPDATE public.test_access SET allowed=false');await denies(get());
      await db.exec('UPDATE public.test_access SET allowed=true');await db.exec("SET request.jwt.claims='{"+'"role":"service_role"'+"}'");await denies(get());
      const acl=(await db.query("SELECT has_function_privilege('authenticated','public.get_nfse_numbering_secure(uuid,uuid,text,text)','EXECUTE') authenticated,has_function_privilege('anon','public.get_nfse_numbering_secure(uuid,uuid,text,text)','EXECUTE') anon,has_function_privilege('service_role','public.get_nfse_numbering_secure(uuid,uuid,text,text)','EXECUTE') service")).rows[0];
      assert.deepEqual(acl,{authenticated:true,anon:false,service:false});
    });
  }finally{await db.close();}
});
