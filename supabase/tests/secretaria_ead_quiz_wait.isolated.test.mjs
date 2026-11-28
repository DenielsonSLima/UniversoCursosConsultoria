import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enrollment, id, newTrustCertificateDatabase, other, scalar, source, submit, turma, unit,
} from './ead_trust_certificate.fixture.mjs';

const list = (db, polo = unit, search = null, page = 1) => scalar(db,
  'SELECT public.secretaria_listar_provas_ead_em_carencia($1,$2,$3) AS value', [polo, search, page]);
const release = (db, polo = unit, id = enrollment, reason = 'Solicitação acadêmica conferida.') => scalar(db,
  'SELECT public.secretaria_liberar_prova_ead_antecipada($1,$2,$3) AS value', [polo, id, reason]);
const permission = (db, value) => db.query(
  "SELECT set_config('test.secretaria_permissions',$1,false)", [JSON.stringify(value)]);

async function database() {
  const db = await newTrustCertificateDatabase();
  await db.exec(`
    CREATE FUNCTION public.gestor_effective_permissions() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.secretaria_permissions',true),'')::jsonb $$;
    CREATE OR REPLACE FUNCTION public.is_gestor_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT $1 = nullif(current_setting('test.secretaria_polo',true),'')::uuid $$;
    SET test.secretaria_polo = '${unit}';
    UPDATE public.matriculas SET status='ATIVO' WHERE id='${enrollment}';
  `);
  await permission(db, { tabs: { secretaria: ['provas-ead'] } });
  await db.exec(await source('20261128130000_ead_study_periods.sql'));
  await db.exec(await source('20261128130010_ead_quiz_release_guard.sql'));
  await db.exec(await source('20261128130015_protect_ead_quiz_questions.sql'));
  await db.exec(await source('20261128130020_secretaria_ead_quiz_wait.sql'));
  await db.exec(await source('20261128130040_freeze_ead_certificate_study_period.sql'));
  return db;
}

async function start(db, daysAgo) {
  await db.query("INSERT INTO internal_academic.ead_study_periods VALUES($1,now()-make_interval(days=>$2))",
    [enrollment, daysAgo]);
}

test('Secretaria lista apenas carência em aberto e registra uma antecipação justificada', async () => {
  const db = await database();
  try {
    assert.equal((await list(db)).total, 0);
    await start(db, 1);
    await assert.rejects(submit(db), error => error.code === 'PT409');
    const page = await list(db, unit, 'matemática');
    assert.equal(page.total, 1);
    assert.equal(page.pageSize, 20);
    assert.equal(page.items[0].matriculaId, enrollment);
    assert.equal(Date.parse(page.items[0].liberaEm) - Date.parse(page.items[0].iniciadoEm), 168 * 3_600_000);
    assert.equal((await list(db, unit, 'curso de fora')).total, 0);
    assert.deepEqual((await list(db, unit, null, 2)).items, []);
    await assert.rejects(release(db, unit, enrollment, '   '), error => error.code === '22023');
    const released = await release(db);
    assert.equal(released.matriculaId, enrollment);
    assert.deepEqual(await release(db), released);
    await assert.rejects(release(db, unit, enrollment, 'Outra justificativa.'), error => error.code === 'PT409');
    assert.equal((await list(db)).total, 0);
    assert.equal(await scalar(db, 'SELECT quiz_waiting AS value FROM internal_academic.ead_quiz_wait_state($1)', [enrollment]), false);
    assert.equal(await scalar(db, 'SELECT granted_by AS value FROM internal_academic.ead_quiz_early_releases'), other);
    assert.equal((await submit(db)).summary.quizPassed, true);
    const certificate = await scalar(db, "SELECT metadados->'eadStudyPeriod' AS value FROM public.certificados_academicos");
    assert.equal(certificate.source, 'VERIFIED_STUDY_ACTIVITY');
    assert.equal(certificate.startedOn, await scalar(db, "SELECT (started_at AT TIME ZONE 'America/Maceio')::date::text AS value FROM internal_academic.ead_study_periods"));
  } finally {
    await db.close();
  }
});

test('Secretaria exige permissão explícita, usuário autenticado e o polo da matrícula', async () => {
  const db = await database();
  try {
    await start(db, 1);
    for (const rejectedPermissions of [{}, { tabs: { secretaria: ['historico'] } }, { tabs: { secretaria: { 'provas-ead': true } } }]) {
      await permission(db, rejectedPermissions);
      await assert.rejects(list(db), error => error.code === '42501');
      await assert.rejects(release(db), error => error.code === '42501');
    }
    await permission(db, { tabs: { secretaria: ['provas-ead'] } });
    await db.exec("SET test.actor = ''");
    await assert.rejects(list(db), error => error.code === '42501');
    await assert.rejects(release(db), error => error.code === '42501');
    await db.exec(`SET test.actor = '${other}'; SET test.gestor = 'false'`);
    await assert.rejects(list(db), error => error.code === '42501');
    await db.exec("SET test.gestor = 'true'");
    await assert.rejects(list(db, id(202)), error => error.code === '42501');
    await assert.rejects(release(db, id(202)), error => error.code === '42501');
    await db.query('UPDATE public.turmas SET polo_id=$1 WHERE id=$2', [id(202), turma]);
    assert.equal((await list(db)).total, 0);
    await assert.rejects(release(db), error => error.code === 'PT404');
    assert.equal(await scalar(db, 'SELECT count(*)::int AS value FROM internal_academic.ead_quiz_early_releases'), 0);
    for (const role of ['anon', 'service_role']) {
      assert.equal(await scalar(db, "SELECT has_function_privilege($1,'public.secretaria_liberar_prova_ead_antecipada(uuid,uuid,text)','EXECUTE') AS value", [role]), false);
    }
  } finally {
    await db.close();
  }
});

test('Secretaria não apresenta matrícula concluída ou prazo que já terminou', async () => {
  const db = await database();
  try {
    await start(db, 7);
    assert.equal((await list(db)).total, 0);
    await assert.rejects(release(db), error => error.code === 'PT409');
    await db.query("UPDATE internal_academic.ead_study_periods SET started_at=now()-interval '1 hour' WHERE matricula_id=$1", [enrollment]);
    await db.query("UPDATE public.matriculas SET status='CONCLUIDO' WHERE id=$1", [enrollment]);
    assert.equal((await list(db)).total, 0);
    await assert.rejects(release(db), error => error.code === 'PT409');
  } finally {
    await db.close();
  }
});
