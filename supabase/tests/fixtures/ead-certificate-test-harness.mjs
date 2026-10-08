import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const alumno = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const course = '33333333-3333-4333-8333-333333333333';
const turma = '44444444-4444-4444-8444-444444444444';
const enrollment = '55555555-5555-4555-8555-555555555555';
const unit = '66666666-6666-4666-8666-666666666666';
const certId = '77777777-7777-4777-8777-777777777777';
const historical = [
  '20260715002000_secure_ead_progress_and_completion.sql',
  '20260822114100_lock_ead_completion_enrollment.sql',
  '20260822114300_serialize_ead_assessment_mutations.sql',
];
const migrations = [
  '20261008122500_auto_issue_ead_certificate.sql',
  '20261008122510_complete_ead_with_automatic_certificate.sql',
  '20261008122520_separate_ead_certificate_finalization.sql',
];
const answers = (correct = 10) => Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [`q${index}`, index < correct ? 0 : 1]),
);
const config = {
  conteudos: [{ id: 'lesson', titulo: 'Aula sintética' }], atividades: [],
  provas: [{ notaMinima: 70, questoes: Array.from({ length: 10 }, (_, index) => ({
    id: `q${index}`, opcoes: ['A', 'B'], respostaCorreta: 0,
  })) }],
};

const newDatabase = async ({
  modality = 'EAD', status = 'ATIVO', lessons = true,
  courseConfig = config, totalHours = 120, curriculum = true,
} = {}) => {
  const db = new PGlite();
  await db.exec(await read('./fixtures/ead-auto-certificate-schema.sql'));
  for (const name of historical) await db.exec(await read(`../migrations/${name}`));
  await db.exec(await read('./fixtures/ead-certificate-original-issuers.sql'));
  for (const name of migrations) await db.exec(await read(`../migrations/${name}`));
  if (curriculum) await applyCurriculumMigrations(db);
  await db.query("SELECT set_config('test.aluno_id', $1, false)", [alumno]);
  await db.query('INSERT INTO parceiros(id,nome,cpf_cnpj) VALUES ($1,$2,$3)',
    [alumno, 'Aluno sintético', '00000000000']);
  await db.query('INSERT INTO polos(id,nome) VALUES ($1,$2)', [unit, 'Polo de teste']);
  await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES ($1,$2,$3,$4,$5)',
    [course, 'Curso de teste', modality, JSON.stringify(courseConfig), totalHours]);
  await db.query('INSERT INTO turmas(id,curso_id,polo_id) VALUES ($1,$2,$3)', [turma, course, unit]);
  await db.query('INSERT INTO matriculas(id,aluno_id,turma_id,status) VALUES ($1,$2,$3,$4)',
    [enrollment, alumno, turma, status]);
  await db.query('INSERT INTO internal_academic.ead_assessment_answer_keys(course_id) VALUES ($1)', [course]);
  await db.query('INSERT INTO ead_aluno_progresso(aluno_id,curso_id,progress) VALUES ($1,$2,$3)',
    [alumno, course, JSON.stringify({
      completedContentIds: lessons ? (courseConfig.conteudos || []).map(item => item.id) : [], completedActivityIds: [],
      completedVideoIds: [], activityAnswers: {}, quizAnswers: {},
    })]);
  return db;
};

const submit = async (db, correct = 10, actor = alumno) => (await db.query(
  "SELECT ead_update_aluno_progress($1,$2,'finish_quiz',NULL,$3) AS result",
  [actor, course, JSON.stringify({ answers: answers(correct), quizScore: 100 })],
)).rows[0].result;
const state = async (db) => (await db.query(`SELECT jsonb_build_object(
  'certificates', (SELECT coalesce(jsonb_agg(to_jsonb(ca)),'[]') FROM certificados_academicos ca),
  'documents', (SELECT coalesce(jsonb_agg(to_jsonb(dv)),'[]') FROM documentos_validacao dv),
  'enrollment', (SELECT to_jsonb(m) FROM matriculas m WHERE id = $1),
  'progress', (SELECT progress FROM ead_aluno_progresso WHERE aluno_id = $2 AND curso_id = $3)
) AS result`, [enrollment, alumno, course])).rows[0].result;
const pending = async (db, { modality = 'EAD', status = 'PENDENTE' } = {}) => {
  await db.exec("UPDATE matriculas SET status='CONCLUIDO'");
  await db.query(`UPDATE ead_aluno_progresso SET progress = progress || $1::jsonb`,
    [JSON.stringify({ quizScore: 100, quizAnswers: answers(), completedAt: 1, lastQuizScoreAt: 1 })]);
  await db.query(`INSERT INTO certificados_academicos(
    id,matricula_id,aluno_id,turma_id,curso_id,polo_id,modalidade,status,nota_final,data_conclusao
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,100,'2026-10-01')`,
  [certId, enrollment, alumno, turma, course, unit, modality, status]);
};
const emit = (db) => db.query('SELECT internal_academic.ead_emitir_certificado_automatico($1)', [enrollment]);

const applyCurriculumMigrations = async (db) => {
  for (const name of [
    '20261008160000_build_ead_certificate_curriculum.sql',
    '20261008160010_snapshot_curriculum_on_ead_issue.sql',
    '20261008160020_complete_missing_ead_curriculum.sql',
  ]) await db.exec(await read(`../migrations/${name}`));
};

export { newDatabase, submit, state, pending, emit, applyCurriculumMigrations,
  alumno, other, course, turma, enrollment, unit, certId, config };
