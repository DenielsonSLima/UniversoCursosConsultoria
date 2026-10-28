-- Reserva resoluções existentes; não troca currículo, itens, chaves ou progresso.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.ead_aluno_progresso IN EXCLUSIVE MODE;
DO $protect$
DECLARE
  v_entry jsonb;
  v_course public.cursos;
  v_keys internal_academic.ead_assessment_answer_keys;
  v_snapshot jsonb;
  v_expected jsonb;
  v_public jsonb;
  v_progress text;
  v_certificates text;
BEGIN
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Serviços Gerais","hours":90,"hash":"5916664788df260fd9341684090e6af0","identityHash":"679033eeb318a01401a24ef5364d3bc0"},{"name":"Vigia","hours":80,"hash":"32c009b366c54e1af701026a16bf131c","identityHash":"1741f52a1115fd98b67e557d2ddf7935"}]'::jsonb) LOOP
    SELECT * INTO STRICT v_course FROM public.cursos
    WHERE modalidade='EAD' AND nome=v_entry->>'name'
      AND carga_horaria=(v_entry->>'hours')::integer FOR UPDATE;
    IF md5(v_course.id::text) IS DISTINCT FROM v_entry->>'identityHash'
      OR md5(v_course.ead_config::text) IS DISTINCT FROM v_entry->>'hash'
      OR nullif(v_course.ead_config->>'assessmentRevision','') IS NOT NULL
      OR EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions WHERE course_id=v_course.id) THEN
      RAISE EXCEPTION 'Curso mudou ou já recebeu proteção: %',v_course.nome;
    END IF;
    IF jsonb_typeof(v_course.ead_config->'atividades') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_course.ead_config#>'{provas,0,questoes}') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Contrato de avaliação ausente: %',v_course.nome;
    END IF;
    IF jsonb_array_length(v_course.ead_config->'atividades')<>4
      OR jsonb_array_length(v_course.ead_config#>'{provas,0,questoes}')<>10
      OR (SELECT count(*) FROM jsonb_array_elements(v_course.ead_config#>'{provas,0,questoes}') q
        WHERE jsonb_typeof(q->'explicacao')='string' AND nullif(btrim(q->>'explicacao'),'') IS NOT NULL)<>10
      OR EXISTS (SELECT 1 FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id
        AND nullif(ep.progress->>'assessmentRevision','') IS NOT NULL
        AND ep.progress->>'assessmentRevision'<>'legacy-20261027') THEN
      RAISE EXCEPTION 'Contrato ou marcador de progresso divergente: %',v_course.nome;
    END IF;
    SELECT * INTO STRICT v_keys FROM internal_academic.ead_assessment_answer_keys
    WHERE course_id=v_course.id FOR UPDATE;
    SELECT md5(coalesce(jsonb_agg(to_jsonb(ep) ORDER BY ep.aluno_id)::text,'[]')) INTO v_progress
    FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id;
    SELECT md5(coalesce(jsonb_agg(to_jsonb(ca) ORDER BY ca.id)::text,'[]')) INTO v_certificates
    FROM public.certificados_academicos ca WHERE ca.curso_id=v_course.id;
    v_snapshot:=internal_academic.ead_revision_snapshot_config(v_course.ead_config)
      || jsonb_build_object('assessmentRevision','legacy-20261027');
    v_expected:=internal_academic.ead_sanitize_assessment_config(v_snapshot);
    INSERT INTO internal_academic.ead_course_revisions
      (course_id,revision,config,activity_answers,quiz_answers)
    VALUES (v_course.id,'legacy-20261027',v_snapshot,v_keys.activity_answers,v_keys.quiz_answers);
    UPDATE public.cursos SET ead_config=v_course.ead_config
      || jsonb_build_object('assessmentRevision','legacy-20261027') WHERE id=v_course.id;
    SELECT ead_config INTO STRICT v_public FROM public.cursos WHERE id=v_course.id;
    IF v_public IS DISTINCT FROM v_expected
      OR v_keys.activity_answers IS DISTINCT FROM (SELECT activity_answers
        FROM internal_academic.ead_assessment_answer_keys WHERE course_id=v_course.id)
      OR v_keys.quiz_answers IS DISTINCT FROM (SELECT quiz_answers
        FROM internal_academic.ead_assessment_answer_keys WHERE course_id=v_course.id)
      OR v_snapshot IS DISTINCT FROM (SELECT config FROM internal_academic.ead_course_revisions
        WHERE course_id=v_course.id AND revision='legacy-20261027')
      OR v_progress IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(ep) ORDER BY ep.aluno_id)::text,'[]'))
        FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id)
      OR v_certificates IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(ca) ORDER BY ca.id)::text,'[]'))
        FROM public.certificados_academicos ca WHERE ca.curso_id=v_course.id) THEN
      RAISE EXCEPTION 'Proteção alterou contrato ou histórico: %',v_course.nome;
    END IF;
  END LOOP;
END;
$protect$;
COMMIT;
