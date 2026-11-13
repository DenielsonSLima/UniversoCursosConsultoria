import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const migration = await readFile(new URL('../migrations/20261112225200_nfse_service_payment_fiscal_guard.sql', import.meta.url), 'utf8');
const actor = '10000000-0000-4000-8000-000000000001';
const source = '20000000-0000-4000-8000-000000000002';
const polo = '30000000-0000-4000-8000-000000000003';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA internal_financial_payments;
    CREATE TABLE private.nfse_service_receivables(receivable_id uuid PRIMARY KEY,fiscal_cancelled_at timestamptz);
    CREATE TABLE private.nfse_service_cancellation_jobs(receivable_id uuid PRIMARY KEY,state text);
    CREATE FUNCTION internal_financial_payments.authorize_source(p_actor uuid,p_kind text,p_id uuid)
    RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
      IF p_actor IS DISTINCT FROM '${actor}'::uuid THEN
        RAISE EXCEPTION 'PAYMENT_ACCESS_DENIED' USING ERRCODE='42501';
      END IF;
      RETURN jsonb_build_object('polo_id','${polo}');
    END $$;
    CREATE FUNCTION internal_financial_payments.normalized_input(uuid,uuid,jsonb)
    RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'AFTER_FISCAL_GUARD' USING ERRCODE='P0001';
    END $$;
    CREATE FUNCTION internal_financial_payments.preview_for_actor(uuid,text,uuid,jsonb)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    REVOKE ALL ON FUNCTION internal_financial_payments.preview_for_actor(uuid,text,uuid,jsonb)
      FROM PUBLIC,anon,authenticated,service_role;
  `);
  await db.exec(migration);
  return db;
}
async function preview(db, kind = 'RECEIVABLE', user = actor) {
  return db.query('SELECT internal_financial_payments.preview_for_actor($1,$2,$3,$4)', [user,kind,source,{}]);
}
const rejects = (work, message, code) => assert.rejects(work, error => error.message.includes(message) && error.code === code);

test('fiscal cancellation blocks the real preview before normalization or a payment intent', async () => {
  const db = await fixture();
  try {
    await db.query('INSERT INTO private.nfse_service_receivables VALUES($1,now())', [source]);
    await rejects(preview(db), 'PAYMENT_NFSE_FISCAL_CANCELLED', '55000');
  } finally { await db.close(); }
});

for (const state of ['READY','LEASED','REVIEW']) {
  test(`cancellation job ${state} blocks a service even before the fiscal projection arrives`, async () => {
    const db = await fixture();
    try {
      await db.query('INSERT INTO private.nfse_service_receivables VALUES($1,NULL)', [source]);
      await db.query('INSERT INTO private.nfse_service_cancellation_jobs VALUES($1,$2)', [source,state]);
      await rejects(preview(db), 'PAYMENT_NFSE_FISCAL_CANCELLED', '55000');
    } finally { await db.close(); }
  });
}

for (const variant of ['active-service','ordinary-receivable','expense']) {
  test(`${variant} continues to the original canonical calculator`, async () => {
    const db = await fixture();
    try {
      if (variant !== 'ordinary-receivable') await db.query('INSERT INTO private.nfse_service_receivables VALUES($1,$2)', [source,variant === 'expense' ? new Date().toISOString() : null]);
      await rejects(preview(db, variant === 'expense' ? 'EXPENSE' : 'RECEIVABLE'), 'AFTER_FISCAL_GUARD', 'P0001');
    } finally { await db.close(); }
  });
}

test('authorization precedes fiscal inspection and internal RPC grants remain closed', async () => {
  const db = await fixture();
  try {
    await db.query('INSERT INTO private.nfse_service_receivables VALUES($1,now())', [source]);
    await rejects(preview(db,'RECEIVABLE',null), 'PAYMENT_ACCESS_DENIED', '42501');
    const grants = await db.query(`SELECT has_function_privilege(role,'internal_financial_payments.preview_for_actor(uuid,text,uuid,jsonb)','EXECUTE') allowed
      FROM unnest(ARRAY['anon','authenticated','service_role']) role`);
    assert.deepEqual(grants.rows.map(row => row.allowed), [false,false,false]);
  } finally { await db.close(); }
});
