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
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Matemática Infantil","identityHash":"b44f0f02912cc3b325a7753968fb7fe5","hours":100,"hash":"b9498363655dcac63607611da6fa2d71","revision":"ead-matematica-infantil-20261027-v2","sourceHash":"00ba023d0679fd9c718dff7c5d6ffac4a42366e6b2778748669779bb9dd8348f","lessons":5,"activities":5,"questions":10},{"name":"Mediador Escolar (Monitor Escolar)","identityHash":"865bdc5f99a8f366428753596f5863a5","hours":120,"hash":"01f191266af3af956d61183e63fa1e20","revision":"ead-mediador-escolar-monitor-escolar-20261027-v2","sourceHash":"7c27fdd6acce3723644313acbbbfafa4a5168d622350879038d0c8398ab9c668","lessons":5,"activities":5,"questions":10},{"name":"Metodologias Ativas para o Professor","identityHash":"2b7c9b721b3679f1a41326160a34ecce","hours":80,"hash":"9268d13ee1740fcecbdf3c88e027b1aa","revision":"ead-metodologias-ativas-para-o-professor-20261027-v2","sourceHash":"9c86ff63d0a6251ac915c49585621236b3ab11889822b0e3d716e7cf3f35fab8","lessons":5,"activities":5,"questions":10},{"name":"Monitor Escolar de Classe - Auxiliar do Regente","identityHash":"47e2dba79bb50bc86d248b1e5ce5bec8","hours":80,"hash":"2b82162f114af85acc34613433cba487","revision":"ead-monitor-escolar-de-classe-auxiliar-do-regente-20261027-v2","sourceHash":"81b7ce2404d5d72c39ae639a56ef486c09664b2e3648182638ab88189c30b505","lessons":5,"activities":5,"questions":10},{"name":"NR-10","identityHash":"62a6a70b34263cb28032862e4e321f2b","hours":80,"hash":"6cc233bef668350b1fd8b6d13f349d77","revision":"ead-nr-10-20261027-v2","sourceHash":"e2c747f3a421853d1fff696a2a90564e6c26cc03911c6cc8ca97f0b89575fe6d","lessons":5,"activities":5,"questions":10}]'::jsonb) LOOP
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
