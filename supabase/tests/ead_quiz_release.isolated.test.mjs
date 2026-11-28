import assert from 'node:assert/strict';
import test from 'node:test';
import { configFor, publishRevision, upgrade } from './ead_assessment_revision.harness.mjs';
import {
  alumno, course, enrollment, grant, id, newTrustCertificateDatabase, other,
  progress, scalar, source, state, submit, turma, unit,
} from './ead_trust_certificate.fixture.mjs';

const migrations = [
  '20261128130000_ead_study_periods.sql',
  '20261128130010_ead_quiz_release_guard.sql',
  '20261128130015_protect_ead_quiz_questions.sql',
];
const apply = async (db) => {
  for (const name of migrations) await db.exec(await source(name));
};
const activeDatabase = async ({ applyPolicy = true } = {}) => {
  const db = await newTrustCertificateDatabase();
  await db.query("UPDATE public.matriculas SET status='ATIVO' WHERE id=$1", [enrollment]);
  if (applyPolicy) await apply(db);
  return db;
};
const start = (db, actor = alumno, courseId = course) => scalar(db,
  'SELECT public.ead_start_study($1, $2) AS value', [actor, courseId]);
const studyRows = (db) => scalar(db, 'SELECT count(*)::integer AS value FROM internal_academic.ead_study_periods');
const waitError = (error) => error.code === 'PT409' && error.message.includes('7 dias completos');

test('a leitura comum não inicia o estudo nem entrega questões antes da carência', async () => {
  const db = await activeDatabase();
  try {
    const data = await progress(db);
    assert.equal(data.summary.quizWaiting, true);
    assert.equal(data.summary.quizAvailableAt, null);
    assert.equal(data.summary.canTakeQuiz, false);
    assert.equal(data.summary.questionsTotal, 10);
    assert.equal(data.effectiveEadConfig.provas[0].questoes, undefined);
    assert.equal(await studyRows(db), 0);
    await assert.rejects(submit(db), waitError);
    assert.equal((await state(db)).certificates.length, 0);
    await assert.rejects(start(db, other), (error) => error.code === '42501');
    assert.equal(await studyRows(db), 0);
    const permissions = await scalar(db, `SELECT jsonb_build_array(
      has_function_privilege('anon', 'public.ead_start_study(uuid,uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.ead_start_study(uuid,uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'internal_academic.ead_record_study_start(uuid)', 'EXECUTE'),
      has_table_privilege('authenticated', 'internal_academic.ead_quiz_early_releases', 'INSERT')
    ) AS value`);
    assert.deepEqual(permissions, [false, true, false, false]);
  } finally { await db.close(); }
});

test('entrada explícita é idempotente e a prova abre diretamente após 168 horas', async () => {
  const db = await activeDatabase();
  try {
    const first = await start(db);
    const repeated = await start(db);
    assert.equal(typeof first.summary.studyStartedAt, 'number');
    assert.equal(repeated.summary.studyStartedAt, first.summary.studyStartedAt);
    assert.equal(repeated.summary.quizAvailableAt - repeated.summary.studyStartedAt, 168 * 3_600_000);
    assert.equal(await studyRows(db), 1);
    await db.query(`UPDATE internal_academic.ead_study_periods
      SET started_at=statement_timestamp()-interval '168 hours'+interval '1 minute'
      WHERE matricula_id=$1`, [enrollment]);
    await assert.rejects(submit(db), waitError);
    await db.query(`UPDATE internal_academic.ead_study_periods
      SET started_at=statement_timestamp()-interval '168 hours' WHERE matricula_id=$1`, [enrollment]);
    const ready = await progress(db);
    assert.equal(ready.summary.quizWaiting, false);
    assert.equal(ready.summary.canTakeQuiz, true);
    assert.equal(ready.effectiveEadConfig.provas[0].questoes.length, 10);
    assert.equal(ready.effectiveEadConfig.provas[0].questoes[0].respostaCorreta, undefined);
    assert.equal((await submit(db)).summary.quizPassed, true);
    assert.equal((await state(db)).certificates.length, 1);
  } finally { await db.close(); }
});

