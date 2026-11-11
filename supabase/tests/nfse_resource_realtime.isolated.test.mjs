import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const migration = await readFile(new URL('../migrations/20261111023828_nfse_resource_realtime.sql', import.meta.url), 'utf8');
const queueMigration = await readFile(new URL('../migrations/20261110132801_nfse_queue_realtime.sql', import.meta.url), 'utf8');
const fixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
CREATE TABLE public.test_context(actor uuid,role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[],allowed boolean);
CREATE FUNCTION public.portal_listar_perfis()
 RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[]) LANGUAGE sql STABLE SECURITY DEFINER AS
 $$SELECT role,"contextId","allPolos","poloIds" FROM public.test_context WHERE actor=auth.uid()$$;
CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
 $$SELECT coalesce(bool_or(allowed),false) FROM public.test_context WHERE actor=auth.uid() AND "contextId"=$1$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ativo'$$;
CREATE TABLE private.nfse_preparation_batches(polo_id uuid,environment text,queue_month text);
CREATE TABLE private.nfse_queue_removal_requests(polo_id uuid,environment text,queue_month text);
CREATE TABLE private.nfse_models(id uuid PRIMARY KEY,polo_id uuid,environment text,definition jsonb,version integer);
CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version integer);
CREATE TABLE private.nfse_certificates(polo_id uuid,environment text,vault_secret_id uuid,fingerprint text);
CREATE TABLE private.nfse_cancellation_models(id uuid PRIMARY KEY,polo_id uuid,environment text,definition jsonb,version integer);
CREATE TABLE private.nfse_partner_services(id uuid PRIMARY KEY,polo_id uuid,environment text,service_date date,
 partner_id uuid,partner_snapshot jsonb,service_description text);
