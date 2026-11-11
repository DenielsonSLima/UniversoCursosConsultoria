import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const xml = n => `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><dhProc>2026-11-${n === 2 ? '11' : '10'}T12:00:00-03:00</dhProc><cStat>100</cStat></infNFSe></NFSe>`;
const fixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_scope(actor uuid,context uuid,polo uuid,environment text,month text,allowed boolean);
CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql STABLE AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.test_scope WHERE actor=auth.uid() AND context=$1 AND polo=$2 AND environment=$3 AND month=$4 AND allowed)
 THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;END$$;
CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS void LANGUAGE sql STABLE AS $$SELECT private.authorize_nfse_model_scope($1,$2,$3,$4)$$;
CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,request_id uuid,polo_id uuid,environment text,month text,
 state text,result jsonb,snapshot jsonb,command jsonb,created_at timestamptz,authorized_xml text);
CREATE TABLE private.nfse_individual_cancellations(id uuid PRIMARY KEY,operation_id uuid UNIQUE,state text,result jsonb,event_xml text);
CREATE TABLE private.nfse_queue_operation_links(operation_id uuid UNIQUE,source_kind text,source_id uuid,PRIMARY KEY(source_kind,source_id));
CREATE TABLE private.nfse_models(id uuid,polo_id uuid,environment text,definition jsonb,version integer);
CREATE TABLE private.nfse_queue_documents(id uuid,polo_id uuid,environment text,queue_month text,class_id uuid,snapshot jsonb,amount numeric);
CREATE TABLE private.nfse_queue_removals(document_id uuid);
CREATE TABLE private.nfse_partner_services(id uuid,polo_id uuid,environment text,service_date date,amount numeric);
ALTER TABLE private.nfse_individual_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_individual_cancellations ENABLE ROW LEVEL SECURITY;
`;

test('issued/cancelled partition is scoped, proven, before paging and read-only', async t => {
  const db = new PGlite();
  const value = async (query, args = []) => (await db.query(query, args)).rows[0].value;
  const list = (filters = {}, scope = {}) => value(
    'SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) value',
    [scope.context ?? id(10), scope.polo ?? id(1), scope.environment ?? 'PRODUCAO', scope.month ?? '2026-11',
      filters.status ?? 'EMITIDA', filters.search ?? null, filters.page ?? 1, filters.size ?? 25,
      filters.from ?? null, filters.to ?? null, filters.type ?? null, filters.origin ?? null, filters.issuedState ?? null]);
  const deny = (promise, code = '22023') => assert.rejects(promise, error => error.code === code);
  const records = () => value(`SELECT jsonb_build_object(
    'operations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM private.nfse_individual_operations o),
    'cancellations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM private.nfse_individual_cancellations c),
    'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_id) FROM private.nfse_queue_operation_links l)) value`);
  const add = async (n, { environment = 'PRODUCAO', polo = 1, month = '2026-11', state = 'AUTHORIZED',
    kind = 'ACADEMIC_QUEUE', type = 'TECNICO', cancellation = null, proof = true } = {}) => {
    await db.query(`INSERT INTO private.nfse_individual_operations VALUES($1,$2,$3,$4,$5,$6,$7,$8,
      '{"amount":"1.00"}','2026-11-01T10:00:00Z',$9)`,
    [id(n), id(n + 100), id(polo), environment, month, state,
      { number: String(n), accessKey: String(n).padStart(50, '0') },
      { recipient: { name: `PESSOA SINTÉTICA ${n}` }, model: { definition: { name: 'MODELO SINTÉTICO' } },
        source: { preparation: { snapshot: { academic: { classLabel: 'TURMA SINTÉTICA', courseType: type } } } } },
      state === 'AUTHORIZED' ? xml(n) : null]);
    await db.query('INSERT INTO private.nfse_queue_operation_links VALUES($1,$2,$3)', [id(n), kind, id(n + 200)]);
    if (cancellation) await db.query('INSERT INTO private.nfse_individual_cancellations VALUES($1,$2,$3,$4,$5)',
      [id(n + 300), id(n), cancellation,
        { code: proof ? 'CONFIRMED' : 'REGISTERED_EVENT_NOT_FOUND', eventCode: '101101' },
        proof ? '<evento>PROVA SINTÉTICA VALIDADA PELO EXECUTOR</evento>' : null]);
  };
  try {
    await db.exec(fixture);
    for (const environment of ['PRODUCAO', 'HOMOLOGACAO']) await db.query('INSERT INTO public.test_scope VALUES($1,$2,$3,$4,$5,true)',
      [id(11), id(10), id(1), environment, '2026-11']);
    await db.exec(`SET test.actor='${id(11)}'`);
    await db.exec(await sql('20261111004624_nfse_operation_read_models.sql'));
    await db.exec(await sql('20261111004626_nfse_queue_workspace_reads.sql'));
    await db.exec(await sql('20261111014607_nfse_issued_document_filters.sql'));
    await db.exec(await sql('20261111042040_nfse_cancelled_document_partition.sql'));
    await add(1, { kind: 'PARTNER_SERVICE' });
    await add(2, { cancellation: 'CANCELLED' });
    await add(3, { cancellation: 'CANCELLATION_PENDING', proof: false, type: 'EAD' });
    await add(4, { cancellation: 'CANCELLATION_REJECTED', proof: false });
    await add(5, { cancellation: 'CANCELLED', proof: false });
    await add(6, { cancellation: 'CANCELLED' });
    await db.query('UPDATE private.nfse_individual_cancellations SET event_xml=NULL WHERE operation_id=$1', [id(6)]);
    await add(7, { cancellation: 'CANCELLED', environment: 'HOMOLOGACAO', type: 'LIVRE' });
    await add(8, { cancellation: 'CANCELLED', polo: 2, type: 'LIVRE' });
    await add(9, { cancellation: 'CANCELLED', month: '2026-12', type: 'ESPECIALIZACAO' });
    await add(12, { state: 'REJECTED' });
    const before = await records();

    await t.test('one exposed overload and legacy defaults keep authorization history intact', async () => {
      const functions = (await db.query(`SELECT pronargs,pronargdefaults FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='get_nfse_documents_secure'`)).rows;
      assert.deepEqual(functions, [{ pronargs: 13, pronargdefaults: 8 }]);
      assert.equal((await list()).data.totalItems, 6);
      assert.equal((await value('SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,NULL,1,25) value',
        [id(10), id(1), 'PRODUCAO', '2026-11', 'EMITIDA'])).data.totalItems, 6);
      assert.equal((await value('SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,NULL,1,25,NULL,NULL,NULL,NULL) value',
        [id(10), id(1), 'PRODUCAO', '2026-11', 'EMITIDA'])).data.totalItems, 6);
    });
    await t.test('only confirmed cancellation enters Canceladas; pending/rejected remain active issued history', async () => {
      const cancelled = (await list({ issuedState: 'CANCELLED' })).data;
      assert.equal(cancelled.totalItems, 1); assert.equal(cancelled.rows[0].id, id(2));
      assert.equal(cancelled.rows[0].state, 'CANCELLED'); assert.equal(cancelled.rows[0].status, 'EMITIDA');
      const active = (await list({ issuedState: 'ACTIVE' })).data;
      assert.equal(active.totalItems, 5);
      assert.deepEqual(new Set(active.rows.map(row => row.id)), new Set([1, 3, 4, 5, 6].map(id)));
      assert.equal(active.rows.find(row => row.id === id(3)).state, 'CANCELLATION_PENDING');
      assert.equal(active.rows.find(row => row.id === id(4)).state, 'CANCELLATION_REJECTED');
      for (const n of [5, 6]) assert.equal(active.rows.find(row => row.id === id(n)).state, 'CANCELLATION_PENDING');
    });
    await t.test('partition, search, dates, origin and modality all precede pagination and course choices', async () => {
      const first = (await list({ issuedState: 'ACTIVE', size: 1 })).data;
      const second = (await list({ issuedState: 'ACTIVE', size: 1, page: 2 })).data;
      assert.equal(first.totalItems, 5); assert.equal(second.totalItems, 5); assert.notEqual(first.rows[0].id, second.rows[0].id);
      assert.equal((await list({ issuedState: 'CANCELLED', size: 1, page: 2 })).data.rows.length, 0);
      assert.equal((await list({ issuedState: 'CANCELLED', search: 'SINTÉTICA 2', from: '2026-11-11', to: '2026-11-11',
        origin: 'ALUNO', type: 'TECNICO', size: 1 })).data.totalItems, 1);
      assert.equal((await list({ issuedState: 'CANCELLED', origin: 'SERVICO' })).data.totalItems, 0);
      assert.equal((await list({ issuedState: 'ACTIVE', origin: 'SERVICO', size: 1 })).data.rows[0].id, id(1));
      assert.deepEqual((await list({ issuedState: 'CANCELLED' })).data.courseTypes, [{ value: 'TECNICO', label: 'Técnico' }]);
      assert.equal((await list({ issuedState: 'ACTIVE', type: 'EAD' })).data.rows[0].id, id(3));
    });
    await t.test('workspace issued count is active; cancelled XML remains exact and readable in its scope', async () => {
      const workspace = await value('SELECT public.get_nfse_workspace_secure($1,$2,$3,$4) value', [id(10), id(1), 'PRODUCAO', '2026-11']);
      assert.equal(workspace.data.summary.issuedCount, 5); assert.equal(workspace.data.summary.errorCount, 1);
      const artifact = await value('SELECT public.get_nfse_authorized_xml_secure($1,$2,$3,$4,$5) value',
        [id(10), id(1), 'PRODUCAO', '2026-11', id(2)]);
      assert.equal(artifact.data.status, 'EMITIDA'); assert.equal(artifact.data.xml, xml(2));
      assert.match(artifact.data.sha256, /^[a-f0-9]{64}$/);
      await deny(value('SELECT public.get_nfse_authorized_xml_secure($1,$2,$3,$4,$5) value',
        [id(10), id(1), 'HOMOLOGACAO', '2026-11', id(2)]), '42501');
      assert.equal((await list({ issuedState: 'CANCELLED' }, { environment: 'HOMOLOGACAO' })).data.rows[0].id, id(7));
    });
    await t.test('authorization precedes filters and no private/legacy read is granted to application roles', async () => {
      for (const issuedState of ['cancelled', '', 'PENDING']) await deny(list({ issuedState }));
      await deny(list({ issuedState: 'CANCELLED', status: 'ERRO' }));
      await deny(list({ issuedState: 'INVALID' }, { polo: id(2) }), '42501');
      await deny(list({}, { context: id(99) }), '42501'); await deny(list({}, { month: '2026-12' }), '42501');
      const signature = 'public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text)';
      assert.equal(await value(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE') value`), true);
      for (const role of ['anon', 'service_role']) assert.equal(await value(`SELECT has_function_privilege('${role}','${signature}','EXECUTE') value`), false);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await value(`SELECT has_table_privilege('${role}','private.nfse_confirmed_cancellations','SELECT') value`), false);
        assert.equal(await value(`SELECT has_function_privilege('${role}',
          'public.get_nfse_documents_legacy_filters_20261111(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text)','EXECUTE') value`), false);
      }
      await db.exec('SET ROLE authenticated');
      assert.equal((await list({ issuedState: 'CANCELLED' })).data.totalItems, 1);
      await deny(value('SELECT count(*) value FROM private.nfse_individual_cancellations'), '42501');
      await db.exec('RESET ROLE');
      await db.exec('UPDATE public.test_scope SET allowed=false'); await deny(list({ issuedState: 'CANCELLED' }), '42501');
      assert.deepEqual(await records(), before, 'Partitioning must not mutate XML, events, source links or financial reservations');
    });
  } finally { await db.close(); }
});
