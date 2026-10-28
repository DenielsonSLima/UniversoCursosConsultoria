import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  database, applyRevisions, configFor, alumno, unit,
} from '../../supabase/tests/ead_assessment_revision.harness.mjs';
import { loadRevisions } from './load-revisions.mjs';
import { generatePrivateStaging, generatePublication } from './publication-sql.mjs';

const releases = await loadRevisions();
const keyring = process.env.EAD_CATALOG_PRIVATE_ANSWERS
  ? JSON.parse(readFileSync(process.env.EAD_CATALOG_PRIVATE_ANSWERS, 'utf8'))
  : Object.fromEntries(releases.map(({ revision }) => [revision.revisionId, Object.fromEntries(
    [...revision.activities, ...revision.exam].map((item, i) => [item.id, {
      correctIndex: i % item.options.length,
      explanation: `Chave técnica sintética ${item.id}, sem afirmar uma resolução pedagógica.`,
    }]),
  )]));
const uuid = value => {
  const hex = createHash('md5').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

test('todos os pacotes autorais percorrem publicação, troca explícita, atividades e prova nas RPCs reais isoladas', async () => {
  assert.ok(releases.length > 0);
  const db = await database();
  try {
    await applyRevisions(db);
    const baseline = [];
    for (const [i, { revision }] of releases.entries()) {
      const old = configFor(`old-catalog-${i}`);
      old.conteudos[0].duracao = `${revision.hours}h`;
      old.cronograma[0].cargaHoraria = revision.hours;
      await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,$5)',
        [revision.courseId, revision.courseName, 'EAD', old, revision.hours]);
      const turma = uuid(`class:${revision.courseId}`);
      await db.query('INSERT INTO turmas(id,curso_id,polo_id) VALUES($1,$2,$3)', [turma, revision.courseId, unit]);
      await db.query('INSERT INTO matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,$4)',
        [uuid(`enrollment:${revision.courseId}`), alumno, turma, 'ATIVO']);
      await db.query('INSERT INTO ead_aluno_progresso(aluno_id,curso_id,progress) VALUES($1,$2,$3)',
        [alumno, revision.courseId, { completedContentIds: [old.conteudos[0].id], quizAnswers: {} }]);
      const row = (await db.query(`SELECT id,nome,carga_horaria,ead_config,md5(ead_config::text) config_hash
        FROM cursos WHERE id=$1`, [revision.courseId])).rows[0];
      baseline.push({ ...row, carga_horaria: Number(row.carga_horaria) });
      await db.exec(generatePrivateStaging(revision, baseline, keyring));
    }
    for (let i = 0; i < releases.length; i += 5) {
      await db.exec(generatePublication(releases.slice(i, i + 5).map(item => item.revision), baseline));
    }
    for (const { revision } of releases) {
      const get = async () => (await db.query('SELECT ead_get_aluno_progress($1,$2) result',
        [alumno, revision.courseId])).rows[0].result;
      const historical = await get();
      assert.equal(historical.assessmentRevision.current, 'legacy-20261027', revision.courseName);
      assert.equal(historical.assessmentRevision.available, revision.revisionId);
      assert.equal(historical.effectiveEadConfig.provas[0].questoes.length, 10);
      const fresh = (await db.query('SELECT ead_start_assessment_revision($1,$2,$3) result',
        [alumno, revision.courseId, revision.revisionId])).rows[0].result;
      assert.equal(fresh.summary.questionsTotal, revision.exam.length);
      assert.equal(fresh.summary.allVideosDone, true);
      assert.equal(JSON.stringify(fresh.effectiveEadConfig).includes('"explicacao":'), false);
      const update = async (action, id, payload = {}) => (await db.query(
        'SELECT ead_update_aluno_progress($1,$2,$3,$4,$5) result',
        [alumno, revision.courseId, action, id, payload],
      )).rows[0].result;
      for (const lesson of revision.lessons) await update('toggle_content', lesson.id);
      for (const activity of revision.activities) {
        await update('set_activity_answer', activity.id,
          { answer: String(keyring[revision.revisionId][activity.id].correctIndex) });
        await update('complete_activity', activity.id);
      }
      assert.equal((await get()).summary.canTakeQuiz, true, revision.courseName);
      const completed = await update('finish_quiz', null, { answers: Object.fromEntries(
        revision.exam.map(item => [item.id, keyring[revision.revisionId][item.id].correctIndex]),
      ) });
      assert.equal(completed.summary.quizPassed, true, revision.courseName);
      assert.equal(completed.assessmentFeedback.quiz.score, 100);
      assert.equal(Object.keys(completed.assessmentFeedback.quiz.results).length, revision.exam.length);
      assert.equal(completed.assessmentFeedback.quiz.results[revision.exam[0].id].explanation,
        keyring[revision.revisionId][revision.exam[0].id].explanation);
      const catalog = (await db.query('SELECT ead_config FROM cursos WHERE id=$1', [revision.courseId])).rows[0].ead_config;
      assert.equal(JSON.stringify(catalog).includes('"respostaCorreta":'), false);
      assert.equal(JSON.stringify(catalog).includes('"explicacao":'), false);
    }
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.ead_progress_revision_archives')).rows[0].n,
      releases.length);
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.ead_revision_publication_packages')).rows[0].n, 0);
  } finally { await db.close(); }
});
