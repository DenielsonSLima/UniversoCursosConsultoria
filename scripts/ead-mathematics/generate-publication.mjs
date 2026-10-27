import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import basic from '../../content/ead/matematica-basica/index.mjs';
import enem from '../../content/ead/matematica-enem/index.mjs';
import { buildCourseConfig, MATHEMATICS_REVISION, withPrivateAnswers } from './revision-model.mjs';

export const releases = [
  { revision: basic, file: 'supabase/migrations/20261027223100_publish_math_basic_revision.sql' },
  { revision: enem, file: 'supabase/migrations/20261027223110_publish_math_enem_revision.sql' },
];
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const beforeFor = (release, baseline) => {
  const before = baseline.find(course => course.nome === release.revision.courseName);
  if (!before || before.carga_horaria !== release.revision.hours || !/^[a-f0-9]{32}$/.test(before.config_hash)) {
    throw new Error('Snapshot de publicação ausente ou incompatível.');
  }
  return before;
};

export function generatePublication(release, baseline) {
  const before = beforeFor(release, baseline);
  return `-- GERADO a partir das questões públicas; nenhum gabarito integra este arquivo.
-- O pacote completo revisado é reservado no banco privado por MCP antes da aplicação.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $publish$
DECLARE
  v_course public.cursos;
  v_package internal_academic.ead_revision_publication_packages;
BEGIN
  SELECT * INTO STRICT v_course FROM public.cursos
  WHERE modalidade = 'EAD' AND nome = ${literal(before.nome)}
    AND carga_horaria = ${release.revision.hours} FOR UPDATE;
  IF md5(v_course.ead_config::text) <> ${literal(before.config_hash)} THEN
    RAISE EXCEPTION 'Conteúdo mudou desde a revisão; não publicar sobre alteração concorrente.';
  END IF;
  SELECT * INTO STRICT v_package FROM internal_academic.ead_revision_publication_packages
  WHERE course_id = v_course.id AND revision = ${literal(MATHEMATICS_REVISION)} FOR UPDATE;
  IF v_package.expected_config_hash <> ${literal(before.config_hash)}
    OR v_package.config ->> 'contentRevision' <> ${literal(release.revision.revisionId)}
    OR jsonb_array_length(v_package.config -> 'conteudos') <> ${release.revision.lessons.length}
    OR jsonb_array_length(v_package.config -> 'atividades') <> ${release.revision.activities.length}
    OR jsonb_array_length(v_package.config #> '{provas,0,questoes}') <> ${release.revision.exam.length} THEN
    RAISE EXCEPTION 'Pacote privado divergente do manifesto aprovado.';
  END IF;
  UPDATE public.cursos SET ead_config = v_package.config WHERE id = v_course.id;
  IF NOT EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions
      WHERE course_id = v_course.id AND revision = ${literal(MATHEMATICS_REVISION)}) THEN
    RAISE EXCEPTION 'Snapshot da nova revisão não foi confirmado.';
  END IF;
  DELETE FROM internal_academic.ead_revision_publication_packages
  WHERE course_id = v_course.id AND revision = ${literal(MATHEMATICS_REVISION)};
END;
$publish$;
COMMIT;
`;
}

export function generatePrivateStaging(release, baseline, keyring) {
  const before = beforeFor(release, baseline);
  const config = buildCourseConfig(before.ead_config, withPrivateAnswers(release.revision, keyring));
  const body = JSON.stringify(config);
  if (body.includes('$ead_private$')) throw new Error('Delimitador SQL presente no pacote.');
  return `INSERT INTO internal_academic.ead_revision_publication_packages
  (course_id, revision, expected_config_hash, config)
SELECT id, ${literal(MATHEMATICS_REVISION)}, ${literal(before.config_hash)}, $ead_private$${body}$ead_private$::jsonb
FROM public.cursos WHERE modalidade='EAD' AND nome=${literal(before.nome)};
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [snapshot, privateAnswers, privateOutput] = process.argv.slice(2);
  if (!snapshot || !privateAnswers || !privateOutput || !resolve(privateOutput).startsWith('/private/tmp/')) {
    throw new Error('Uso: snapshot-MCP.json gabaritos-privados.json /private/tmp/pacotes-privados.sql');
  }
  const baseline = JSON.parse(readFileSync(snapshot, 'utf8'));
  const keyring = JSON.parse(readFileSync(privateAnswers, 'utf8'));
  for (const release of releases) writeFileSync(release.file, generatePublication(release, baseline));
  writeFileSync(privateOutput, 'BEGIN;\n' + releases.map(release => generatePrivateStaging(release, baseline, keyring)).join('\n') + 'COMMIT;\n', { mode: 0o600 });
  console.log('Duas migrations públicas sem gabarito; pacote privado preparado em tmp para envio exclusivo por MCP.');
}
