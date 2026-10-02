import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../../modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.parser.ts', import.meta.url), 'utf8');
const compiled = transformSync(parserSource, { loader: 'ts', format: 'esm', target: 'es2022' });
const { requireProescCycleReview, requireEligibleProescCycleReview } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1);
const sourceObserved = '2020-01-01T00:00:00Z';
const scalar = async (query, args = []) => (await db.query(query, args)).rows[0].value;
const review = (enrollment, actorId = actor) => scalar(
  'select public.proesc_v2_cycle_review_service($1,$2) value', [actorId, enrollment]);
const facts = () => scalar(`select jsonb_agg(to_jsonb(e) order by matricula_id) value
  from internal_proesc.enrollment_cycle_evidence e`);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_academic;
    CREATE TABLE internal_proesc.enrollment_cycle_evidence(
      matricula_id uuid PRIMARY KEY,has_external_cycle2 boolean,source_observed_at timestamptz,
      confirmed_c1 boolean,pode_gerar boolean);
    CREATE FUNCTION internal_proesc.authorize_cycle_review(uuid,uuid) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN IF $1 IS DISTINCT FROM '${actor}'::uuid THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF; END $$;
    CREATE FUNCTION internal_proesc.has_confirmed_first_cycle_only(uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT coalesce((SELECT confirmed_c1 FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=$1),false) $$;
    CREATE FUNCTION internal_academic.technical_manual_cycle_state(uuid) RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('podeGerar',pode_gerar) FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=$1 $$;
  `);
  for (const [n, full, c1, eligible] of [[10, false, true, true], [11, false, true, false], [12, true, true, true], [13, false, false, false]]) {
    await db.query('insert into internal_proesc.enrollment_cycle_evidence values($1,$2,$3,$4,$5)',
      [id(n), full, sourceObserved, c1, eligible]);
  }
  // Prove the actual previously applied SQL response is rejected by the actual UI.
  const old = migration('20261002010400_proesc_v2_worker_and_cycle_readers.sql');
  const start = old.indexOf('CREATE FUNCTION public.proesc_v2_cycle_review_service(');
  assert.ok(start >= 0);
  const end = old.indexOf('$function$;', old.indexOf('AS $function$', start) + 'AS $function$'.length);
  await db.exec(old.slice(start, end + '$function$;'.length));
  for (const enrollment of [id(10), id(14)]) {
    const oldResponse = await review(enrollment);
    assert.throws(() => requireProescCycleReview(oldResponse), /conferência válida/);
  }
  const before = await facts();
  await db.exec(migration('20261002010600_proesc_v2_cycle_payload_compat.sql'));
  for (const [n, classification, eligible] of [[10, 'C1', true], [11, 'C1', false], [12, 'FULL', false], [13, 'UNKNOWN', false], [14, 'UNKNOWN', false]]) {
    const response = await review(id(n));
    const parsed = requireProescCycleReview(response);
    assert.equal(parsed.classification, classification);
    assert.equal(parsed.eligible, eligible);
    assert.equal(response.source, 'API_SCHEDULE_REVIEW');
    assert.equal(response.version, 'v2');
    assert.equal(response.evidenceSource, classification === 'UNKNOWN' ? 'PROESC_V2_REVIEW' : 'CONFIRMED_LOCAL_HISTORY');
    assert.ok(Math.abs(Date.now() - Date.parse(response.observedAt)) < 10_000);
    if (n === 14) assert.equal(response.evidenceObservedAt, null);
    else assert.equal(Date.parse(response.evidenceObservedAt), Date.parse(sourceObserved));
    if (eligible) {
      assert.equal(Date.parse(response.validUntil) - Date.parse(response.observedAt), 300_000);
      requireEligibleProescCycleReview(parsed, Date.parse(response.observedAt) + 299_999);
      assert.throws(() => requireEligibleProescCycleReview(parsed, Date.parse(response.validUntil)), /expirou/);
    } else {
      assert.equal(response.validUntil, null);
      assert.throws(() => requireEligibleProescCycleReview(parsed));
    }
  }
  await assert.rejects(review(id(10), id(99)), /Denied/);
  assert.equal(await scalar(`select has_function_privilege('authenticated','public.proesc_v2_cycle_review_service(uuid,uuid)','execute') value`), false);
  assert.equal(await scalar(`select has_function_privilege('service_role','public.proesc_v2_cycle_review_service(uuid,uuid)','execute') value`), true);
  assert.deepEqual(await facts(), before, 'Reading eligibility must never renew or expire durable evidence');
  const again = requireProescCycleReview(await review(id(10)));
  requireEligibleProescCycleReview(again, Date.parse(again.observedAt));
  assert.deepEqual(await facts(), before);
  console.log('PASS: real V2 cycle SQL + deployed UI parser, C1 eligibility/blocked, FULL protection, UNKNOWN/null evidence, read TTL only, auth and durable facts preserved.');
} finally { await db.close(); }
