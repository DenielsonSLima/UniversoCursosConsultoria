import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  database, applyRevisions, progress, upgrade, course, alumno,
} from '../../supabase/tests/ead_assessment_revision.harness.mjs';
import { releases, generatePublication, generatePrivateStaging } from './generate-publication.mjs';

// CI usa chaves sintéticas, sem afirmar que respondem aos problemas publicados.
// A conferência local autorizada pode fornecer o pacote real por arquivo privado.
const keyring = process.env.EAD_PRIVATE_ANSWERS
  ? JSON.parse(readFileSync(process.env.EAD_PRIVATE_ANSWERS, 'utf8'))
  : Object.fromEntries(releases.map(({ revision }) => [revision.revisionId, Object.fromEntries(
    [...revision.activities, ...revision.exam].map((item, index) => [item.id, {
      correctIndex: index % item.options.length,
      explanation: `Fixture técnica sintética ${item.id}; não é uma resolução pedagógica.`,
    }]),
  )]));

test('os pacotes reais publicam e corrigem a prova sem perder a versão anterior', async () => {
  const db = await database();
  try {
    await db.exec("UPDATE cursos SET carga_horaria=CASE nome WHEN 'Matemática Básica' THEN 80 ELSE 160 END");
    const baseline = (await db.query(`SELECT id,nome,carga_horaria,ead_config,
      md5(ead_config::text) AS config_hash FROM cursos ORDER BY nome`)).rows
      .map(row => ({ ...row, carga_horaria: Number(row.carga_horaria) }));
    await applyRevisions(db);
    for (const release of releases) {
      await db.exec(generatePrivateStaging(release, baseline, keyring));
      const publicSql = generatePublication(release, baseline);
      assert.equal(publicSql.includes('respostaCorreta'), false);
      assert.equal(publicSql.includes('explicacao'), false);
      await db.exec(publicSql);
    }
    const rows = (await db.query(`SELECT nome,ead_config FROM cursos ORDER BY nome`)).rows;
    assert.equal(rows[0].ead_config.provas[0].questoes.length, 15);
    assert.equal(rows[1].ead_config.provas[0].questoes.length, 12);
    assert.equal(JSON.stringify(rows).includes('respostaCorreta'), false);
    assert.equal(JSON.stringify(rows).includes('explicacao'), false);
    const historical = await progress(db);
    assert.equal(historical.assessmentRevision.current, 'legacy-20261027');
    assert.equal(historical.effectiveEadConfig.provas[0].questoes.length, 10);
    const fresh = await upgrade(db);
    assert.equal(fresh.summary.questionsTotal, 15);
    assert.equal(fresh.summary.allVideosDone, true);
    const revision = releases[0].revision;
    const update = async (action, itemId, payload = {}) => (await db.query(
      'SELECT ead_update_aluno_progress($1,$2,$3,$4,$5) AS result',
      [alumno, course, action, itemId, payload],
    )).rows[0].result;
    for (const lesson of revision.lessons) await update('toggle_content', lesson.id);
    for (const activity of revision.activities) {
      await update('set_activity_answer', activity.id, { answer: String(keyring[revision.revisionId][activity.id].correctIndex) });
      await update('complete_activity', activity.id);
    }
    assert.equal((await progress(db)).summary.canTakeQuiz, true);
    const completed = await update('finish_quiz', null, {
      answers: Object.fromEntries(revision.exam.map(item => [item.id, keyring[revision.revisionId][item.id].correctIndex])),
    });
    assert.equal(completed.summary.quizPassed, true);
    assert.equal(completed.assessmentFeedback.quiz.score, 100);
    assert.equal(Object.keys(completed.assessmentFeedback.quiz.results).length, 15);
    assert.equal(completed.assessmentFeedback.quiz.results[revision.exam[0].id].explanation,
      keyring[revision.revisionId][revision.exam[0].id].explanation);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM internal_academic.ead_progress_revision_archives')).rows[0].total, 1);
  } finally { await db.close(); }
});