test('exceção antecipa a carência da própria matrícula e mantém pré-requisitos', async () => {
  const db = await activeDatabase();
  try {
    await db.query(`UPDATE public.ead_aluno_progresso SET progress=progress || '{"completedContentIds":[]}' WHERE aluno_id=$1`, [alumno]);
    await start(db);
    await db.query(`INSERT INTO internal_academic.ead_quiz_early_releases VALUES ($1, now(), $2, 'Exceção sintética')`, [enrollment, other]);
    const released = await progress(db);
    assert.equal(released.summary.quizWaiting, false);
    assert.equal(released.summary.canTakeQuiz, false);
    await assert.rejects(submit(db), (error) => error.code === '23514' && error.message.includes('Conclua aulas'));
    await assert.rejects(scalar(db, "SELECT public.ead_update_aluno_progress($1,$2,'toggle_content','inexistente') value", [alumno, course]), (e) => e.code === '23514');
    const learned = await scalar(db, "SELECT public.ead_update_aluno_progress($1,$2,'toggle_content','old-lesson') value", [alumno, course]);
    assert.equal(learned.summary.canTakeQuiz, true);

    await db.query("UPDATE public.matriculas SET status='CANCELADO' WHERE id=$1", [enrollment]);
    await db.query("INSERT INTO public.matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,'ATIVO')", [id(81), alumno, turma]);
    const next = await progress(db);
    assert.equal(next.summary.studyStartedAt, null);
    assert.equal(next.summary.quizWaiting, true);
    await assert.rejects(submit(db), waitError);
  } finally { await db.close(); }
});

test('curso sem revisão mascara questões e uma mutação pedagógica válida inicia estudo', async () => {
  const db = await activeDatabase();
  try {
    const regularCourse = id(84);
    const regularTurma = id(85);
    await db.query("INSERT INTO public.cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,'Curso sintético sem revisão','EAD',$2,40)", [regularCourse, configFor('regular')]);
    await db.query('INSERT INTO public.turmas(id,curso_id,polo_id) VALUES($1,$2,$3)', [regularTurma, regularCourse, unit]);
    await db.query("INSERT INTO public.matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,'ATIVO')", [id(86), alumno, regularTurma]);
    const before = await progress(db, alumno, regularCourse);
    assert.equal(before.assessmentRevision, undefined);
    assert.equal(before.effectiveEadConfig.provas[0].questoes, undefined);
    await assert.rejects(scalar(db, "SELECT public.ead_update_aluno_progress($1,$2,'toggle_content','inexistente') value", [alumno, regularCourse]), (error) => error.code === '23514');
    assert.equal(await studyRows(db), 0);
    const after = await scalar(db, "SELECT public.ead_update_aluno_progress($1,$2,'toggle_content','regular-lesson') value", [alumno, regularCourse]);
    assert.equal(typeof after.summary.studyStartedAt, 'number');
    assert.equal(after.summary.quizWaiting, true);
    assert.equal(await studyRows(db), 1);
  } finally { await db.close(); }
});

test('acesso por confiança continua sujeito às regras financeiras da prova', async () => {
  const db = await newTrustCertificateDatabase({ activate: false });
  try {
    await apply(db);
    await assert.rejects(start(db), (error) => error.code === '23514');
    await grant(db);
    assert.equal((await start(db)).summary.temporaryAccess, true);
    await db.query(`INSERT INTO internal_academic.ead_quiz_early_releases VALUES ($1, now(), $2, 'Exceção sintética')`, [enrollment, other]);
    assert.equal((await progress(db)).summary.canTakeQuiz, false);
    await assert.rejects(submit(db), (error) => error.code === '23514' && error.message.includes('pagamento'));
    assert.equal((await state(db)).certificates.length, 0);
  } finally { await db.close(); }
});

test('aprovação anterior à política permanece acessível sem criar início retroativo', async () => {
  const db = await activeDatabase({ applyPolicy: false });
  try {
    const issued = await submit(db);
    assert.equal(issued.summary.quizPassed, true);
    await apply(db);
    const opened = await start(db);
    assert.equal(opened.summary.quizWaiting, false);
    assert.equal(opened.summary.studyStartedAt, null);
    assert.equal(opened.summary.certificateId, issued.summary.certificateId);
    assert.equal(opened.effectiveEadConfig.provas[0].questoes.length, 10);
    assert.equal((await submit(db)).summary.certificateId, issued.summary.certificateId);
    assert.equal(await studyRows(db), 0);
    assert.equal((await state(db)).certificates.length, 1);
  } finally { await db.close(); }
});

