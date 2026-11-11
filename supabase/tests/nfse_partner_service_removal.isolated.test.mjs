import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.NFSE_TEST_PGLITE_MODULE ? pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href : '@electric-sql/pglite');
const read = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = [id(10), id(1), 'PRODUCAO', '2026-11'];

test('service filters and logical removal preserve canonical data and fiscal safety', async t => {
  const db = new PGlite();
  const query = async (sql, args) => (await db.query(sql, args)).rows[0].value;
  const list = (filters = [], customScope = scope, page = 1, size = 50) => query(
    'select public.get_nfse_partner_services_v2_secure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value', [...customScope, page, size, ...[null,null,null,null].map((v,i) => filters[i] ?? v)]);
  const remove = (ids, request = id(900), customScope = scope) => query(
    'select public.remove_nfse_partner_services_secure($1,$2,$3,$4,$5,$6) value', [...customScope, request, ids]);
  const before = () => query(`select jsonb_build_object('services',(select jsonb_agg(to_jsonb(s) order by id) from private.nfse_partner_services s),
    'operations',(select jsonb_agg(to_jsonb(o) order by id) from private.nfse_individual_operations o),
    'receivables',(select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c)) value`);
  const marks = () => query('select count(*)::int value from private.nfse_partner_service_removals');
  try {
    await db.exec(await readFile(new URL('./nfse_partner_services.fixture.sql', import.meta.url), 'utf8'));
    await db.exec(await read('20261108225453_nfse_models_private_store.sql'));
    await db.exec(await read('20261108234843_nfse_partner_services_store.sql'));
    await db.exec(`create function private.reject_nfse_preparation_change() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
      create function private.authorize_nfse_configuration_scope(uuid,uuid,text,text) returns void language sql as $$select null::void$$;
      create table private.nfse_individual_operations(id uuid primary key, request_id uuid, polo_id uuid, environment text, month text,
        state text, result jsonb, authorized_xml text, dps_id text, signed_dps_xml text, snapshot jsonb, command jsonb, created_at timestamptz default now());
      create table private.nfse_queue_operation_links(operation_id uuid primary key references private.nfse_individual_operations, source_kind text,source_id uuid,
        unique(source_kind,source_id));
      create table private.nfse_individual_cancellations(id uuid,operation_id uuid,state text,result jsonb);
      create table public.nfse_change_events(id uuid default gen_random_uuid(),polo_id uuid,environment text,month text,resource text);
      create table private.nfse_queue_documents(id uuid,polo_id uuid,environment text,queue_month text,amount numeric,class_id uuid,snapshot jsonb);
      create table private.nfse_queue_removals(document_id uuid);
      create table private.nfse_confirmed_cancellations(operation_id uuid);
      create table private.nfse_error_archives(operation_id uuid,archived_at timestamptz);
      insert into public.polos values('${id(1)}','ativo'),('${id(2)}','ativo');
      insert into public.test_context values('${id(10)}','${id(11)}',true,false,array['${id(1)}'::uuid]);
      set test.actor='${id(11)}'; set test.polo='${id(1)}';
      insert into public.parceiros(id,nome,tipo,status) values('${id(20)}','Empresa sintética','PJ','ativo');
      insert into private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
        values('${id(30)}','${id(1)}','PRODUCAO','{"name":"Modelo sintético","active":true}','${id(11)}','${id(11)}');
      insert into public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria)
        values('${id(40)}','${id(1)}','${id(20)}','Conta preservada',10,'2026-11-20','PAGO','OUTROS_CREDITOS');`);
    const projection = await read('20261111004624_nfse_operation_read_models.sql');
    await db.exec(projection.slice(projection.indexOf('CREATE VIEW'), projection.indexOf('CREATE OR REPLACE FUNCTION public.get_nfse_partner')));
    await db.exec(await read('20261111092451_nfse_error_archive_without_identity.sql'));
    for (let n = 100; n <= 111; n++) {
      const type = n === 101 ? 'PF' : n === 102 ? 'ALUNO' : 'PJ';
      await db.query(`insert into private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,
        service_description,amount,partner_snapshot,model_snapshot,receivable_id,receivable_action,created_by)
        values($1,$2,$3,$4,$5,$6,$7,10,$8,'{"name":"Modelo sintético"}',$9,$10,$11)`,
        [id(n), n === 110 ? id(2) : id(1), n === 111 ? 'HOMOLOGACAO' : 'PRODUCAO', id(20), id(30),
          n === 109 ? '2026-10-01' : n === 108 ? '2026-11-02' : '2026-11-01', `Serviço sintético ${n}`,
          { name: `${type} sintético ${n}`, type, document: '12.345.678/0001-90' }, n === 100 ? id(40) : null, n === 100 ? 'LINKED' : 'NONE', id(11)]);
    }
    const states = {103:'AUTHORIZED',104:'REJECTED',105:'PROCESSING',106:'AWAITING_CONFIRMATION',107:'PREVIEWED',108:'REJECTED'};
    for (const [n,state] of Object.entries(states)) {
      const result = state === 'REJECTED' ? {state, dpsId:'DPS-SYNTHETIC', codes:['E123']} : {state, number: n, accessKey: n.padEnd(50,'0')};
      if (n === '108') result.number = '';
      await db.query(`insert into private.nfse_individual_operations(id,request_id,polo_id,environment,month,state,result,authorized_xml,dps_id,signed_dps_xml)
        values($1,$2,$3,'PRODUCAO','2026-11',$4,$5,$6,'DPS-SYNTHETIC','signed synthetic')`,
        [id(+n+100), id(+n+200), id(1), state, result, state === 'AUTHORIZED' ? 'authorized synthetic' : null]);
      await db.query(`insert into private.nfse_queue_operation_links values($1,'PARTNER_SERVICE',$2)`, [id(+n+100),id(+n)]);
    }
    await db.query('insert into private.nfse_individual_cancellations values($1,$2,\'CANCELLED\',\'{}\')',[id(503),id(203)]);
    for (const name of ['20261111105000_nfse_partner_service_removal.sql','20261111105001_nfse_partner_service_filters.sql','20261111105002_nfse_removed_service_summary.sql']) await db.exec(await read(name));
    await t.test('default list preserves all partner types and server count/total before pagination', async () => {
      const result = (await list([],scope,1,2)).data;
      assert.equal(result.totalItems,9); assert.equal(result.totalAmount,'90.00'); assert.equal(result.rows.length,2);
      const all = (await list()).data.rows;
      assert.deepEqual([...new Set(all.map(r=>r.partnerType))].sort(),['ALUNO','PF','PJ']);
      assert.deepEqual(all.filter(r=>r.canRemove).map(r=>r.id).sort(),[100,101,102,104].map(id));
      assert.equal((await list([],scope,2,2)).data.rows.length,2);
    });
    await t.test('search is literal, matches names/descriptions/documents and type/date filters are server-side', async () => {
      assert.equal((await list(['Serviço sintético 104'])).data.totalItems,1);
      assert.equal((await list(['12345678000190'])).data.totalItems,9);
      assert.equal((await list(['%'])).data.totalItems,0);
      assert.equal((await list([null,null,null,'PJ'])).data.totalItems,7);
      assert.equal((await list([null,'2026-11-02','2026-11-02'])).data.totalItems,1);
      assert.equal((await list([null,'2026-10-01','2026-10-31'])).data.totalItems,1);
      for (const filters of [[null,'2026-02-30'],[null,'0002-01-01'],[null,'2026-11-05','2026-11-01'],[null,null,null,'OTHER'],['a'.repeat(101)]])
        await assert.rejects(list(filters), e=>e.code==='22023');
    });
    await t.test('mixed, stale, issued, cancelled, ambiguous, previewed and identity-bearing rejection selections fail atomically', async () => {
      for (const n of [103,105,106,107,108,110,111,999]) await assert.rejects(remove([id(100),id(n)]), e=>e.code==='40001');
      assert.equal(await marks(),0);
      for (const ids of [[],[id(100),id(100)],[null],Array.from({length:101},(_,i)=>id(i))]) await assert.rejects(remove(ids), e=>e.code==='22023');
      await db.query('insert into private.nfse_individual_cancellations values($1,$2,\'CANCELLATION_PENDING\',\'{}\')',[id(504),id(204)]);
      await assert.rejects(remove([id(104)]), e=>e.code==='40001');
      await db.query('delete from private.nfse_individual_cancellations where id=$1',[id(504)]);
    });
    let snapshot, result;
    await t.test('explicit non-emitted selection adds audit marks without changing service, operation or receivable data', async () => {
      snapshot = await before(); result = await remove([id(104),id(100)]);
      assert.equal(result.data.removedCount,2); assert.deepEqual(result.data.serviceIds,[id(100),id(104)]);
      assert.deepEqual(await before(),snapshot); assert.equal(await marks(),2);
      const current = (await list()).data; assert.equal(current.totalItems,7); assert.equal(current.totalAmount,'70.00');
      const legacy = await query('select public.get_nfse_partner_services_secure($1,$2,$3,$4) value',scope);
      assert.equal(legacy.data.totalItems,7);
      assert.equal(await query("select count(*)::int value from public.nfse_change_events where resource='services' and month='2026-11'"),1);
    });
    await t.test('same request can recover a lost response, but payload and current authorization remain strict', async () => {
      assert.deepEqual(await remove([id(100),id(104)]),result);
      await assert.rejects(remove([id(101)]),e=>e.code==='22023');
      await assert.rejects(remove([id(100)],id(901)),e=>e.code==='40001');
      await db.exec('update public.test_context set allowed=false');
      await assert.rejects(remove([id(100),id(104)]),e=>e.code==='42501'); await assert.rejects(list(),e=>e.code==='42501');
      await db.exec('update public.test_context set allowed=true');
      for (const custom of [[id(999),...scope.slice(1)],[scope[0],id(2),...scope.slice(2)]]) await assert.rejects(remove([id(101)],id(902),custom),e=>e.code==='42501');
      assert.equal(await marks(),2);
    });
    await t.test('removed sources reject new preview links and non-default isolation cannot hide concurrent state', async () => {
      await assert.rejects(db.query("insert into private.nfse_queue_operation_links values($1,'PARTNER_SERVICE',$2)",[id(999),id(100)]),e=>e.code==='40001');
      await db.exec('begin isolation level repeatable read');
      await assert.rejects(remove([id(101)],id(903)),e=>e.code==='25001'); await db.exec('rollback');
      const sql = await read('20261111105000_nfse_partner_service_removal.sql');
      assert(sql.includes('ORDER BY o.id FOR UPDATE')); assert(sql.includes('ORDER BY id FOR UPDATE')); assert(sql.includes('FOR SHARE'));
    });
    await t.test('cross-month removal invalidates the actual month and counts exclude marked preparations', async () => {
      const workspace = await query('select public.get_nfse_workspace_secure($1,$2,$3,$4) value',scope);
      assert.equal(workspace.data.summary.pendingCount,5);
      await remove([id(109)],id(904));
      assert.equal(await query("select count(*)::int value from public.nfse_change_events where month='2026-10'"),1);
      assert.equal((await list([null,'2026-10-01','2026-10-31'])).data.totalItems,0);
    });
    await t.test('audit rows are immutable and unprivileged roles cannot bypass RPC scope', async () => {
      for (const table of ['nfse_partner_service_removal_requests','nfse_partner_service_removals']) {
        await assert.rejects(db.query(`delete from private.${table}`),/immutable/);
        await db.exec('set role authenticated'); await assert.rejects(db.query(`select * from private.${table}`),e=>e.code==='42501'); await db.exec('reset role');
      }
      for (const signature of ['public.remove_nfse_partner_services_secure(uuid,uuid,text,text,uuid,uuid[])','public.get_nfse_partner_services_v2_secure(uuid,uuid,text,text,integer,integer,text,text,text,text)']) {
        for (const role of ['anon','service_role']) assert.equal(await query('select has_function_privilege($1,$2,\'EXECUTE\') value',[role,signature]),false);
        assert.equal(await query('select has_function_privilege(\'authenticated\',$1,\'EXECUTE\') value',[signature]),true);
      }
      await db.exec('set role authenticated'); assert.equal((await list()).data.totalItems,7); await db.exec('reset role');
    });
  } finally { await db.close(); }
});
