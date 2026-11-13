import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Dedicated disposable local PostgreSQL, never a Supabase or production URL.
export async function newTrustPostgresDatabase() {
  assert.equal(process.env.EAD_TEST_POSTGRES_DISPOSABLE, 'true', 'A disposable PostgreSQL test cluster is required.');
  const url = new URL(process.env.EAD_TEST_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL protocol required.');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local test PostgreSQL required.');
  assert.equal(url.search, '', 'Connection overrides are not allowed.');
  assert.equal(url.hash, '', 'Connection fragments are not allowed.');
  assert.equal(url.pathname, '/postgres', 'Use the disposable cluster administration database.');
  const moduleUrl = process.env.EAD_TEST_PG_MODULE
    ? pathToFileURL(resolve(process.env.EAD_TEST_PG_MODULE)).href : 'pg';
  const imported = await import(moduleUrl);
  const { Client } = imported.default || imported;
  const admin = new Client({ connectionString: url.href, application_name: 'ead_trust_test_admin' });
  await admin.connect();
  const databaseName = `ead_trust_${randomBytes(8).toString('hex')}`;
  try { await admin.query(`CREATE DATABASE ${databaseName}`); }
  catch (error) { await admin.end(); throw error; }
  url.pathname = `/${databaseName}`;
  const clients = [];
  const connect = async applicationName => {
    const client = new Client({ connectionString: url.href, application_name: applicationName });
    try {
      await client.connect();
      await client.query("SET TIME ZONE 'America/Maceio'; SET lock_timeout='8s'; SET statement_timeout='12s'");
    } catch (error) { await client.end().catch(() => {}); throw error; }
    clients.push(client);
    return {
      client,
      exec: sql => client.query(sql.replace(/CREATE ROLE (anon|authenticated|service_role);/g,
        (_, role) => `DO $roles$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $roles$;`)),
      query: (sql, args) => client.query(sql, args),
    };
  };
  let database;
  try { database = await connect('ead_trust_fixture'); }
  catch (error) {
    await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await admin.end(); throw error;
  }
  return {
    database, connect,
    async close() {
      for (const client of clients) {
        await client.query('ROLLBACK').catch(() => {});
        await client.end().catch(() => {});
      }
      await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
      await admin.end();
    },
  };
}

export async function waitForPostgresLock(observer, applicationName) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') AS blocked",
      [applicationName],
    );
    if (result.rows[0].blocked) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Expected PostgreSQL row-lock wait for ${applicationName}.`);
}
