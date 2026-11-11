import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261111113000_nfse_health_reference.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('health reference is internal, scoped, sanitized and read-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA private; CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE FUNCTION private.authorize_nfse_individual_internal(a uuid,c uuid,p uuid,e text,m text)
      RETURNS void LANGUAGE plpgsql AS $$ BEGIN
        IF auth.role() IS DISTINCT FROM 'service_role' OR a IS DISTINCT FROM '${id(3)}'::uuid
          OR c IS DISTINCT FROM '${id(1)}'::uuid OR p IS DISTINCT FROM '${id(2)}'::uuid
          OR e IS DISTINCT FROM 'PRODUCAO' OR m !~ '^2026-[0-9]{2}$' THEN
          RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
      END $$;
      CREATE TABLE private.nfse_individual_operations(id uuid,polo_id uuid,environment text,state text,
        authorized_xml text,dps_id text,result jsonb,snapshot jsonb,updated_at timestamptz);`);
    await db.exec(migration);
    const insert = (n, polo, state) => db.query(`INSERT INTO private.nfse_individual_operations VALUES
      ($1,$2,'PRODUCAO',$3,'synthetic xml',$4,$5,$6,$7)`, [id(n),id(polo),state,`DPS${String(n).repeat(42)}`,
      { accessKey: String(n).repeat(50) }, { issuer: { cnpj: '11.111.111/1111-11' } }, `2026-11-${String(n).padStart(2,'0')}`]);
    await insert(4,2,'AUTHORIZED'); await insert(5,2,'REJECTED'); await insert(6,9,'AUTHORIZED');
    await db.exec("SET request.jwt.claim.role='service_role'");
    const call = (overrides = {}) => db.query('SELECT public.get_nfse_health_reference_internal($1,$2,$3,$4,$5) value',
      Object.values({ actor:id(3),context:id(1),polo:id(2),environment:'PRODUCAO',month:'2026-11',...overrides }));
    const before = await db.query('SELECT to_jsonb(o) value FROM private.nfse_individual_operations o ORDER BY id');
    const result = (await call()).rows[0].value;
    assert.deepEqual(result, { reference: { dpsId:`DPS${'4'.repeat(42)}`,accessKey:'4'.repeat(50),issuerCnpj:'1'.repeat(14) } });
    assert(!JSON.stringify(result).includes('synthetic xml'));
    assert.deepEqual((await db.query('SELECT to_jsonb(o) value FROM private.nfse_individual_operations o ORDER BY id')).rows, before.rows);
    for (const overrides of [{actor:id(7)},{context:id(7)},{polo:id(7)},{environment:'HOMOLOGACAO'}]) {
      await assert.rejects(call(overrides), /denied/);
    }
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query(`SELECT has_function_privilege($1,
        'public.get_nfse_health_reference_internal(uuid,uuid,uuid,text,text)','execute') allowed`,[role])).rows[0].allowed,false);
      await db.exec(`SET request.jwt.claim.role='${role}'`); await assert.rejects(call(), /denied/);
    }
    await db.exec("SET request.jwt.claim.role='service_role'; DELETE FROM private.nfse_individual_operations WHERE state='AUTHORIZED'");
    assert.deepEqual((await call()).rows[0].value, {reference:null});
  } finally { await db.close(); }
});