test('início exige a sessão do aluno e as entradas antigas não permitem concluir ou emitir antes da prova', async () => {
  const db = await activeDatabase();
  try {
    await db.exec("SET test.actor=''; SET ROLE authenticated");
    await assert.rejects(start(db), (error) => error.code === '42501');
    await assert.rejects(scalar(db, `SELECT public.ead_update_aluno_progress_core_20260822(
      $1, $2, 'finish_quiz', NULL, '{}'::jsonb) AS value`, [alumno, course]), (error) => error.code === '42501');
    await assert.rejects(scalar(db, `SELECT internal_academic.ead_emitir_certificado_automatico($1) AS value`,
      [enrollment]), (error) => error.code === '42501');
    await db.exec('RESET ROLE');
    assert.equal(await studyRows(db), 0);

    // Mesmo com a fila acessível a um gestor, a emissão lê o estado acadêmico real.
    const queued = id(87);
    await db.query(`INSERT INTO public.certificados_academicos
      (id, matricula_id, aluno_id, turma_id, curso_id, polo_id, modalidade, status, data_conclusao)
      VALUES ($1, $2, $3, $4, $5, $6, 'EAD', 'PENDENTE', CURRENT_DATE)`,
      [queued, enrollment, alumno, turma, course, unit]);
    await assert.rejects(scalar(db, 'SELECT public.finalizar_certificado_academico($1) AS value', [queued]),
      (error) => error.code === '23514' && error.message.includes('matrícula EAD concluída'));
    await db.query("UPDATE public.matriculas SET status='CONCLUIDO' WHERE id=$1", [enrollment]);
    await assert.rejects(scalar(db, 'SELECT public.finalizar_certificado_academico($1) AS value', [queued]),
      (error) => error.code === '23514' && error.message.includes('não atende aos critérios'));
    assert.equal((await state(db)).documents.length, 0);
  } finally { await db.close(); }
});

test('trocar a revisão durante a carência retorna questões mascaradas sem reiniciar a data', async () => {
  const db = await activeDatabase();
  try {
    const first = await start(db);
    await publishRevision(db);
    const changed = await upgrade(db);
    assert.equal(changed.assessmentRevision.isHistorical, false);
    assert.equal(changed.summary.quizWaiting, true);
    assert.equal(changed.summary.studyStartedAt, first.summary.studyStartedAt);
    assert.equal(changed.summary.quizAvailableAt, first.summary.quizAvailableAt);
    assert.equal(changed.effectiveEadConfig.provas[0].questoes, undefined);
    assert.equal(await studyRows(db), 1);
  } finally { await db.close(); }
});

test('migrar o catálogo remove enunciados da API pública e preserva revisões e gabaritos', async () => {
  const db = await activeDatabase({ applyPolicy: false });
  try {
    const snapshots = (db) => scalar(db, `SELECT jsonb_agg(to_jsonb(r) ORDER BY r.course_id,r.revision) AS value
      FROM internal_academic.ead_course_revisions r`);
    const originalRevisions = await snapshots(db);
    const originalAnswers = await scalar(db, 'SELECT quiz_answers AS value FROM internal_academic.ead_assessment_answer_keys WHERE course_id=$1', [course]);
    assert.equal(await scalar(db, "SELECT ead_config #>> '{provas,0,questoes,0,pergunta}' AS value FROM public.cursos WHERE id=$1", [course]), 'Problema old 0');
    await apply(db);
    assert.deepEqual(await snapshots(db), originalRevisions);
    assert.deepEqual(await scalar(db, 'SELECT quiz_answers AS value FROM internal_academic.ead_assessment_answer_keys WHERE course_id=$1', [course]), originalAnswers);
    await db.exec('GRANT SELECT ON public.cursos TO anon; SET ROLE anon');
    const rawCatalog = await scalar(db, 'SELECT ead_config AS value FROM public.cursos WHERE id=$1', [course]);
    assert.equal(rawCatalog.provas[0].notaMinima, 70);
    assert.equal(rawCatalog.provas[0].questoes, undefined);
    await assert.rejects(scalar(db, 'SELECT quiz_provas AS value FROM internal_academic.ead_assessment_answer_keys WHERE course_id=$1', [course]), (error) => error.code === '42501');
    await db.exec('RESET ROLE');
    await start(db);
    await db.query(`UPDATE internal_academic.ead_study_periods
      SET started_at=statement_timestamp()-interval '168 hours' WHERE matricula_id=$1`, [enrollment]);
    const ready = await progress(db);
    assert.equal(ready.effectiveEadConfig.provas[0].questoes[0].pergunta, 'Problema old 0');
    assert.equal(ready.effectiveEadConfig.provas[0].questoes[0].respostaCorreta, undefined);
  } finally { await db.close(); }
});

