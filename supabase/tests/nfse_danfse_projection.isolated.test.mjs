import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const readMigration = name => readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture = await readFile(new URL('./nfse_partner_services.fixture.sql',import.meta.url),'utf8');
const migrations = await Promise.all(['20261108225453_nfse_models_private_store.sql',
  '20261109000433_nfse_danfse_projection.sql'].map(readMigration));
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12,'0')}`;
const scope={context:id(10),polo:id(1),environment:'HOMOLOGACAO',month:'2026-11'};
const absent={exclusions:null,totalIBSCBS:null,socialRetentions:null,pisOwn:null,cofinsOwn:null};
const moneyKeys=['vDescIncond','vCalcReeRepRes','vISSQN','vPis','vCofins','vIBSTot','vCBS','vRetCSLL'];

test('DANFSe projection is exact, optional-aware, read-only and pilot-scoped',async t=>{
  const db=new PGlite();
  const projection=async(components={hasIbsCbs:false},changes={})=>(await db.query(
    'SELECT public.get_nfse_danfse_projection_secure($1,$2,$3,$4,$5) value',
    [...Object.values({...scope,...changes}),JSON.stringify(components)])).rows[0].value;
  try {
    await db.exec(fixture);
    await db.exec(`INSERT INTO public.polos VALUES('${id(1)}','ativo'),('${id(2)}','ativo'),('${id(3)}','inativo');
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      SET test.actor='${id(11)}';`);
    for(const migration of migrations) await db.exec(migration);
    await t.test('all missing values remain null, including a present but empty IBS/CBS group',async()=>{
      assert.deepEqual((await projection()).data,absent);
      assert.deepEqual((await projection({hasIbsCbs:true})).data,absent);
      assert.deepEqual((await projection({hasIbsCbs:false,...Object.fromEntries(moneyKeys.map(key=>[key,null])),tpRetPisCofins:null})).data,absent);
    });
    await t.test('optional parcels sum only explicit values; no source zero is invented',async()=>{
      const result=await projection({hasIbsCbs:true,vDescIncond:'1.23',vISSQN:'4.56',vPis:'0.10',vCofins:'0.20',tpRetPisCofins:'2'});
      assert.deepEqual(result.scope,{contextKey:scope.context,poloId:scope.polo,environment:scope.environment,month:scope.month});
      assert.deepEqual(result.data,{exclusions:'6.09',totalIBSCBS:null,socialRetentions:null,pisOwn:'0.10',cofinsOwn:'0.20'});
      assert.equal((await projection({hasIbsCbs:false,vISSQN:'4.56'})).data.exclusions,null);
      assert.equal((await projection({hasIbsCbs:true,vDescIncond:'0'})).data.exclusions,'0.00');
    });
    await t.test('combined IBS/CBS requires both mandatory totals and preserves decimal arithmetic',async()=>{
      for(const input of [{vIBSTot:'1.23'},{vCBS:'4.56'}])
        assert.equal((await projection({hasIbsCbs:true,...input})).data.totalIBSCBS,null);
      assert.equal((await projection({hasIbsCbs:true,vIBSTot:'0.10',vCBS:'0.20'})).data.totalIBSCBS,'0.30');
      assert.equal((await projection({hasIbsCbs:true,vIBSTot:'0',vCBS:'0'})).data.totalIBSCBS,'0.00');
    });
    await t.test('legacy retention aggregates its optional parcels and determines own-debit zeros',async()=>{
      assert.deepEqual((await projection({hasIbsCbs:false,tpRetPisCofins:'1',vRetCSLL:'3.33',vPis:'0.10',vCofins:'0.20'})).data,
        {...absent,socialRetentions:'3.63',pisOwn:'0.00',cofinsOwn:'0.00'});
      assert.deepEqual((await projection({hasIbsCbs:false,tpRetPisCofins:'1',vPis:'0.10'})).data,
        {...absent,socialRetentions:'0.10',pisOwn:'0.00',cofinsOwn:'0.00'});
      assert.deepEqual((await projection({hasIbsCbs:false,tpRetPisCofins:'1'})).data,
        {...absent,pisOwn:'0.00',cofinsOwn:'0.00'});
    });
    await t.test('new retention domains keep vRetCSLL aggregate and own amounts distinct',async()=>{
      for(const tpRetPisCofins of ['0','2','3','4','5','6','7','8','9']) {
        assert.deepEqual((await projection({hasIbsCbs:false,tpRetPisCofins,vRetCSLL:'9',vPis:'1',vCofins:'2'})).data,
          {...absent,socialRetentions:'9.00',pisOwn:'1.00',cofinsOwn:'2.00'});
      }
      // A missing optional code must not reclassify PIS/COFINS as own debits.
      assert.deepEqual((await projection({hasIbsCbs:false,vRetCSLL:'9.00',vPis:'1.00',vCofins:'2.00'})).data,
        {...absent,socialRetentions:'9.00'});
    });
    await t.test('maximum XSD values and cents retain exact precision beyond JS safe integers',async()=>{
      const result=await projection({hasIbsCbs:true,tpRetPisCofins:'1',
        ...Object.fromEntries(moneyKeys.map(key=>[key,'999999999999999.99']))});
      assert.deepEqual(result.data,{exclusions:'4999999999999999.95',totalIBSCBS:'1999999999999999.98',
        socialRetentions:'2999999999999999.97',pisOwn:'0.00',cofinsOwn:'0.00'});
    });
    await t.test('strict whitelist rejects XML, personal data, numbers, rounding and malformed domains',async()=>{
      for(const bad of [null,[],{},'xml',{hasIbsCbs:'true'},{hasIbsCbs:null},
        {hasIbsCbs:false,xml:'<NFSe/>'},{hasIbsCbs:false,cnpj:'synthetic'},
        ...['',' ','-1.00','+1.00','1,00','1.2','1.2345','01.00','1e3','NaN','Infinity','1000000000000000.00',1,true,{}]
          .map(vPis=>({hasIbsCbs:false,vPis})),
        ...['',10,'10','-1',1,true].map(tpRetPisCofins=>({hasIbsCbs:false,tpRetPisCofins})),
        ...['vIBSTot','vCBS','vCalcReeRepRes'].map(key=>({hasIbsCbs:false,[key]:'1.00'}))]) {
        await assert.rejects(projection(bad),e=>e.code==='22023');
      }
    });
    await t.test('authorization runs before parsing and blocks foreign, revoked and anonymous scopes',async()=>{
      for(const changes of [{context:id(99)},{polo:id(2)},{polo:id(3)}])
        await assert.rejects(projection({unknown:true},changes),e=>e.code==='42501');
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(projection(),e=>e.code==='42501');
      await db.exec(`UPDATE public.test_context SET allowed=true; SET test.actor='${id(99)}'`);
      await assert.rejects(projection(),e=>e.code==='42501');
      await db.exec("SET test.actor=''"); await assert.rejects(projection(),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'`);
      await assert.rejects(projection(undefined,{month:'2026-13'}),e=>e.code==='22023');
    });
    await t.test('authenticated-only stable RPC does not write even in a read-only transaction',async()=>{
      const signature='public.get_nfse_danfse_projection_secure(uuid,uuid,text,text,jsonb)';
      const meta=(await db.query(`SELECT p.provolatile,p.prosecdef,p.proconfig,
        has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
        has_function_privilege('anon',$1,'EXECUTE') anon,
        has_function_privilege('service_role',$1,'EXECUTE') service_role
        FROM pg_proc p WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
      assert.equal(meta.provolatile,'s'); assert.equal(meta.prosecdef,true);
      assert(meta.proconfig.includes('search_path=""'));
      assert.equal(meta.authenticated,true); assert.equal(meta.anon,false); assert.equal(meta.service_role,false);
      await db.exec('BEGIN READ ONLY; SET LOCAL ROLE authenticated');
      assert.equal((await projection({hasIbsCbs:true,vIBSTot:'0.10',vCBS:'0.20'})).data.totalIBSCBS,'0.30');
      await db.exec('ROLLBACK');
      assert.equal((await db.query('SELECT count(*)::integer n FROM private.nfse_model_requests')).rows[0].n,0);
      assert.equal((await db.query('SELECT count(*)::integer n FROM public.contas_receber')).rows[0].n,0);
    });
  } finally {await db.close();}
});
