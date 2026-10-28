import { createHash } from 'node:crypto';

const literal = value => `'${String(value).replaceAll("'", "''")}'`;

export function generateAlignmentPublication(patches) {
  if (!patches.length || patches.length > 10
    || new Set(patches.map(item => item.courseName)).size !== patches.length) {
    throw new Error('Manifesto de vínculos vazio, duplicado ou muito amplo.');
  }
  for (const patch of patches) {
    if (!/^[a-f0-9-]{36}$/.test(patch.courseId) || !/^[a-f0-9]{32}$/.test(patch.expectedConfigHash) || !patch.activities?.length
      || new Set(patch.activities.map(item => item.activityId)).size !== patch.activities.length) {
      throw new Error('Hash ou conjunto de atividades inválido.');
    }
    if (patch.activities.some(item => !item.next?.etapaId || (item.next.aulaId !== null
      && item.next.aulaId !== item.next.etapaId))) throw new Error('Destino de aula e etapa incompatível.');
  }
  const manifest = patches.map(({ courseId, courseName, hours, expectedConfigHash, activities }) => (
    { name: courseName, identityHash: createHash('md5').update(courseId).digest('hex'),
      hours, hash: expectedConfigHash, activities }
  ));
  return `-- Corrige somente referências de sete atividades; preserva o contrato avaliado.
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
  FOR v_entry IN SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(manifest))}::jsonb) LOOP
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
`;
}
