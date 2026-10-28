-- Corrige somente referências de sete atividades; preserva o contrato avaliado.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.ead_aluno_progresso IN EXCLUSIVE MODE;
DO $align$
DECLARE
  v_entry jsonb;
  v_link jsonb;
  v_item jsonb;
  v_next jsonb;
  v_items jsonb;
  v_course public.cursos;
  v_config jsonb;
  v_new_config jsonb;
  v_progress text;
  v_keys jsonb;
  v_certificates text;
  v_matches integer;
BEGIN
  FOR v_entry IN SELECT value FROM jsonb_array_elements('[{"name":"Merendeira Escolar","identityHash":"e6a7e04c3dd7ebd496eac248d92d7ef8","hours":100,"hash":"e961df17e28b40cbe0b24aa9aa16c005","activities":[{"activityId":"mer-atv-2","expected":{"aulaId":null,"etapaId":"mer-etapa-4"},"next":{"aulaId":null,"etapaId":"mer-etapa-3"}},{"activityId":"mer-atv-3","expected":{"aulaId":null,"etapaId":"mer-etapa-6"},"next":{"aulaId":null,"etapaId":"mer-etapa-5"}},{"activityId":"mer-atv-4","expected":{"aulaId":null,"etapaId":"mer-etapa-8"},"next":{"aulaId":null,"etapaId":"mer-etapa-7"}}]},{"name":"Serviços Gerais","identityHash":"679033eeb318a01401a24ef5364d3bc0","hours":90,"hash":"85f9c641af30380ad8d499e394c45f11","activities":[{"activityId":"atividade-3","expected":{"aulaId":"aula-6","etapaId":"aula-6"},"next":{"aulaId":"aula-5","etapaId":"aula-5"}}]},{"name":"Vigia","identityHash":"1741f52a1115fd98b67e557d2ddf7935","hours":80,"hash":"6de3ae5c432aa029de560b1161fb6136","activities":[{"activityId":"atividade-1","expected":{"aulaId":"aula-2","etapaId":"aula-2"},"next":{"aulaId":"aula-1","etapaId":"aula-1"}},{"activityId":"atividade-3","expected":{"aulaId":"aula-6","etapaId":"aula-6"},"next":{"aulaId":"aula-5","etapaId":"aula-5"}},{"activityId":"atividade-4","expected":{"aulaId":"aula-8","etapaId":"aula-8"},"next":{"aulaId":"aula-7","etapaId":"aula-7"}}]}]'::jsonb) LOOP
    SELECT * INTO STRICT v_course FROM public.cursos
    WHERE modalidade='EAD' AND nome=v_entry->>'name'
      AND carga_horaria=(v_entry->>'hours')::integer FOR UPDATE;
    IF md5(v_course.id::text) IS DISTINCT FROM v_entry->>'identityHash'
      OR md5(v_course.ead_config::text) IS DISTINCT FROM v_entry->>'hash'
      OR EXISTS (SELECT 1 FROM internal_academic.ead_course_revisions WHERE course_id=v_course.id) THEN
      RAISE EXCEPTION 'Curso mudou ou exige revisão acadêmica: %',v_course.nome;
    END IF;
    SELECT jsonb_build_object('activities',activity_answers,'quiz',quiz_answers) INTO STRICT v_keys
    FROM internal_academic.ead_assessment_answer_keys WHERE course_id=v_course.id FOR UPDATE;
    SELECT md5(coalesce(jsonb_agg(to_jsonb(ep) ORDER BY ep.aluno_id)::text,'[]')) INTO v_progress
    FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id;
    SELECT md5(coalesce(jsonb_agg(to_jsonb(ca) ORDER BY ca.id)::text,'[]')) INTO v_certificates
    FROM public.certificados_academicos ca WHERE ca.curso_id=v_course.id;
    v_config:=v_course.ead_config;
    FOR v_link IN SELECT value FROM jsonb_array_elements(v_entry->'activities') LOOP
      v_items:='[]'::jsonb;
      v_matches:=0;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_config->'atividades') LOOP
        v_next:=v_item;
        IF v_item->>'id'=v_link->>'activityId' THEN
          v_matches:=v_matches+1;
          IF v_item->>'aulaId' IS DISTINCT FROM v_link#>>'{expected,aulaId}'
            OR v_item->>'etapaId' IS DISTINCT FROM v_link#>>'{expected,etapaId}' THEN
            RAISE EXCEPTION 'Vínculo anterior divergente: %',v_link->>'activityId';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_config->'conteudos') lesson
              WHERE lesson->>'id'=v_link#>>'{next,etapaId}') THEN
            RAISE EXCEPTION 'Aula de destino ausente: %',v_link->>'activityId';
          END IF;
          v_next:=CASE WHEN v_link#>>'{next,aulaId}' IS NULL THEN v_next-'aulaId'
            ELSE jsonb_set(v_next,'{aulaId}',v_link#>'{next,aulaId}',true) END;
          v_next:=jsonb_set(v_next,'{etapaId}',v_link#>'{next,etapaId}',true);
        END IF;
        v_items:=v_items||jsonb_build_array(v_next);
      END LOOP;
      IF v_matches<>1 THEN RAISE EXCEPTION 'Atividade ausente ou duplicada'; END IF;
      v_config:=jsonb_set(v_config,'{atividades}',v_items,true);
    END LOOP;
    UPDATE public.cursos SET ead_config=v_config WHERE id=v_course.id;
    SELECT ead_config INTO STRICT v_new_config FROM public.cursos WHERE id=v_course.id;
    IF v_new_config IS DISTINCT FROM v_config
      OR v_keys IS DISTINCT FROM (SELECT jsonb_build_object('activities',activity_answers,'quiz',quiz_answers)
        FROM internal_academic.ead_assessment_answer_keys WHERE course_id=v_course.id)
      OR v_progress IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(ep) ORDER BY ep.aluno_id)::text,'[]'))
        FROM public.ead_aluno_progresso ep WHERE ep.curso_id=v_course.id)
      OR v_certificates IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(ca) ORDER BY ca.id)::text,'[]'))
        FROM public.certificados_academicos ca WHERE ca.curso_id=v_course.id) THEN
      RAISE EXCEPTION 'Correção de vínculo alterou contrato ou histórico: %',v_course.nome;
    END IF;
  END LOOP;
END;
$align$;
COMMIT;
