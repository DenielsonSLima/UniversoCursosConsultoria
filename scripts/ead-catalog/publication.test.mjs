import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  database, applyRevisions, alumno, unit, configFor, course as mathematicsCourse,
} from '../../supabase/tests/ead_assessment_revision.harness.mjs';
import { generatePrivateStaging, generatePublication } from './publication-sql.mjs';

const course = '99999999-9999-4999-8999-999999999999';
const turma = '99999999-9999-4999-8999-999999999998';
const enrollment = '99999999-9999-4999-8999-999999999997';
const sources = [1, 2].map(i => ({ id: `fixture-${i}`, title: `Fonte sintética ${i}`,
  url: `https://example.org/fixture-${i}` }));
const lessons = Array.from({ length: 5 }, (_, i) => ({
  id: `fixture-catalog-lesson-${i}`, title: `Aula sintética ${i}`, hours: 24,
  skills: [`Habilidade sintética ${i}`], sourceIds: ['fixture-1'],
  html: `<p>${'Dados técnicos artificiais para testar o transporte e o isolamento. '.repeat(45)}</p>`,
}));
const item = (lesson, type, i) => ({ id: `fixture-catalog-${type}-${i}`, lessonId: lesson.id,
  skill: lesson.skills[0], sourceIds: ['fixture-1'], prompt: `Caso técnico sintético ${type} ${i}?`,
  options: ['Opção A', 'Opção B', 'Opção C', 'Opção D'] });
const revision = {
  courseId: course, courseName: 'Curso sintético de catálogo',
  revisionId: 'ead-fixture-catalog-20261027-v2', hours: 120, sources, lessons,
  activities: lessons.map((lesson, i) => item(lesson, 'activity', i)),
  exam: lessons.flatMap((lesson, i) => [item(lesson, 'exam', i * 2), item(lesson, 'exam', i * 2 + 1)]),
};
const keyring = { [revision.revisionId]: Object.fromEntries(
  [...revision.activities, ...revision.exam].map((q, i) => [q.id, { correctIndex: i % 4,
    explanation: `Fixture técnica ${q.id}, sem pretensão de resolução pedagógica.` }]),
) };
const setup = async () => {
  const db = await database();
  await applyRevisions(db);
  await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,120)',
    [course, revision.courseName, 'EAD', configFor('catalog-old')]);
  await db.query('INSERT INTO turmas(id,curso_id,polo_id) VALUES($1,$2,$3)', [turma, course, unit]);
  await db.query('INSERT INTO matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,$4)',
    [enrollment, alumno, turma, 'ATIVO']);
  await db.query('INSERT INTO ead_aluno_progresso(aluno_id,curso_id,progress) VALUES($1,$2,$3)',
    [alumno, course, { completedContentIds: ['catalog-old-lesson'], quizAnswers: {} }]);
  const baseline = (await db.query(`SELECT id,nome,carga_horaria,ead_config,
    md5(ead_config::text) AS config_hash FROM cursos WHERE id=$1`, [course])).rows
    .map(row => ({ ...row, carga_horaria: Number(row.carga_horaria) }));
  return { db, baseline };
};
const readProgress = async db => (await db.query(
  'SELECT ead_get_aluno_progress($1,$2) AS result', [alumno, course],
)).rows[0].result;

test('curso fora das matemáticas recebe revisão sem reescrever histórico nem expor gabarito', async () => {
  const { db, baseline } = await setup();
  try {
    const mathBefore = (await db.query('SELECT ead_config FROM cursos WHERE id=$1', [mathematicsCourse])).rows[0];
    await db.exec(generatePrivateStaging(revision, baseline, keyring));
    const sql = generatePublication([revision], baseline);
    assert.equal(/respostaCorreta|explicacao|correctIndex/.test(sql), false);
    await db.exec(sql);
    const historical = await readProgress(db);
    assert.equal(historical.assessmentRevision.current, 'legacy-20261027');
    assert.equal(historical.assessmentRevision.available, revision.revisionId);
    assert.equal(historical.effectiveEadConfig.provas[0].questoes[0].id, 'catalog-old-q0');
    assert.equal(historical.progress.completedContentIds[0], 'catalog-old-lesson');
    const upgraded = (await db.query('SELECT ead_start_assessment_revision($1,$2,$3) AS result',
      [alumno, course, revision.revisionId])).rows[0].result;
    assert.equal(upgraded.assessmentRevision.current, revision.revisionId);
    assert.equal(upgraded.summary.questionsTotal, 10);
    const update = (action, id, payload = {}) => db.query(
      'SELECT ead_update_aluno_progress($1,$2,$3,$4,$5) AS result', [alumno, course, action, id, payload],
    );
    for (const lesson of lessons) await update('toggle_content', lesson.id);
    for (const activity of revision.activities) {
      await update('set_activity_answer', activity.id,
        { answer: String(keyring[revision.revisionId][activity.id].correctIndex) });
      await update('complete_activity', activity.id);
    }
    const completed = (await update('finish_quiz', null, { answers: Object.fromEntries(
      revision.exam.map(q => [q.id, keyring[revision.revisionId][q.id].correctIndex]),
    ) })).rows[0].result;
    assert.equal(completed.summary.quizPassed, true);
    assert.equal(completed.assessmentFeedback.quiz.score, 100);
    const publicConfig = (await db.query('SELECT ead_config FROM cursos WHERE id=$1', [course])).rows[0];
    assert.equal(/respostaCorreta|explicacao|correctIndex/.test(JSON.stringify(publicConfig)), false);
    assert.deepEqual((await db.query('SELECT ead_config FROM cursos WHERE id=$1', [mathematicsCourse])).rows[0], mathBefore);
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.ead_progress_revision_archives WHERE course_id=$1', [course])).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.ead_revision_publication_packages')).rows[0].n, 0);
  } finally { await db.close(); }
});

