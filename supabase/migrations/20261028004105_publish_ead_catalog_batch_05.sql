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
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Educação nas Mudanças da Sociedade","identityHash":"d83b6bc4637e2b885dd8d587f46abfbe","hours":80,"hash":"cd8c4c94797a9f6ec9200fdd203e90a0","revision":"ead-educacao-nas-mudancas-da-sociedade-20261027-v2","sourceHash":"a0ce62985d8943428730bda5ffcbf07dcb030fd83e70bafc6d306e14a6e8e137","lessons":5,"activities":5,"questions":10},{"name":"Educação Social na Adolescência","identityHash":"2bbe04314ff1af714d27943fce1dff89","hours":80,"hash":"7ec00cf9e26ba1cde246d14a0dfaba0f","revision":"ead-educacao-social-na-adolescencia-20261027-v2","sourceHash":"ccd6084e790a013bdc71f66ad9a3a00ad0e46c0e45a3f22e6440f2f42eb55e26","lessons":5,"activities":5,"questions":10},{"name":"Eletricista","identityHash":"f73f518930e880c544c1d8f7a5d155ab","hours":160,"hash":"db5f30205189589dbad99efdd0ebd181","revision":"ead-eletricista-20261027-v2","sourceHash":"4e7a8f239a8bf0f858e343fed7aca4ee9d6e6e0aa9fd5f4807f47b88a9f29afb","lessons":5,"activities":5,"questions":10},{"name":"Estoque e Faturamento","identityHash":"f0f6937b317d73698dc591e4ee144f88","hours":100,"hash":"b4a00ea1f51b8223dcdd97efe36a1d45","revision":"ead-estoque-e-faturamento-20261027-v2","sourceHash":"831c40e73851fb088af1a038a7242cd1fc453cd7e8f0b1587f8c4ee181d9f1b7","lessons":5,"activities":5,"questions":10},{"name":"Excel Básico e Avançado","identityHash":"348e6dc7dc765fe41ca9f3880f3ab2ab","hours":120,"hash":"d60ad0bd9d9f3214209034129111589e","revision":"ead-excel-basico-avancado-20261027-v2","sourceHash":"b79849f4f0ac0ba483c4adfe5b6f5dd77bb37dee8b0cb5492e6d1538963da419","lessons":6,"activities":6,"questions":12}]'::jsonb) LOOP
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
