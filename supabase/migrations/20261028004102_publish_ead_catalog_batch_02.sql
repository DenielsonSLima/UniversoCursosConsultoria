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
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Auxiliar Corretor de Imóveis","identityHash":"de8433617187f6c74134c09e10cd8c4a","hours":100,"hash":"ccf008a5c2765b16515e3a1bbadbe2cb","revision":"ead-auxiliar-corretor-de-imoveis-20261027-v2","sourceHash":"de6fb48b46d8a77d96754aa82dafedaabcb7b42fc4aca78adcd652ff36ef251e","lessons":5,"activities":5,"questions":10},{"name":"Auxiliar de Cozinha","identityHash":"6fbb75583e957de80a4384d5f30f66b6","hours":100,"hash":"bc81497bd34148962a7a653b613ae53a","revision":"ead-auxiliar-de-cozinha-20261027-v2","sourceHash":"a07e66269ca413c9f5383d0ad899fd3994e9a11eb30cd54fb6c3c6254c45580c","lessons":5,"activities":5,"questions":10},{"name":"Auxiliar de Creche","identityHash":"52831f74f66d435ca210ade94eb78e56","hours":80,"hash":"9505a87e4aa7b5112d5e0100d7b5fb45","revision":"ead-auxiliar-de-creche-20261027-v2","sourceHash":"567563d1d7f7105539acbd466e5c9ec79afbae540b5b27464397384507f3e83a","lessons":5,"activities":5,"questions":10},{"name":"Auxiliar de Veterinário","identityHash":"a4c8bb2017c9f0752162e126d69c99f2","hours":120,"hash":"021eb98fe4ea06291fac7ae12fd45997","revision":"ead-auxiliar-de-veterinario-20261027-v2","sourceHash":"3f7dddb72e908aacff62f881bbe06af8f05407073e4ff0082cdb0debd2add97c","lessons":5,"activities":5,"questions":10},{"name":"Auxiliar Pedagógico","identityHash":"93788ff2e1f553382055be0810f84575","hours":100,"hash":"ed1e2671ab531289503714e3370ca7a8","revision":"ead-auxiliar-pedagogico-20261027-v2","sourceHash":"fdc6d705cc4af231c7c5d6767e36679f48202c4331ce6dab385819255445cce6","lessons":5,"activities":5,"questions":10}]'::jsonb) LOOP
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
