import { readFile } from 'node:fs/promises';
import {
  newDatabase, alumno, other, course, turma, enrollment, unit, pending,
} from './fixtures/ead-certificate-test-harness.mjs';

export { alumno, other, course, turma, enrollment, unit, pending };
export const revision = 'matematica-20261027-v2';
export const legacy = 'legacy-20261027';
export const secondCourse = '88888888-8888-4888-8888-888888888888';
const readMigration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
export const configFor = (prefix = 'old', correct = 0) => ({
  regras: { exigirAtividades: true, exigirVideosConcluidos: false },
  pagina: { subtitulo: 'Apresentação' },
  conteudos: [{ id: `${prefix}-lesson`, titulo: `Aula ${prefix}`, duracao: '120h' }],
  cronograma: [{ id: `${prefix}-module`, titulo: `Componente ${prefix}`, cargaHoraria: 120,
    ordem: 1, conteudos: [`${prefix}-lesson`] }],
  atividades: [{ id: `${prefix}-activity`, titulo: `Atividade ${prefix}`, tipo: 'multipla_escolha',
    enunciado: `Questão ${prefix}`, aulaId: `${prefix}-lesson`, opcoes: ['A', 'B'], respostaCorreta: correct,
    explicacao: `Resolução privada ${prefix}: alternativa ${correct}.` }],
  provas: [{ id: `${prefix}-exam`, notaMinima: 70, questoes: Array.from({ length: 10 }, (_, i) => ({
    id: `${prefix}-q${i}`, pergunta: `Problema ${prefix} ${i}`, opcoes: ['A', 'B'], respostaCorreta: correct,
    explicacao: `Resolução privada ${prefix} ${i}: alternativa ${correct}.`,
  })) }],
});

export const answersFor = (prefix = 'old', correct = 10, index = 0) => Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`${prefix}-q${i}`, i < correct ? index : 1 - index]),
);
export const migrationNames = [
  '20261027223000_create_math_ead_revision_registry.sql',
  '20261027223010_resolve_ead_progress_revision.sql',
  '20261027223020_correct_ead_progress_by_revision.sql',
  '20261027223030_validate_ead_mutations_by_revision.sql',
  '20261027223040_start_ead_assessment_revision.sql',
  '20261027223050_preserve_ead_certificate_revision.sql',
  '20261027223060_protect_math_ead_revision_explanations.sql',
  '20261027223070_create_private_math_publication_packages.sql',
];

export const database = async () => {
  const db = await newDatabase({ courseConfig: configFor() });
  // Usa as funções reais do cofre e feedback, além dos emissores já carregados.
  await db.exec(`DROP FUNCTION internal_academic.ead_restore_assessment_answers(jsonb,jsonb,jsonb);
    DROP FUNCTION internal_academic.ead_collect_assessment_answer_keys(jsonb,jsonb,jsonb);
    DROP TABLE internal_academic.ead_assessment_answer_keys;`);
  await db.exec(await readMigration('20260822114000_create_private_ead_answer_keys.sql'));
  await db.exec(await readMigration('20260822114200_add_authoritative_ead_assessment_feedback.sql'));
  await db.exec(await readMigration('20260822114400_sanitize_public_ead_configs.sql'));
  await db.query("UPDATE cursos SET nome='Matemática Básica' WHERE id=$1", [course]);
  await db.query('INSERT INTO cursos(id,nome,modalidade,ead_config,carga_horaria) VALUES($1,$2,$3,$4,120)',
    [secondCourse, 'Matemática para Enem', 'EAD', configFor('enem')]);
  await db.query(`UPDATE ead_aluno_progresso SET progress=progress || $1::jsonb WHERE aluno_id=$2`,
    [{ completedActivityIds: ['old-activity'], activityAnswers: { 'old-activity': '0' } }, alumno]);
  return db;
};
export const applyRevisions = async db => {
  for (const name of migrationNames) await db.exec(await readMigration(name));
};
export const publishRevision = (db, input = configFor('new', 1)) => db.query(
  'UPDATE cursos SET ead_config=$1 WHERE id=$2',
  [{ ...input, assessmentRevision: revision }, course],
);
export const progress = async (db, actor = alumno, selected = course) => (await db.query(
  'SELECT public.ead_get_aluno_progress($1,$2) AS result', [actor, selected],
)).rows[0].result;
export const submit = async (db, prefix = 'old', correct = 10, index = 0) => (await db.query(
  "SELECT public.ead_update_aluno_progress($1,$2,'finish_quiz',NULL,$3) AS result",
  [alumno, course, { answers: answersFor(prefix, correct, index) }],
)).rows[0].result;
export const upgrade = async (db, actor = alumno, expected = revision) => (await db.query(
  'SELECT public.ead_start_assessment_revision($1,$2,$3) AS result', [actor, course, expected],
)).rows[0].result;
export const state = async db => (await db.query(`SELECT jsonb_build_object(
  'progress', (SELECT to_jsonb(ep) FROM ead_aluno_progresso ep WHERE aluno_id=$1 AND curso_id=$2),
  'archives', (SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM internal_academic.ead_progress_revision_archives a),
  'certificates', (SELECT coalesce(jsonb_agg(to_jsonb(ca)),'[]') FROM certificados_academicos ca),
  'documents', (SELECT coalesce(jsonb_agg(to_jsonb(dv)),'[]') FROM documentos_validacao dv),
  'enrollment', (SELECT to_jsonb(m) FROM matriculas m WHERE id=$3)
) AS result`, [alumno, course, enrollment])).rows[0].result;