CREATE PUBLICATION supabase_realtime;
`;

test('NFS-e resource events publish only scoped invalidation metadata with the existing queue ACL', async t => {
  const db = new PGlite();
  const value = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
  const rows = async () => (await db.query('SELECT * FROM public.nfse_change_events ORDER BY created_at,id')).rows;
  const count = () => value('SELECT count(*)::int AS value FROM public.nfse_change_events');
  const asRole = async (role, action) => {
    await db.exec(`SET ROLE ${role}`);
    try { return await action(); } finally { await db.exec('RESET ROLE'); }
  };
  const deny = promise => assert.rejects(promise, error => error.code === '42501');
  const secret = { cpf: 'DO_NOT_PUBLISH', xml: 'DO_NOT_PUBLISH', certificate: 'DO_NOT_PUBLISH' };
  try {
    await db.exec(fixture);
    await db.exec(queueMigration);
    await db.exec(migration);
    await db.query('INSERT INTO public.polos VALUES ($1,\'ativo\'),($2,\'ativo\'),($3,\'inativo\')', [id(1), id(2), id(3)]);
    await db.query(`INSERT INTO public.test_context VALUES
      ($1,'GESTOR',$2,false,ARRAY[$3]::uuid[],true),($4,'GESTOR',$5,true,ARRAY[]::uuid[],true),
      ($6,'SECRETARIA',$7,true,ARRAY[]::uuid[],true)`, [id(10), id(11), id(1), id(20), id(21), id(30), id(31)]);

    await t.test('four private source tables produce the exact public metadata shape, without snapshot or source identities', async () => {
      await db.query('INSERT INTO private.nfse_models VALUES($1,$2,\'PRODUCAO\',$3,1)', [id(100), id(1), secret]);
      await db.query('INSERT INTO private.nfse_configurations VALUES($1,\'HOMOLOGACAO\',$1,$2,1)', [id(1), secret]);
      await db.query('INSERT INTO private.nfse_cancellation_models VALUES($1,$2,\'PRODUCAO\',$3,1)', [id(101), id(1), secret]);
      await db.query(`INSERT INTO private.nfse_partner_services VALUES($1,$2,'PRODUCAO','2026-11-10',$3,$4,'DO_NOT_PUBLISH')`,
        [id(102), id(1), id(999), secret]);
      const events = await rows();
      assert.equal(events.length, 4);
      assert.deepEqual(events.map(row => row.resource).sort(), ['cancellation-models', 'configuration', 'models', 'services']);
      for (const event of events) {
        assert.deepEqual(Object.keys(event).sort(), ['created_at', 'environment', 'id', 'month', 'polo_id', 'resource', 'version']);
        assert.equal(event.version, 1);
        assert.equal(event.month, event.resource === 'services' ? '2026-11' : null);
        assert(![id(100), id(101), id(102), id(999)].includes(event.id));
        assert(!JSON.stringify(event).includes('DO_NOT_PUBLISH'));
      }
      assert.equal(await value('SELECT count(*)::int AS value FROM public.nfse_queue_change_events'), 0);
    });

    await t.test('A1 insert/rotation/delete publish only configuration metadata for its unit and inherited units in the same environment', async () => {
      await db.query(`INSERT INTO private.nfse_configurations VALUES
        ($1,'HOMOLOGACAO',$2,$3,1),($1,'PRODUCAO',$2,$3,1)`, [id(2), id(1), secret]);
      const before = await rows(), previous = new Set(before.map(row => row.id));
      await db.query("INSERT INTO private.nfse_certificates VALUES($1,'HOMOLOGACAO',$2,'DO_NOT_PUBLISH')", [id(1), id(888)]);
      await db.query("UPDATE private.nfse_certificates SET fingerprint='DO_NOT_PUBLISH_ROTATED' WHERE polo_id=$1", [id(1)]);
      await db.query('DELETE FROM private.nfse_certificates WHERE polo_id=$1', [id(1)]);
      const events = (await rows()).filter(row => !previous.has(row.id));
      assert.equal(events.length, 6);
      for (const polo of [id(1), id(2)]) assert.equal(events.filter(row => row.polo_id === polo).length, 3);
      assert(events.every(row => row.environment === 'HOMOLOGACAO' && row.resource === 'configuration' && row.month === null));
      assert(!JSON.stringify(events).includes('DO_NOT_PUBLISH'));
      assert(!JSON.stringify(events).includes(id(888)));
    });

    await t.test('updates emit once per affected scope, moved services notify both months, deletes notify the old scope', async () => {
      const before = await count();
      await db.query('UPDATE private.nfse_models SET version=2 WHERE id=$1', [id(100)]);
      assert.equal(await count(), before + 1);
      await db.query('UPDATE private.nfse_models SET version=2 WHERE id=$1', [id(100)]);
      assert.equal(await count(), before + 1);
      await db.query('UPDATE private.nfse_partner_services SET service_date=\'2026-12-01\',polo_id=$2 WHERE id=$1', [id(102), id(2)]);
      assert.equal(await count(), before + 3);
      assert.equal(await value("SELECT count(*)::int value FROM public.nfse_change_events WHERE resource='services' AND month='2026-11'"), 2);
      assert.equal(await value("SELECT count(*)::int value FROM public.nfse_change_events WHERE resource='services' AND month='2026-12' AND polo_id=$1", [id(2)]), 1);
      await db.query('DELETE FROM private.nfse_partner_services WHERE id=$1', [id(102)]);
      assert.equal(await count(), before + 4);
    });

    await t.test('RLS checks gestor, current context permission, active unit and unit membership for every read', async () => {
      await db.query('INSERT INTO private.nfse_models VALUES($1,$2,\'PRODUCAO\',$3,1)', [id(103), id(3), secret]);
      await db.exec(`SET test.actor='${id(10)}'`);
      const selected = await asRole('authenticated', rows);
      assert(selected.length > 0);
      assert(selected.every(row => row.polo_id === id(1)));
      await db.query('UPDATE public.test_context SET allowed=false WHERE actor=$1', [id(10)]);
      assert.deepEqual(await asRole('authenticated', rows), []);
      await db.query('UPDATE public.test_context SET allowed=true WHERE actor=$1', [id(10)]);
      await db.exec(`SET test.actor='${id(20)}'`);
      const allUnits = await asRole('authenticated', rows);
      assert(allUnits.some(row => row.polo_id === id(2)));
      assert(allUnits.every(row => row.polo_id !== id(3)));
      await db.exec(`SET test.actor='${id(30)}'`);
      assert.deepEqual(await asRole('authenticated', rows), []);
      await db.exec("SET test.actor=''");
      assert.deepEqual(await asRole('authenticated', rows), []);
    });

    await t.test('browser roles cannot insert, mutate or delete events, and no app role can execute the trigger helper', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await value(`SELECT has_table_privilege('${role}','public.nfse_change_events','INSERT,UPDATE,DELETE,TRUNCATE') value`), false);
        assert.equal(await value(`SELECT has_function_privilege('${role}','private.publish_nfse_resource_change()','EXECUTE') value`), false);
      }
      await deny(asRole('anon', rows));
      await deny(asRole('service_role', rows));
      for (const statement of [
        `INSERT INTO public.nfse_change_events(polo_id,environment,resource) VALUES('${id(1)}','PRODUCAO','models')`,
        "UPDATE public.nfse_change_events SET resource='configuration'", 'DELETE FROM public.nfse_change_events',
      ]) await deny(asRole('authenticated', () => db.exec(statement)));
      assert.equal(await value("SELECT relrowsecurity value FROM pg_class WHERE oid='public.nfse_change_events'::regclass"), true);
      const helper = await value("SELECT pg_get_functiondef('private.publish_nfse_resource_change()'::regprocedure) value");
      assert.match(helper, /SECURITY DEFINER/);
      assert.match(helper, /SET search_path TO ''/);
      for (const forbidden of ['definition', 'snapshot', 'vault_secret_id', 'fingerprint', 'cnpj', 'private_key']) {
        assert(!helper.includes(forbidden));
      }
    });

    await t.test('the publication includes sanitized events only, with an indexed scope and strict version/resource/month contract', async () => {
      const published = (await db.query("SELECT schemaname,tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename")).rows;
      assert.deepEqual(published, [{ schemaname: 'public', tablename: 'nfse_change_events' },
        { schemaname: 'public', tablename: 'nfse_queue_change_events' }]);
      const index = await value("SELECT indexdef value FROM pg_indexes WHERE schemaname='public' AND indexname='nfse_change_events_scope'");
      assert.match(index, /polo_id, environment, month, resource/);
      for (const row of [
        { version: 2, resource: 'models', month: null }, { version: 1, resource: 'unknown', month: null },
        { version: 1, resource: 'models', month: '2026-11' }, { version: 1, resource: 'services', month: null },
        { version: 1, resource: 'services', month: '2026-13' },
      ]) await assert.rejects(db.query('INSERT INTO public.nfse_change_events(polo_id,environment,version,resource,month) VALUES($1,\'PRODUCAO\',$2,$3,$4)',
        [id(1), row.version, row.resource, row.month]), error => error.code === '23514');
    });
  } finally { await db.close(); }
});
