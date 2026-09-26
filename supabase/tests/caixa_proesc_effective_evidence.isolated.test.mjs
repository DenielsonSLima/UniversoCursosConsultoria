import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cases, migration, buildReadOnlySQL } from './caixa_proesc_effective_evidence.readonly.mjs';

// Optional existing local dependency. In-memory Postgres; no URL, token or network.
const packagePath = process.env.PGLITE_MODULE_PATH;
const packageURL = packagePath ? pathToFileURL(resolve(packagePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageURL);
const { pgcrypto } = await import(packagePath ? new URL('./contrib/pgcrypto.js', packageURL).href
  : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const transactionBody = migration.replace(/^BEGIN;\n/, '').replace(/\nCOMMIT;$/, '');
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function definition(text, name) {
  const start = text.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = text.slice(start);
  const delimiter = /\bas\s+(\$[a-z_]*\$)/i.exec(tail);
  assert.ok(delimiter, name);
  const end = tail.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length);
  return tail.slice(0, end + delimiter[1].length + 1);
}
const monthlySource = source('../migrations/20260913010000_caixa_monthly_delinquency.sql');
const openSource = source('../migrations/20260913132033_caixa_open_receivables_evidence.sql');
const readers = ['internal_contas.caixa_monthly_delinquency(uuid,date,date)',
  'internal_contas.caixa_open_receivables(uuid)'];
const proofSignature = 'internal_contas.caixa_proesc_open_receivable_verified(public.contas_receber,internal_proesc.financial_snapshots)';
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_contas; CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE public.contas_receber (
      id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,cliente_id uuid,polo_id uuid,
      status text,valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,
      updated_at timestamptz,origem_cronograma_id text,regra_financeira_tecnica_snapshot jsonb,
      gateway_payment_id text,gateway_boleto_nosso_numero text
    );
    CREATE TABLE internal_proesc.obligation_links (
      id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,receivable_id uuid,
      source_unit_id text,source_class_id text,source_key text,kind text,parent_link_id uuid,
      auto_enabled boolean,confirmed_by uuid,confirmed_at timestamptz
    );
    CREATE TABLE internal_proesc.financial_snapshots (
      id uuid PRIMARY KEY,link_id uuid,observed_at timestamptz,source_fingerprint text,
      principal_cents bigint,received_cents bigint,payment_date date,source_status text,
      verification text,evidence_kind text,components jsonb,accounting_lines jsonb,
      review_reasons jsonb,recorded_by uuid,recorded_at timestamptz,open_evidence jsonb,
      collector_review_reasons jsonb
    );
    CREATE TABLE internal_proesc.compacted_snapshot_observations (
      id uuid PRIMARY KEY,keeper_snapshot_id uuid,observed_at timestamptz,recorded_at timestamptz
    );
    CREATE VIEW internal_proesc.financial_observation_history WITH (security_invoker=true) AS
      SELECT * FROM internal_proesc.financial_snapshots UNION ALL
      SELECT a.id,s.link_id,a.observed_at,s.source_fingerprint,s.principal_cents,
        s.received_cents,s.payment_date,s.source_status,s.verification,s.evidence_kind,
        s.components,s.accounting_lines,s.review_reasons,s.recorded_by,a.recorded_at,
        s.open_evidence,s.collector_review_reasons
      FROM internal_proesc.compacted_snapshot_observations a
      JOIN internal_proesc.financial_snapshots s ON s.id=a.keeper_snapshot_id;
    CREATE TABLE public.emprestimos_financeiros (conta_receber_id uuid);
    CREATE TABLE public.payment_gateway_cnab_records (receivable_id uuid,provider_code text,status text);
    CREATE TABLE internal_proesc.enrollment_financial_confirmations (confirmed_snapshots jsonb);
    CREATE TABLE internal_proesc.reconciliation_events (
      snapshot_id uuid,original_snapshot_id uuid,mode text,result text);
    CREATE TABLE internal_proesc.sync_runs (id uuid,status text,finished_at timestamptz);
    CREATE TABLE internal_proesc.sync_run_items (
      run_id uuid,snapshot_id uuid,original_snapshot_id uuid,result text,error_code text);
    CREATE TABLE internal_proesc.packed_item_snapshot_refs (snapshot_id uuid);
    CREATE FUNCTION internal_proesc.reconciliation_source_system(p_row public.contas_receber)
      RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$ SELECT 'PROESC'::text $$;
  `);
  await db.exec(source('../migrations/20260919165139_proesc_observation_compaction.sql'));
  // Reconstruct the two later immutable patches, then verify the current remote
  // definition hash. No hand-written replacement of the compaction algorithm.
  const keeperGuard = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations a WHERE a.keeper_snapshot_id=s.id)';
  const packedGuard = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.packed_item_snapshot_refs a WHERE a.snapshot_id=s.id)';
  assert.ok(source('../migrations/20260919223611_proesc_items_archive.sql').includes(packedGuard));
  assert.ok(source('../migrations/20260919234600_proesc_history_hot_window.sql').includes("interval ''6 hours''"));
  const compactor = (await db.query(`SELECT pg_get_functiondef(
    'internal_proesc.compact_snapshot_observations(integer)'::regprocedure) AS definition`)).rows[0].definition;
  await db.exec(compactor.replace(keeperGuard, `${keeperGuard}\n    ${packedGuard}`)
    .replaceAll("interval '24 hours'", "interval '6 hours'"));
  assert.equal((await db.query(`SELECT md5(pg_get_functiondef(
    'internal_proesc.compact_snapshot_observations(integer)'::regprocedure)) AS hash`)).rows[0].hash,
  '78ce8e039c288d7f849112d63171d002');
  for (const [text, name] of [
    [monthlySource, 'internal_contas.caixa_monthly_receivable_state'],
    [monthlySource, 'internal_contas.caixa_monthly_delinquency'],
    [openSource, 'internal_contas.caixa_proesc_open_receivable_verified'],
    [openSource, 'internal_contas.caixa_open_receivables'],
  ]) await db.exec(definition(text, name));
  for (const signature of [...readers, proofSignature]) {
    await db.exec(`REVOKE ALL ON FUNCTION ${signature} FROM public,anon,authenticated,service_role`);
  }
  for (const row of cases) {
    await db.query(`INSERT INTO public.contas_receber
      SELECT * FROM jsonb_populate_record(NULL::public.contas_receber,$1::jsonb)`,
    [JSON.stringify({ ...row.receivable, polo_id: uid(9000), data_vencimento: '2026-09-15' })]);
    for (const link of row.links) await db.query(`INSERT INTO internal_proesc.obligation_links
      SELECT * FROM jsonb_populate_record(NULL::internal_proesc.obligation_links,$1::jsonb)`, [JSON.stringify(link)]);
    for (const snapshot of row.snapshots) await db.query(`INSERT INTO internal_proesc.financial_snapshots
      SELECT * FROM jsonb_populate_record(NULL::internal_proesc.financial_snapshots,$1::jsonb)`, [JSON.stringify(snapshot)]);
  }
  const state = async () => (await db.query(`SELECT
    md5((SELECT jsonb_agg(c ORDER BY id)::text FROM public.contas_receber c)) AS receivables,
    md5((SELECT jsonb_agg(l ORDER BY id)::text FROM internal_proesc.obligation_links l)) AS links,
    md5((SELECT jsonb_agg(h ORDER BY id)::text FROM internal_proesc.financial_observation_history h)) AS observations
  `)).rows[0];
  const baseline = await state();
  const readerMetadata = (await db.query(`SELECT oid,proname,proowner,proacl,prosecdef,provolatile,proconfig
    FROM pg_proc WHERE oid=ANY($1::regprocedure[]) ORDER BY oid`, [readers])).rows;

  // An unexpected reader body/metadata aborts the entire migration transaction.
  await db.exec('BEGIN');
  await db.exec(`ALTER FUNCTION ${readers[0]} VOLATILE`);
  await assert.rejects(() => db.exec(transactionBody), /reader drift/);
  await db.exec('ROLLBACK');
  assert.deepEqual(await state(), baseline);
  await db.exec('BEGIN');
  await db.exec(transactionBody);
  await db.exec('COMMIT');
  assert.deepEqual(await state(), baseline, 'Migration must not write financial or observation data');
  assert.deepEqual((await db.query(`SELECT oid,proname,proowner,proacl,prosecdef,provolatile,proconfig
    FROM pg_proc WHERE oid=ANY($1::regprocedure[]) ORDER BY oid`, [readers])).rows, readerMetadata);
  const plan = (await db.query(`EXPLAIN(FORMAT JSON) SELECT s.id
    FROM public.contas_receber c
    CROSS JOIN LATERAL internal_contas.caixa_proesc_effective_snapshot(c,$1) s WHERE c.id=$2`,
  [cases[1].link_id, cases[1].receivable.id])).rows[0]['QUERY PLAN'];
  assert.doesNotMatch(JSON.stringify(plan), /Function Scan/,
    'The selector must inline instead of planning an independent SQL function for every title');

  const { rows: fixtureResults } = await db.query(buildReadOnlySQL());
  assert.equal(Number(fixtureResults[0].cases), cases.length);
  assert.equal(Number(fixtureResults[0].passed), cases.length, JSON.stringify(fixtureResults[0].failures));
  for (const row of cases) {
    const { rows } = await db.query(`SELECT s.id,s.observed_at::text,s.recorded_at::text
      FROM public.contas_receber c
      CROSS JOIN LATERAL internal_contas.caixa_proesc_effective_snapshot(c,$2::uuid) s WHERE c.id=$1::uuid`,
    [row.receivable.id, row.link_id]);
    assert.equal(rows[0]?.id ?? null, row.expected_id, row.name);
    if (rows[0]) {
      assert.equal(Date.parse(rows[0].observed_at), Date.parse(row.expected_observed_at), `${row.name}: observation age`);
      assert.equal(Date.parse(rows[0].recorded_at), Date.parse(row.expected_recorded_at), `${row.name}: recording age`);
    }
  }

  // Integration: only one explicit OPEN + empty poll becomes eligible in a clean polo.
  const integration = cases.find((row) => row.name === 'trailing_empty_poll_preserves_proof_and_original_age');
  await db.query('UPDATE public.contas_receber SET polo_id=$2 WHERE id=$1', [integration.receivable.id, uid(9001)]);
  const monthly = (await db.query(`SELECT internal_contas.caixa_monthly_delinquency($1,'2026-09-01','2026-09-26') AS value`,
    [uid(9001)])).rows[0].value;
  assert.equal(monthly.receber_vencido, 279.9);
  assert.equal(monthly.inadimplencia_mensal.quantidade_elegiveis, 1);
  assert.equal(monthly.inadimplencia_mensal.quantidade_em_conferencia, 0);
  const open = (await db.query('SELECT internal_contas.caixa_open_receivables($1) AS value', [uid(9001)])).rows[0].value;
  assert.equal(open.a_receber, 279.9);
  assert.equal(open.receitas_futuras.quantidade_elegiveis, 1);
  const otherPolo = (await db.query(`SELECT internal_contas.caixa_monthly_delinquency($1,'2026-09-01','2026-09-26') AS value`,
    [uid(9999)])).rows[0].value;
  assert.equal(otherPolo.inadimplencia_mensal.quantidade_elegiveis, 0, 'Polo scope remains intact');

  // Run the REAL lossless compactor: only interior duplicates move to history.
  // Last informative state and last poll, including their original age, survive.
  const original = integration.snapshots[0];
  await db.query('DELETE FROM internal_proesc.financial_snapshots WHERE link_id=$1', [integration.link_id]);
  await db.query("INSERT INTO internal_proesc.sync_runs VALUES($1,'SUCCEEDED','2026-09-23')", [uid(999001)]);
  const retained = [];
  for (let i = 0; i < 6; i++) {
    const timestamp = `2026-09-23T${i < 3 ? '12' : '13'}:${String((i % 3) * 10).padStart(2, '0')}:00+00:00`;
    const row = { ...(i < 3 ? original : integration.snapshots[1]), id: uid(999100 + i),
      observed_at: timestamp, recorded_at: timestamp };
    retained.push(row);
    await db.query(`INSERT INTO internal_proesc.financial_snapshots
      SELECT * FROM jsonb_populate_record(NULL::internal_proesc.financial_snapshots,$1::jsonb)`, [JSON.stringify(row)]);
    await db.query("INSERT INTO internal_proesc.sync_run_items VALUES($1,$2,NULL,'UNCHANGED',NULL)", [uid(999001), row.id]);
  }
  const beforeCompaction = await state();
  const compacted = (await db.query('SELECT internal_proesc.compact_snapshot_observations(250) AS result')).rows[0].result;
  assert.equal(compacted.compacted, 2);
  assert.equal(compacted.historyVerified, true);
  assert.deepEqual(await state(), beforeCompaction, 'Compaction preserves complete canonical history');
  assert.deepEqual((await db.query(`SELECT id FROM internal_proesc.financial_snapshots
    WHERE link_id=$1 ORDER BY observed_at,recorded_at,id`, [integration.link_id])).rows.map((r) => r.id),
  [retained[0].id, retained[2].id, retained[3].id, retained[5].id],
  'Both the first and last ORIGINAL ID of every exact-content block remain physical');
  assert.deepEqual((await db.query(`SELECT id FROM internal_proesc.compacted_snapshot_observations
    WHERE keeper_snapshot_id=ANY($1::uuid[]) ORDER BY observed_at`,
  [[retained[0].id, retained[3].id]])).rows.map((r) => r.id), [retained[1].id, retained[4].id],
  'Only interior duplicates move to the lossless history');
  const selectedAfterCompaction = (await db.query(`SELECT s.id,s.observed_at::text
    FROM public.contas_receber c CROSS JOIN LATERAL internal_contas.caixa_proesc_effective_snapshot(c,$2) s
    WHERE c.id=$1`, [integration.receivable.id, integration.link_id])).rows[0];
  assert.equal(selectedAfterCompaction.id, retained[2].id);
  assert.equal(Date.parse(selectedAfterCompaction.observed_at), Date.parse(retained[2].observed_at));

  const helpers = ['internal_contas.caixa_proesc_effective_snapshot(public.contas_receber,uuid)',
    'internal_contas.caixa_proesc_uninformative_observation(internal_proesc.financial_snapshots,bigint)'];
  for (const role of ['anon', 'authenticated', 'service_role']) for (const signature of helpers) {
    const privileges = (await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature])).rows[0];
    assert.equal(privileges.allowed, false, `${role} must not invoke a private helper`);
  }
  console.log(`${cases.length} evidence scenarios; real migration/drift/OID/ACL; both Caixa readers; polo; canonical history passed.`);
} finally { await db.close(); }
