-- GERADO a partir das questões públicas; nenhum gabarito integra este arquivo.
-- O pacote completo revisado é reservado no banco privado por MCP antes da aplicação.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $publish$
DECLARE
  v_course public.cursos;
  v_package internal_academic.ead_revision_publication_packages;
BEGIN
  SELECT * INTO STRICT v_course FROM public.cursos
  WHERE modalidade = 'EAD' AND nome = 'Matemática para Enem'
    AND carga_horaria = 160 FOR UPDATE;
  IF md5(v_course.ead_config::text) <> 'cfdd8e277fb0f9e796abcb1518b85b9a' THEN
    RAISE EXCEPTION 'Conteúdo mudou desde a revisão; não publicar sobre alteração concorrente.';
  END IF;
  SELECT * INTO STRICT v_package FROM internal_academic.ead_revision_publication_packages
  WHERE course_id = v_course.id AND revision = 'matematica-20261027-v2' FOR UPDATE;
  IF v_package.expected_config_hash <> 'cfdd8e277fb0f9e796abcb1518b85b9a'
    OR v_package.config ->> 'contentRevision' <> 'me-20261027'
    OR jsonb_array_length(v_package.config -> 'conteudos') <> 6
    OR jsonb_array_length(v_package.config -> 'atividades') <> 6
    OR jsonb_array_length(v_package.config #> '{provas,0,questoes}') <> 12 THEN
    RAISE EXCEPTION 'Pacote privado divergente do manifesto aprovado.';
  END IF;
  UPDATE public.cursos SET ead_config = v_package.config WHERE id = v_course.id;
  IF NOT EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions
      WHERE course_id = v_course.id AND revision = 'matematica-20261027-v2') THEN
    RAISE EXCEPTION 'Snapshot da nova revisão não foi confirmado.';
  END IF;
  DELETE FROM internal_academic.ead_revision_publication_packages
  WHERE course_id = v_course.id AND revision = 'matematica-20261027-v2';
END;
$publish$;
COMMIT;
