import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.NFSE_TEST_PGLITE_MODULE ? pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href : '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope = [id(10),id(1),'PRODUCAO','2026-11'];
const defaults = ['EMITIDA',null,1,25,'2026-11-01','2026-11-30',null,null,'ACTIVE',null];

test('issued period totals and report share authorized filter snapshot before pagination', async t => {
 const db = new PGlite();
 const query = async (sql,args) => (await db.query(sql,args)).rows[0].value;
 const list = (changes={}, customScope=scope) => query(`select public.get_nfse_documents_secure(${Array.from({length:14},(_,i)=>'$'+(i+1))}) value`,
   [...customScope,...defaults.map((value,i)=>Object.hasOwn(changes,i)?changes[i]:value)]);
 const report = (changes={}) => query('select public.get_nfse_issued_report_secure($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
   [...scope,...[null,'2026-11-01','2026-11-30',null,null].map((value,i)=>Object.hasOwn(changes,i)?changes[i]:value)]);
 const insert = async (n,{date='2026-11-15T12:00:00Z',month='2026-11',amount='10.01',state='AUTHORIZED',kind='ACADEMIC_QUEUE',polo=id(1),env='PRODUCAO'}={}) => {
   await db.query('insert into private.nfse_individual_operations values($1,$2)',[id(n),date]);
   await db.query(`insert into private.nfse_operation_source_projection(operation_id,source_id,source_kind,polo_id,environment,month,issue_state,state,
    snapshot,command,result,number,access_key) values($1,$1,$2,$3,$4,$5,$6,$6,$7,$8,'{}',$9,$10)`,
    [id(n),kind,polo,env,month,state,{recipient:{name:`Nota sintética ${n}`},model:{definition:{name:'Modelo sintético'}},
      source:{preparation:{snapshot:{academic:{courseType:'TECNICO',classLabel:'Turma sintética'}}}}},{amount},String(n),String(n).padStart(50,'0')]);
 };
 try {
  await db.exec(await readFile(new URL('./nfse_issued_period.fixture.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261111120000_nfse_issued_period_report.sql',import.meta.url),'utf8'));
  for(let n=100;n<130;n++) await insert(n);
  await insert(130,{date:'2026-11-01T02:59:59Z'}); // Still October in Maceio.
  await insert(131,{date:'2026-12-01T02:59:59Z',month:'2026-10'}); // Last November minute, prepared October.
  await insert(132,{date:'2026-12-01T03:00:00Z'}); // December local.
  await insert(133,{state:'REJECTED'});
  await insert(134,{polo:id(2)});
  await insert(135,{env:'HOMOLOGACAO'});
  await insert(136,{kind:'PARTNER_SERVICE',amount:'100.20'});
  await insert(137); await db.query('insert into private.nfse_confirmed_cancellations values($1)',[id(137)]);
  await t.test('all matching amounts, boundaries, confirmed cancellations, cross-preparation month and scope',async()=>{
   const first=(await list()).data, second=(await list({2:2})).data;
   assert.equal(first.totalItems,32);assert.equal(first.rows.length,25);assert.equal(second.rows.length,7);
   assert.equal(first.totalAmount,'410.51');assert.equal(second.totalAmount,'410.51');
   assert([...first.rows,...second.rows].some(row=>row.id===id(131)));
   assert(![...first.rows,...second.rows].some(row=>[130,132,133,134,135,137].some(n=>row.id===id(n))));
   const full=await report(); assert.deepEqual(full.scope,{contextKey:id(10),poloId:id(1),environment:'PRODUCAO',month:'2026-11'});
   assert.equal(full.data.rows.length,32);assert.equal(full.data.totalAmount,first.totalAmount);
   assert(Number.isFinite(Date.parse(full.data.generatedAt)));
  });
  await t.test('search, course and origin use the same set in list and report',async()=>{
   const byOrigin=(await list({7:'SERVICO'})).data;
   assert.equal(byOrigin.totalItems,1);assert.equal(byOrigin.totalAmount,'100.20');
   assert.equal((await report({4:'SERVICO'})).data.totalAmount,byOrigin.totalAmount);
   assert.equal((await list({6:'TECNICO'})).data.totalAmount,'310.31');
   assert.equal((await report({3:'TECNICO'})).data.totalItems,31);
   assert.equal((await list({1:'sintética 100'})).data.totalAmount,'10.01');
   assert.equal((await report({0:'nothing'})).data.totalAmount,'0.00');
   const cancelled=(await list({8:'CANCELLED'})).data;
   assert.equal(cancelled.totalItems,1);assert.equal(cancelled.rows[0].id,id(137));
  });
  await t.test('unknown amounts are never treated as zero or a partial sum',async()=>{
   await insert(138,{amount:null});assert.equal((await list()).data.totalAmount,null);assert.equal((await report()).data.totalAmount,null);
   await db.query('delete from private.nfse_operation_source_projection where operation_id=$1',[id(138)]);
  });
  await t.test('legacy no-date scope and other statuses retain preparation-month semantics',async()=>{
   const legacy=(await list({4:null,5:null})).data;assert(!legacy.rows.some(row=>row.id===id(131)));
   const errors=(await list({0:'ERRO',8:null})).data;assert.equal(errors.totalItems,1);assert.equal(errors.rows[0].id,id(133));
  });
  await t.test('invalid scopes and filters fail closed, page endpoint cannot export unboundedly',async()=>{
   await assert.rejects(()=>list({},[id(11),...scope.slice(1)]),/insufficient_privilege/);
   await assert.rejects(()=>list({3:10000}),/Tamanho da página/);
   await assert.rejects(()=>list({4:'2026-02-30'}),/Datas de emissão/);
   await assert.rejects(()=>list({4:'2026-12-02',5:'2026-11-01'}),/Intervalo/);
   const grants=await query(`select jsonb_build_object('publicReport',has_function_privilege('anon','public.get_nfse_issued_report_secure(uuid,uuid,text,text,text,text,text,text,text)','execute'),
    'authReport',has_function_privilege('authenticated','public.get_nfse_issued_report_secure(uuid,uuid,text,text,text,text,text,text,text)','execute'),
    'privateHelper',has_function_privilege('authenticated','private.nfse_documents_period_query(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text)','execute')) value`);
   assert.deepEqual(grants,{publicReport:false,authReport:true,privateHelper:false});
  });
  await t.test('export limit errors instead of silently truncating',async()=>{
   await db.exec(`insert into private.nfse_individual_operations select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'2026-11-15T12:00:00Z' from generate_series(1,10001)n;
    insert into private.nfse_operation_source_projection(operation_id,source_id,source_kind,polo_id,environment,month,issue_state,state,snapshot,command,result,number,access_key)
    select id,id,'PARTNER_SERVICE','${id(1)}','PRODUCAO','2026-11','AUTHORIZED','AUTHORIZED','{"recipient":{"name":"Batch"}}','{"amount":"1.00"}','{}','1',lpad(id::text,50,'0')
    from private.nfse_individual_operations where id::text like '10000000-%';`);
   await assert.rejects(()=>report(),/mais de 10.000/);
  });
 } finally {await db.close();}
});
