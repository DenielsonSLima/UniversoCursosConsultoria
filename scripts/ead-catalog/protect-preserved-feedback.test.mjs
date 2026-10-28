import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  database, applyRevisions, configFor, alumno, unit, course as mathematicsCourse,
} from '../../supabase/tests/ead_assessment_revision.harness.mjs';
import { protectionScope, generatePreservedFeedbackProtection } from './protect-preserved-feedback.mjs';

const setup = async () => {
  const db = await database();
  await applyRevisions(db);
  for (const [i, target] of protectionScope.entries()) {
    const prefix = `private-preserved-${i}`;
    const config = configFor(prefix);
    config.atividades = Array.from({ length: 4 }, (_, n) => ({
      ...config.atividades[0], id: `${prefix}-activity-${n}`,
    }));
    const turma = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`;
    const enrollment = `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`;
    await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,$5)',
      [target.courseId, target.courseName, 'EAD', config, target.hours]);
    await db.query('INSERT INTO turmas(id,curso_id,polo_id) VALUES($1,$2,$3)', [turma, target.courseId, unit]);
    await db.query('INSERT INTO matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,$4)',
      [enrollment, alumno, turma, 'ATIVO']);
    const progress = {
      completedContentIds: [`${prefix}-lesson`],
      completedActivityIds: config.atividades.map(a => a.id),
      activityAnswers: Object.fromEntries(config.atividades.map(a => [a.id, '0'])),
      ...(i === 0 ? { quizAnswers: Object.fromEntries(config.provas[0].questoes.map(q => [q.id, '0'])),
        quizScore: 80, lastQuizScoreAt: 1, completedAt: 1 } : {}),
    };
    await db.query('INSERT INTO ead_aluno_progresso(aluno_id,curso_id,progress) VALUES($1,$2,$3)',
      [alumno, target.courseId, progress]);
    // O cofre real legado usa índices como strings JSON; conservar o tipo é parte do contrato.
    await db.query(`UPDATE internal_academic.ead_assessment_answer_keys SET
      activity_answers=(SELECT jsonb_object_agg(key,to_jsonb(value#>>'{}')) FROM jsonb_each(activity_answers)),
      quiz_answers=(SELECT jsonb_object_agg(key,to_jsonb(value#>>'{}')) FROM jsonb_each(quiz_answers))
      WHERE course_id=$1`, [target.courseId]);
    if (i === 0) await db.query(`INSERT INTO certificados_academicos(
      id,matricula_id,aluno_id,turma_id,curso_id,polo_id,modalidade,status,nota_final,data_conclusao
      ) VALUES($1,$2,$3,$4,$5,$6,'EAD','PENDENTE',80,'2026-10-01')`,
    ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', enrollment, alumno, turma, target.courseId, unit]);
  }
  const patches = [];
  for (const target of protectionScope) {
    const { hash } = (await db.query('SELECT md5(ead_config::text) hash FROM cursos WHERE id=$1',
      [target.courseId])).rows[0];
    patches.push({ ...target, expectedConfigHash: hash });
  }
  return { db, patches };
};
const snapshot = async db => (await db.query(`SELECT jsonb_build_object(
  'courses',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM cursos c),
  'keys',(SELECT jsonb_agg(jsonb_build_object('course',course_id,'activities',activity_answers,'quiz',quiz_answers)
    ORDER BY course_id) FROM internal_academic.ead_assessment_answer_keys),
  'progress',(SELECT jsonb_agg(to_jsonb(ep) ORDER BY ep.aluno_id,ep.curso_id) FROM ead_aluno_progresso ep),
  'certificates',(SELECT jsonb_agg(to_jsonb(ca) ORDER BY ca.id) FROM certificados_academicos ca),
  'revisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.course_id,r.revision) FROM internal_academic.ead_course_revisions r)
) result`)).rows[0].result;
const getProgress = async (db, id) => (await db.query(
  'SELECT ead_get_aluno_progress($1,$2) result', [alumno, id],
)).rows[0].result;

// Todos os textos e respostas destas fixtures são artificiais.
test('reserva resoluções sem mudar contrato, notas antigas, certificados ou tipos do cofre', async () => {
  const { db, patches } = await setup();
  try {
    const before = await snapshot(db);
    const untouched = before.courses.find(c => c.id === mathematicsCourse);
    const sql = generatePreservedFeedbackProtection(patches);
    assert.equal(sql.includes('Resolução privada'), false);
    assert.equal(sql.includes(protectionScope[0].courseId), false);
    await db.exec(sql);
    const after = await snapshot(db);
    assert.deepEqual(after.progress, before.progress);
    assert.deepEqual(after.certificates, before.certificates);
    assert.deepEqual(after.keys, before.keys);
    assert.equal(typeof after.keys.find(k => k.course === patches[0].courseId).quiz['private-preserved-0-q0'], 'string');
    assert.deepEqual(after.courses.find(c => c.id === mathematicsCourse), untouched);
    for (const target of patches) {
      const old = before.courses.find(c => c.id === target.courseId).ead_config;
      const current = after.courses.find(c => c.id === target.courseId).ead_config;
      const restored = JSON.parse(JSON.stringify(current));
      delete restored.assessmentRevision;
      old.atividades.forEach((a, i) => { restored.atividades[i].explicacao = a.explicacao; });
      old.provas[0].questoes.forEach((q, i) => { restored.provas[0].questoes[i].explicacao = q.explicacao; });
      assert.deepEqual(restored, old);
      assert.equal(/explicacao|respostaCorreta/.test(JSON.stringify(current)), false);
      const result = await getProgress(db, target.courseId);
      assert.equal(result.assessmentRevision.current, 'legacy-20261027');
      assert.equal(result.assessmentRevision.available, 'legacy-20261027');
      assert.equal(result.assessmentRevision.canUpgrade, false);
      assert.equal(result.assessmentRevision.isHistorical, false);
      assert.equal(/explicacao|respostaCorreta/.test(JSON.stringify(result.effectiveEadConfig)), false);
    }
    const historical = await getProgress(db, patches[0].courseId);
    assert.equal(historical.progress.quizScore, 80);
    assert.equal(historical.assessmentFeedback.quiz.score, 80);
    assert.ok(historical.assessmentFeedback.quiz.results['private-preserved-0-q0'].explanation);
    const repeated = await getProgress(db, patches[0].courseId);
    assert.equal(repeated.progress.quizScore, historical.progress.quizScore);
    assert.equal(repeated.progress.completedAt, historical.progress.completedAt);
    assert.deepEqual((await snapshot(db)).certificates, before.certificates);
    const protectedSnapshot = after.revisions.find(r => r.course_id === patches[0].courseId);
    const originalKeys = before.keys.find(k => k.course === patches[0].courseId);
    assert.deepEqual(protectedSnapshot.activity_answers, originalKeys.activities);
    assert.deepEqual(protectedSnapshot.quiz_answers, originalKeys.quiz);
    const unsubmitted = await getProgress(db, patches[1].courseId);
    assert.equal(unsubmitted.assessmentFeedback.quiz.submitted, false);
    assert.deepEqual(unsubmitted.assessmentFeedback.quiz.results, {});
    const answers = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`private-preserved-1-q${i}`, '0']));
    const submitted = (await db.query("SELECT ead_update_aluno_progress($1,$2,'finish_quiz',NULL,$3) result",
      [alumno, patches[1].courseId, { answers }])).rows[0].result;
    assert.equal(submitted.assessmentFeedback.quiz.score, 100);
    assert.ok(submitted.assessmentFeedback.quiz.results['private-preserved-1-q0'].explanation);
    assert.equal(submitted.summary.quizPassed, true);
    const reloaded = await getProgress(db, patches[1].courseId);
    assert.equal(reloaded.assessmentFeedback.quiz.score, 100);
    assert.equal(Object.values(reloaded.assessmentFeedback.quiz.results).filter(r => r.explanation).length, 10);
    await assert.rejects(db.exec(sql), /mudou|proteção/);
    await db.exec('ROLLBACK');
  } finally { await db.close(); }
});

test('hash divergente no segundo curso reverte também o registro do primeiro', async () => {
  const { db, patches } = await setup();
  try {
    const before = await snapshot(db);
    patches[1].expectedConfigHash = '00000000000000000000000000000000';
    await assert.rejects(db.exec(generatePreservedFeedbackProtection(patches)), /mudou/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});

test('recusa curso fora do manifesto fixo e hash ausente', () => {
  assert.throws(() => generatePreservedFeedbackProtection([]), /dois/);
  assert.throws(() => generatePreservedFeedbackProtection([
    { ...protectionScope[0], courseId: '99999999-9999-4999-8999-999999999999' }, protectionScope[1],
  ]), /Identidade/);
  assert.throws(() => generatePreservedFeedbackProtection([
    { ...protectionScope[0], expectedConfigHash: null }, protectionScope[1],
  ]), /Identidade/);
});