test('editor autorizado, criação e publicação de revisão mantêm enunciados privados e funcionais', async () => {
  const db = await activeDatabase();
  try {
    // A fixture controla apenas a decisão de identidade do Gestor. A RPC e os
    // gatilhos de gestão/edição abaixo são as implementações reais do produto.
    await db.exec(`CREATE FUNCTION public.gestor_can_manage_curso_modalidade(text) RETURNS boolean
      LANGUAGE sql AS $$ SELECT $1 = 'EAD' AND current_setting('test.gestor', true) = 'true' $$`);
    const management = (courseId) => scalar(db, `SELECT ead_config AS value
      FROM public.get_ead_course_configs_for_management(ARRAY[$1::uuid])`, [courseId]);
    const catalog = (courseId) => scalar(db, 'SELECT ead_config AS value FROM public.cursos WHERE id=$1', [courseId]);
    const current = await management(course);
    assert.equal(current.provas[0].questoes[0].pergunta, 'Problema old 0');
    assert.equal(current.provas[0].questoes[0].respostaCorreta, 0);

    await db.query(`UPDATE public.cursos SET ead_config=jsonb_set(
      ead_config || '{"assessmentRevision":"legacy-20261027"}'::jsonb,
      '{pagina,subtitulo}', '"Apresentação revisada"') WHERE id=$1`, [course]);
    assert.equal((await management(course)).pagina.subtitulo, 'Apresentação revisada');
    const editedPresentation = await management(course);
    assert.deepEqual(editedPresentation.provas[0].questoes,
      current.provas[0].questoes.map(({ explicacao, ...question }) => question));
    assert.equal(await scalar(db, `SELECT config #>> '{provas,0,questoes,0,explicacao}' AS value
      FROM internal_academic.ead_course_revisions WHERE course_id=$1 AND revision='legacy-20261027'`, [course]),
    'Resolução privada old 0: alternativa 0.');
    assert.equal((await catalog(course)).provas[0].questoes, undefined);
    await publishRevision(db);
    assert.equal((await management(course)).provas[0].questoes[0].pergunta, 'Problema new 0');
    assert.equal((await catalog(course)).provas[0].questoes, undefined);

    const newCourse = id(88);
    const initial = configFor('created');
    await db.query("INSERT INTO public.cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,'Novo curso sintético','EAD',$2,40)", [newCourse, initial]);
    assert.equal((await catalog(newCourse)).provas[0].questoes, undefined);
    assert.equal((await management(newCourse)).provas[0].questoes[0].pergunta, 'Problema created 0');
    const updated = configFor('edited', 1);
    await db.query('UPDATE public.cursos SET ead_config=$2 WHERE id=$1', [newCourse, updated]);
    assert.equal((await catalog(newCourse)).provas[0].questoes, undefined);
    assert.equal((await management(newCourse)).provas[0].questoes[0].respostaCorreta, 1);

    const newTurma = id(89);
    const newEnrollment = id(90);
    await db.query('INSERT INTO public.turmas(id,curso_id,polo_id) VALUES($1,$2,$3)', [newTurma, newCourse, unit]);
    await db.query("INSERT INTO public.matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,'ATIVO')", [newEnrollment, alumno, newTurma]);
    await start(db, alumno, newCourse);
    await db.query(`UPDATE internal_academic.ead_study_periods
      SET started_at=statement_timestamp()-interval '168 hours' WHERE matricula_id=$1`, [newEnrollment]);
    assert.equal((await progress(db, alumno, newCourse)).effectiveEadConfig.provas[0].questoes, undefined);
    await db.query(`UPDATE public.ead_aluno_progresso SET progress=progress || $2 WHERE curso_id=$1`, [newCourse, {
      completedContentIds: ['edited-lesson'], completedActivityIds: ['edited-activity'],
    }]);
    const ready = await progress(db, alumno, newCourse);
    assert.equal(ready.summary.canTakeQuiz, true);
    assert.equal(ready.effectiveEadConfig.provas[0].questoes[0].pergunta, 'Problema edited 0');
    assert.equal(ready.effectiveEadConfig.provas[0].questoes[0].respostaCorreta, undefined);

    await db.exec("SET test.gestor='false'; SET ROLE authenticated");
    await assert.rejects(management(course), (error) => error.code === '42501');
  } finally { await db.close(); }
});