for (const mutation of [
  "jsonb_set(config,'{provas,0,questoes}','[]')",
  "config - 'conteudos' - 'contentRevision'",
]) test(`pacote divergente ou incompleto falha antes de registrar versão: ${mutation}`, async () => {
  const { db, baseline } = await setup();
  try {
    await db.exec(generatePrivateStaging(revision, baseline, keyring));
    await db.exec(`UPDATE internal_academic.ead_revision_publication_packages SET config=${mutation}`);
    await assert.rejects(db.exec(generatePublication([revision], baseline)), /diverge/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.ead_course_revisions WHERE course_id=$1', [course])).rows[0].n, 0);
    const current = await readProgress(db);
    assert.equal(current.assessmentRevision, undefined);
    assert.deepEqual(current.progress.completedContentIds, ['catalog-old-lesson']);
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.ead_revision_publication_packages')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('falha no segundo curso desfaz o primeiro e conserva os dois pacotes para retomada', async () => {
  const { db, baseline } = await setup();
  const secondId = '77777777-7777-4777-8777-777777777777';
  const second = { ...revision, courseId: secondId,
    courseName: 'Segundo curso sintético de catálogo', revisionId: 'ead-second-fixture-20261027-v2' };
  const secondKeys = { [second.revisionId]: keyring[revision.revisionId] };
  const snapshot = async () => (await db.query(`SELECT jsonb_build_object(
    'courses', (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM cursos c),
    'keys', (SELECT jsonb_agg(to_jsonb(k) ORDER BY course_id)
      FROM internal_academic.ead_assessment_answer_keys k),
    'progress', (SELECT jsonb_agg(to_jsonb(ep) ORDER BY aluno_id,curso_id)
      FROM ead_aluno_progresso ep),
    'certificates', (SELECT jsonb_agg(to_jsonb(ca) ORDER BY id) FROM certificados_academicos ca),
    'revisions', (SELECT jsonb_agg(to_jsonb(r) ORDER BY course_id,revision)
      FROM internal_academic.ead_course_revisions r),
    'packages', (SELECT jsonb_agg(to_jsonb(p) ORDER BY course_id,revision)
      FROM internal_academic.ead_revision_publication_packages p)
  ) state`)).rows[0].state;
  try {
    await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,120)',
      [secondId, second.courseName, 'EAD', configFor('second-old')]);
    baseline.push(...(await db.query(`SELECT id,nome,carga_horaria,ead_config,
      md5(ead_config::text) config_hash FROM cursos WHERE id=$1`, [secondId])).rows
      .map(row => ({ ...row, carga_horaria: Number(row.carga_horaria) })));
    await db.exec(generatePrivateStaging(revision, baseline, keyring));
    await db.exec(generatePrivateStaging(second, baseline, secondKeys));
    await db.query(`UPDATE internal_academic.ead_revision_publication_packages
      SET config=config-'contentRevision' WHERE course_id=$1`, [secondId]);
    // Sequences não fazem rollback: prova que o primeiro UPDATE ocorreu antes da falha.
    await db.exec(`CREATE SEQUENCE fixture_first_course_update;
      CREATE FUNCTION fixture_record_first_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id='${course}'::uuid THEN
          PERFORM nextval('fixture_first_course_update');
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER fixture_first_course_update AFTER UPDATE ON cursos
      FOR EACH ROW EXECUTE FUNCTION fixture_record_first_update();`);
    const before = await snapshot();
    assert.equal((await db.query('SELECT is_called FROM fixture_first_course_update')).rows[0].is_called, false);
    await assert.rejects(db.exec(generatePublication([revision, second], baseline)),
      /Pacote privado diverge do manifesto: Segundo curso sintético/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT is_called FROM fixture_first_course_update')).rows[0].is_called, true);
    assert.deepEqual(await snapshot(), before);
    const packages = (await db.query(`SELECT count(*)::int n
      FROM internal_academic.ead_revision_publication_packages`)).rows[0].n;
    assert.equal(packages, 2);
    // A correção do pacote permite repetir o lote completo, sem versão parcial anterior.
    await db.query(`UPDATE internal_academic.ead_revision_publication_packages
      SET config=jsonb_set(config,'{contentRevision}',to_jsonb(revision)) WHERE course_id=$1`, [secondId]);
    await db.exec(generatePublication([revision, second], baseline));
    assert.equal((await db.query(`SELECT count(*)::int n FROM cursos WHERE id=ANY($1::uuid[])
      AND ead_config->>'assessmentRevision' IS NOT NULL`, [[course, secondId]])).rows[0].n, 2);
  } finally { await db.close(); }
});
