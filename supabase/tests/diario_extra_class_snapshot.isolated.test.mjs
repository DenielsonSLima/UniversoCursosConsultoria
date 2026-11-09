import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { createSnapshot, IDS } from '../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts';

// Isolated PostgreSQL/WASM only. No remote connection or production records.
const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const { pgcrypto } = await import(process.env.PGLITE_MODULE_PATH
  ? new URL('./contrib/pgcrypto.js', packageUrl).href : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const migration = await read('../migrations/20261109040500_validate_diario_extra_class_snapshot.sql');
const extraId = '00000000-0000-4000-8000-000000000050';
let coreHash;

function extract(source, name) {
  const declaration = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(declaration >= 0, `Missing canonical function ${name}`);
  const end = source.indexOf('\n$function$;', declaration);
  assert.ok(end > declaration);
  return source.slice(declaration, end + '\n$function$;'.length);
}

async function seal(snapshot) {
  snapshot.templateSource.sha256 = (await db.query(
    'select public.assinatura_eletronica_sha256_json($1::jsonb) as hash',
    [JSON.stringify(snapshot.templateSource.raw)],
  )).rows[0].hash;
  const academic = Object.fromEntries([
    'students','aulas','attendanceMap','gradesMap','praticasMap',
    'observacoes','activeInstruments','closure',
    ...(snapshot.extraClassCredit ? ['extraClassCredit'] : []),
  ].map((key) => [key, snapshot[key]]));
  snapshot.source.academicRevisionSha256 = (await db.query(
    'select public.assinatura_eletronica_sha256_json($1::jsonb) as hash', [JSON.stringify(academic)],
  )).rows[0].hash;
  return snapshot;
}

async function snapshot({ extension = true, eligible = true } = {}) {
  const data = createSnapshot();
  const logo = 'https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/assets/logo.png';
  data.assetSources.headerLogoUrl = logo;
  data.institutionalIdentity.logoUrl = logo;
  data.template.cabecalhoLogoUrl = logo;
  // 4h in class, all absent, plus 12h extra = exactly 75%.
  data.attendanceMap[IDS.student][IDS.session] = 'F';
  data.gradesMap[IDS.student].total_faltas = 1;
  data.gradesMap[IDS.student].frequencia_percent = extension && eligible ? 75 : 0;
  if (extension) {
    data.disciplina.cargaHoraria = 16;
    data.closure.hoursCompleted = 16;
    data.closure.requiredHours = 16;
    data.extraClassCredit = {
      schemaVersion: 1,
      activities: [{ id: extraId, titulo: 'Atividade em casa', cargaHoraria: 12, dataSource: '2026-08-18' }],
      eligibleActivityIdsByStudent: { [IDS.student]: eligible ? [extraId] : [] },
    };
  }
  return seal(data);
}

async function valid(data) {
  return (await db.query('select public.assinatura_eletronica_snapshot_academico_diario_valido($1::jsonb) as valid',
    [JSON.stringify(data)])).rows[0].valid;
}

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema internal_academic; create schema extensions; create extension pgcrypto with schema extensions;
    create function public.assinatura_eletronica_sha256_json(value jsonb) returns text
    language sql immutable strict as $$ select encode(extensions.digest(value::text,'sha256'),'hex'); $$;`);
  const original = await read('../migrations/20260819203221_enable_diario_signature_envelopes_v1.sql');
  await db.exec(extract(original, 'assinatura_eletronica_snapshot_academico_diario_valido')
    .replace('public.assinatura_eletronica_snapshot_academico_diario_valido(',
      'public.assinatura_eletronica_snapshot_academico_diario_valido_v1_https('));
  const watermark = await read('../migrations/20260819203314_harden_diario_artifact_pipeline.sql');
  await db.exec(extract(watermark, 'assinatura_eletronica_watermark_source_diario_valido'));
  await db.exec(extract(watermark, 'assinatura_eletronica_snapshot_academico_diario_valido')
    .replace('public.assinatura_eletronica_snapshot_academico_diario_valido(',
      'public.assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark('));
  const normalization = await read('../migrations/20260823170300_allow_legacy_source_uuids_in_diary_snapshot.sql');
  await db.exec(extract(normalization, 'assinatura_eletronica_normalizar_source_uuids_legados'));
  const latest = await read('../migrations/20260823170400_allow_missing_institutional_email_in_diary_snapshot.sql');
  await db.exec(extract(latest, 'assinatura_eletronica_snapshot_academico_diario_valido'));
  coreHash = (await db.query(`select md5(pg_get_functiondef(
    'public.assinatura_eletronica_snapshot_academico_diario_valido_v1_https(jsonb)'::regprocedure)) as hash`)).rows[0].hash;
  assert.equal(await valid(await snapshot({ extension: false })), true, 'Existing snapshot remains valid');
  assert.equal(await valid(await snapshot()), false, 'Reproduce old rejection of the new evidence');
  await db.exec(migration);
});
after(async () => { await db.close(); });

test('new credit validates exactly 75%, without modifying the original snapshot or the legacy core', async () => {
  const data = await snapshot();
  const original = JSON.stringify(data);
  assert.equal(await valid(data), true);
  const { rows } = await db.query('select internal_academic.diario_snapshot_extra_classe_base($1::jsonb) as projection', [original]);
  assert.equal(rows[0].projection.gradesMap[IDS.student].frequencia_percent, 0);
  assert.equal(rows[0].projection.extraClassCredit, undefined);
  assert.equal(JSON.stringify(data), original);
  assert.equal(data.attendanceMap[IDS.student][IDS.session], 'F');
  assert.equal(data.gradesMap[IDS.student].frequencia_percent, 75);
  assert.equal((await db.query(`select md5(pg_get_functiondef(
    'public.assinatura_eletronica_snapshot_academico_diario_valido_v1_https(jsonb)'::regprocedure)) as hash`)).rows[0].hash, coreHash);
});

test('activities and eligible references retain canonical date/ID ordering', async () => {
  const data = await snapshot();
  const secondId = '00000000-0000-4000-8000-000000000051';
  data.extraClassCredit.activities[0].cargaHoraria = 6;
  data.extraClassCredit.activities.push({ id: secondId, titulo: 'Segunda atividade', cargaHoraria: 6, dataSource: '2026-08-18' });
  data.extraClassCredit.eligibleActivityIdsByStudent[IDS.student].push(secondId);
  assert.equal(await valid(await seal(data)), true);
  data.extraClassCredit.activities.reverse();
  assert.equal(await valid(await seal(data)), false);
  data.extraClassCredit.activities.reverse();
  data.extraClassCredit.eligibleActivityIdsByStudent[IDS.student].reverse();
  assert.equal(await valid(await seal(data)), false);
});

test('new snapshots without extra activities retain normal classroom frequency', async () => {
  const data = await snapshot({ extension: false });
  data.extraClassCredit = { schemaVersion: 1, activities: [], eligibleActivityIdsByStudent: { [IDS.student]: [] } };
  assert.equal(await valid(await seal(data)), true);
});

test('empty eligibility credits no hours, while the discipline still includes its extra workload', async () => {
  assert.equal(await valid(await snapshot({ eligible: false })), true);
  const invalid = await snapshot({ eligible: false });
  invalid.gradesMap[IDS.student].frequencia_percent = 75;
  assert.equal(await valid(await seal(invalid)), false);
});

test('old snapshots keep the exact former contract and digest', async () => {
  const legacy = await snapshot({ extension: false });
  const before = JSON.stringify(legacy);
  assert.equal(await valid(legacy), true);
  assert.equal(JSON.stringify(legacy), before);
  legacy.frontendHint = true;
  assert.equal(await valid(legacy), false);
});

test('evidence, formula and closure tampering fail even after recomputing the academic hash', async () => {
  const mutations = [
    (s) => { s.extraClassCredit.schemaVersion = 2; },
    (s) => { s.extraClassCredit.frontendHint = true; },
    (s) => { s.extraClassCredit.activities[0].titulo = ''; },
    (s) => { s.extraClassCredit.activities[0].cargaHoraria = -1; },
    (s) => { s.extraClassCredit.activities[0].cargaHoraria = '12'; },
    (s) => { s.extraClassCredit.activities[0].dataSource = '2026-08-20'; },
    (s) => { s.extraClassCredit.activities[0].dataSource = '2026-02-30'; },
    (s) => { s.extraClassCredit.activities.push(structuredClone(s.extraClassCredit.activities[0])); },
    (s) => { s.extraClassCredit.eligibleActivityIdsByStudent[IDS.student].push(extraId); },
    (s) => { s.extraClassCredit.eligibleActivityIdsByStudent[IDS.student] = [IDS.lesson]; },
    (s) => { s.extraClassCredit.eligibleActivityIdsByStudent[extraId] = []; },
    (s) => { delete s.extraClassCredit.eligibleActivityIdsByStudent[IDS.student]; },
    (s) => { s.gradesMap[IDS.student].frequencia_percent = 74.99; },
    (s) => { s.closure.hoursCompleted = 17; },
    (s) => { s.attendanceMap[IDS.student][IDS.session] = 'P'; },
    (s) => { delete s.attendanceMap[IDS.student][IDS.session]; },
    (s) => { s.aulas = []; },
  ];
  for (const mutation of mutations) {
    const data = await snapshot();
    mutation(data);
    assert.equal(await valid(await seal(data)), false, mutation.toString());
  }
});

test('the digest binds extra evidence, and institution/template validation still applies', async () => {
  const data = await snapshot();
  data.extraClassCredit.activities[0].titulo = 'Alteração sem novo hash';
  assert.equal(await valid(data), false);
  data.source.academicRevisionSha256 = 'f'.repeat(64);
  assert.equal(await valid(data), false);
  await seal(data);
  data.institutionalIdentity.logoUrl = 'https://another.invalid/logo.png';
  assert.equal(await valid(data), false);
});

test('the extension projection is private and preserves closed attendance validation', async () => {
  const permissions = await db.query(`select role, has_function_privilege(role,
    'internal_academic.diario_snapshot_extra_classe_base(jsonb)','EXECUTE') as allowed
    from (values ('anon'),('authenticated'),('service_role')) roles(role)`);
  assert.ok(permissions.rows.every((row) => !row.allowed));
  const data = await snapshot();
  data.attendanceMap[IDS.student][IDS.session] = 'X';
  data.gradesMap[IDS.student].frequencia_percent = 100;
  assert.equal(await valid(await seal(data)), false);
});

test('the freeze migration rejects an unexpected builder before changing its code or privileges', async () => {
  await db.exec(`create function public.assinatura_eletronica_solicitar_envelope_diario(uuid,uuid,text,uuid,uuid)
    returns jsonb language sql security definer set search_path = '' as $$ select '{}'::jsonb; $$;`);
  const signature = 'public.assinatura_eletronica_solicitar_envelope_diario(uuid,uuid,text,uuid,uuid)';
  const metadata = `select oid,proacl::text,prosecdef,proconfig,pg_get_functiondef(oid) as definition
    from pg_proc where oid=$1::regprocedure`;
  const before = (await db.query(metadata, [signature])).rows;
  const patch = await read('../migrations/20261109040600_freeze_diario_extra_class_credit.sql');
  await assert.rejects(db.exec(patch), /Drift ou dependência ausente/);
  await db.exec('rollback');
  assert.deepEqual((await db.query(metadata, [signature])).rows, before);
});
