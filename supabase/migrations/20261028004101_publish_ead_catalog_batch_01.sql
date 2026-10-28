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
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Aperfeiçoamento em Educação Interdimensional","identityHash":"a155eae93ca39e4c4d5a038f08b3dc02","hours":156,"hash":"df09148af3d50167152c9f7366947987","revision":"ead-aperfeicoamento-em-educacao-interdimensional-20261027-v2","sourceHash":"533c0c3a6cccc1cec05d761786d465b8939d9fb1261c0e8b526b3e47e7f26329","lessons":5,"activities":5,"questions":10},{"name":"Atendente de Consultório Médico","identityHash":"7c0fac530e2efe3870416edbd395d8e2","hours":100,"hash":"1f6b1ce047427bb872fbb26ed3daccad","revision":"ead-atendente-de-consultorio-medico-20261027-v2","sourceHash":"5d2163d9bb3190e0ab69238ba74f9901e785cbc50dc9acf8e45c93d2770334ae","lessons":5,"activities":5,"questions":10},{"name":"Atendente de Farmácia","identityHash":"076e373416ce9b84b60732a1c70edc09","hours":120,"hash":"c765cc6eb394308624a8ad2440eb5f2b","revision":"ead-atendente-de-farmacia-20261027-v2","sourceHash":"05b6f4b4d6fd33b632e029da19db00c1601f2b136fa9d0fab02f280c45f8ed3a","lessons":5,"activities":5,"questions":10},{"name":"Atualização em Radiologia","identityHash":"f427bfc8d92cf3fab98064ba19a905ab","hours":100,"hash":"d8cfcae81ceffe3cf43abdeb4b2ba904","revision":"ead-atualizacao-em-radiologia-20261027-v2","sourceHash":"deb6ab73c4b1b30d4f5c3c38973fc256a8dd3952334711cefb6c55baa4b6bda0","lessons":5,"activities":5,"questions":10},{"name":"Auxiliar Administrativo","identityHash":"05738afbae51c9fb1ea224012d106050","hours":120,"hash":"81ef64646ae071be9f4de03eec67e240","revision":"ead-auxiliar-administrativo-20261027-v2","sourceHash":"b9c3e1ca0c75dc11b3d36619654e9b2d8204b50222971e7aa72ec9b68a8b5bea","lessons":5,"activities":5,"questions":10}]'::jsonb) LOOP
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
