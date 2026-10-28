-- Manifesto de conteúdo; nenhuma resposta ou resolução integra esta migration.
-- O pacote completo é reservado exclusivamente por MCP no esquema privado.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Serializa a inclusão do marcador com escritas/SELECT FOR UPDATE do progresso.
-- SELECT simples continua disponível. RPCs que gravam progresso aguardam,
-- inclusive o getter com INSERT ON CONFLICT. O bloqueio termina na transação.
LOCK TABLE public.ead_aluno_progresso IN EXCLUSIVE MODE;
DO $publish$
DECLARE
  v_entry jsonb;
  v_course public.cursos;
  v_package internal_academic.ead_revision_publication_packages;
  v_keys internal_academic.ead_assessment_answer_keys;
  v_progress_before text;
  v_certificates_before text;
BEGIN
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Barbeiro Profissional","identityHash":"fcc094f2001d272a7d9fc7ca04b971e6","hours":120,"hash":"d3fefa07fc66a0f36c47ad04b0d2461d","revision":"ead-barbeiro-profissional-20261027-v2","sourceHash":"c4ca863d7cd27d6e5d502bee3c7cc383d47fa765e9b373db44aa7be8592ed4f5","lessons":5,"activities":5,"questions":10},{"name":"Condutor de Transporte Escolar","identityHash":"01482120aa824aa8210f065f5456252b","hours":80,"hash":"59a2ca89ca5efba5fac6f276e614c132","revision":"ead-condutor-de-transporte-escolar-20261027-v2","sourceHash":"6d59ddd4ea387e09f26c0887bb7d40bb64c91ef36a771d2b353f9280790247ee","lessons":5,"activities":5,"questions":10},{"name":"Conhecimentos Bancários","identityHash":"599e96ae76e34715528e4f4775f801b3","hours":100,"hash":"f77957b9ac5df29eb361b51223f33003","revision":"ead-conhecimentos-bancarios-20261027-v2","sourceHash":"50a07d6da35694cb65c78341eb081435ec1eb684e7b76dd8dfd155cb1810d680","lessons":5,"activities":5,"questions":10},{"name":"Criação de Loja Virtual","identityHash":"bcecf3786d6eadb5c1e3f9e1f5bbd643","hours":100,"hash":"f7437339feb762bdc6be70ffbe4e34c3","revision":"ead-criacao-de-loja-virtual-20261027-v2","sourceHash":"ae24bd61260e9bd17ce238b677248f57537a1776e5f4424c33fa13d051338af4","lessons":5,"activities":5,"questions":10},{"name":"Cuidador de Idoso","identityHash":"992c593d115561b5ee195db71cc7ff62","hours":160,"hash":"bd18a0863b5b9264436052d2c996525b","revision":"ead-cuidador-de-idoso-20261027-v2","sourceHash":"3238e22653317ccd47a93e132c586b7a6cef3ce729c48f910f549e9e1bbadcf9","lessons":5,"activities":5,"questions":10}]'::jsonb) LOOP
    SELECT * INTO STRICT v_course FROM public.cursos
    WHERE modalidade='EAD' AND nome=v_entry->>'name'
      AND carga_horaria=(v_entry->>'hours')::integer FOR UPDATE;
    IF md5(v_course.id::text) IS DISTINCT FROM v_entry->>'identityHash'
      OR md5(v_course.ead_config::text) IS DISTINCT FROM v_entry->>'hash'
      OR nullif(v_course.ead_config->>'assessmentRevision','') IS NOT NULL
      OR EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions r WHERE r.course_id=v_course.id) THEN
      RAISE EXCEPTION 'Curso mudou desde a revisão ou já possui versões: %', v_course.nome;
    END IF;
    SELECT * INTO STRICT v_package FROM internal_academic.ead_revision_publication_packages
    WHERE course_id=v_course.id AND revision=v_entry->>'revision' FOR UPDATE;
    IF v_package.expected_config_hash IS DISTINCT FROM v_entry->>'hash'
      OR v_package.config->>'assessmentRevision' IS DISTINCT FROM v_entry->>'revision'
      OR v_package.config->>'contentRevision' IS DISTINCT FROM v_entry->>'revision'
      OR v_package.config->>'publicationSourceHash' IS DISTINCT FROM v_entry->>'sourceHash'
      OR jsonb_typeof(v_package.config->'conteudos') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_package.config->'atividades') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_package.config#>'{provas,0,questoes}') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Pacote privado diverge do manifesto: %', v_course.nome;
    END IF;
    IF jsonb_array_length(v_package.config->'conteudos') IS DISTINCT FROM (v_entry->>'lessons')::integer
      OR jsonb_array_length(v_package.config->'atividades') IS DISTINCT FROM (v_entry->>'activities')::integer
      OR jsonb_array_length(v_package.config#>'{provas,0,questoes}') IS DISTINCT FROM (v_entry->>'questions')::integer THEN
      RAISE EXCEPTION 'Pacote privado diverge do manifesto: %', v_course.nome;
    END IF;
    SELECT * INTO STRICT v_keys FROM internal_academic.ead_assessment_answer_keys
    WHERE course_id=v_course.id FOR UPDATE;
    SELECT md5(coalesce(jsonb_agg(
      (to_jsonb(ep)-'updated_at'-'progress') || jsonb_build_object('progress',ep.progress-'assessmentRevision')
      ORDER BY ep.aluno_id)::text,'[]')) INTO v_progress_before
    FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id;
    SELECT md5(coalesce(jsonb_agg(to_jsonb(ca) ORDER BY ca.id)::text,'[]')) INTO v_certificates_before
    FROM public.certificados_academicos ca WHERE ca.curso_id=v_course.id;
    INSERT INTO internal_academic.ead_course_revisions
      (course_id,revision,config,activity_answers,quiz_answers)
    VALUES (v_course.id,'legacy-20261027',
      internal_academic.ead_revision_snapshot_config(v_course.ead_config)
        || jsonb_build_object('assessmentRevision','legacy-20261027'),
      v_keys.activity_answers,v_keys.quiz_answers);
    UPDATE public.ead_aluno_progresso ep
    SET progress=ep.progress || jsonb_build_object('assessmentRevision','legacy-20261027')
    WHERE ep.curso_id=v_course.id AND (
      ep.progress ?| ARRAY['quizScore','lastQuizScoreAt','completedAt','certificateId']
      OR coalesce(ep.progress->'completedContentIds','[]'::jsonb) <> '[]'::jsonb
      OR coalesce(ep.progress->'completedActivityIds','[]'::jsonb) <> '[]'::jsonb
      OR coalesce(ep.progress->'completedVideoIds','[]'::jsonb) <> '[]'::jsonb
      OR coalesce(ep.progress->'activityAnswers','{}'::jsonb) <> '{}'::jsonb
      OR coalesce(ep.progress->'quizAnswers','{}'::jsonb) <> '{}'::jsonb
      OR EXISTS (SELECT 1 FROM public.certificados_academicos ca
        WHERE ca.aluno_id=ep.aluno_id AND ca.curso_id=ep.curso_id AND ca.modalidade='EAD')
    );
    UPDATE public.cursos SET ead_config=v_package.config WHERE id=v_course.id;
    IF NOT EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions
      WHERE course_id=v_course.id AND revision=v_entry->>'revision') THEN
      RAISE EXCEPTION 'Revisão publicada sem snapshot: %', v_course.nome;
    END IF;
    IF v_progress_before IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(
        (to_jsonb(ep)-'updated_at'-'progress') || jsonb_build_object('progress',ep.progress-'assessmentRevision')
        ORDER BY ep.aluno_id)::text,'[]')) FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id)
      OR v_certificates_before IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(ca) ORDER BY ca.id)::text,'[]'))
        FROM public.certificados_academicos ca WHERE ca.curso_id=v_course.id) THEN
      RAISE EXCEPTION 'Publicação alterou histórico acadêmico: %', v_course.nome;
    END IF;
    DELETE FROM internal_academic.ead_revision_publication_packages
    WHERE course_id=v_course.id AND revision=v_entry->>'revision';
  END LOOP;
END;
$publish$;
COMMIT;
