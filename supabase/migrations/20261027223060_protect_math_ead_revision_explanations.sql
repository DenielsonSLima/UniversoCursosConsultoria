-- Resoluções dos itens ficam no snapshot privado e só seguem no feedback submetido.
CREATE FUNCTION internal_academic.ead_revision_restore_explanations(p_config jsonb, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := p_config;
  v_items jsonb := '[]';
  v_provas jsonb := '[]';
  v_questions jsonb;
  v_item jsonb;
  v_prova jsonb;
  v_explanation jsonb;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_config -> 'atividades', '[]')) LOOP
    SELECT a -> 'explicacao' INTO v_explanation
    FROM jsonb_array_elements(coalesce(p_snapshot -> 'atividades', '[]')) a
    WHERE a ->> 'id' = v_item ->> 'id';
    IF NOT (v_item ? 'explicacao') AND v_explanation IS NOT NULL THEN
      v_item := v_item || jsonb_build_object('explicacao', v_explanation);
    END IF;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;
  v_result := jsonb_set(v_result, '{atividades}', v_items, true);
  FOR v_prova IN SELECT value FROM jsonb_array_elements(coalesce(p_config -> 'provas', '[]')) LOOP
    v_questions := '[]';
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_prova -> 'questoes', '[]')) LOOP
      SELECT q -> 'explicacao' INTO v_explanation
      FROM jsonb_array_elements(coalesce(p_snapshot -> 'provas', '[]')) p,
        jsonb_array_elements(coalesce(p -> 'questoes', '[]')) q
      WHERE q ->> 'id' = v_item ->> 'id';
      IF NOT (v_item ? 'explicacao') AND v_explanation IS NOT NULL THEN
        v_item := v_item || jsonb_build_object('explicacao', v_explanation);
      END IF;
      v_questions := v_questions || jsonb_build_array(v_item);
    END LOOP;
    v_provas := v_provas || jsonb_build_array(jsonb_set(v_prova, '{questoes}', v_questions, true));
  END LOOP;
  RETURN jsonb_set(v_result, '{provas}', v_provas, true);
END;
$$;

CREATE OR REPLACE FUNCTION internal_academic.ead_sanitize_assessment_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := internal_academic.ead_revision_snapshot_config(p_config);
  v_items jsonb := '[]';
  v_provas jsonb := '[]';
  v_questions jsonb;
  v_item jsonb;
  v_prova jsonb;
BEGIN
  IF nullif(btrim(p_config ->> 'assessmentRevision'), '') IS NULL THEN
    RETURN v_result;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_result -> 'atividades', '[]')) LOOP
    v_items := v_items || jsonb_build_array(v_item - 'explicacao');
  END LOOP;
  v_result := jsonb_set(v_result, '{atividades}', v_items, true);
  FOR v_prova IN SELECT value FROM jsonb_array_elements(coalesce(v_result -> 'provas', '[]')) LOOP
    v_questions := '[]';
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_prova -> 'questoes', '[]')) LOOP
      v_questions := v_questions || jsonb_build_array(v_item - 'explicacao');
    END LOOP;
    v_provas := v_provas || jsonb_build_array(jsonb_set(v_prova, '{questoes}', v_questions, true));
  END LOOP;
  RETURN jsonb_set(v_result, '{provas}', v_provas, true);
END;
$$;

CREATE FUNCTION internal_academic.ead_revision_feedback(
  p_progress jsonb, p_config jsonb, p_activity_answers jsonb, p_quiz_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := internal_academic.ead_assessment_feedback(
    p_progress, p_config, p_activity_answers, p_quiz_answers);
  v_item jsonb;
  v_id text;
BEGIN
  IF nullif(btrim(p_config ->> 'assessmentRevision'), '') IS NULL THEN
    RETURN v_result;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_config -> 'atividades', '[]')) LOOP
    v_id := v_item ->> 'id';
    IF v_result #>> ARRAY['activities', v_id, 'submitted'] = 'true'
      AND jsonb_typeof(v_item -> 'explicacao') = 'string' THEN
      v_result := jsonb_set(v_result, ARRAY['activities', v_id, 'explanation'], v_item -> 'explicacao', true);
    END IF;
  END LOOP;
  IF v_result #>> '{quiz,submitted}' = 'true' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_config #> '{provas,0,questoes}', '[]')) LOOP
      v_id := v_item ->> 'id';
      IF v_result #> ARRAY['quiz', 'results', v_id] IS NOT NULL
        AND jsonb_typeof(v_item -> 'explicacao') = 'string' THEN
        v_result := jsonb_set(v_result, ARRAY['quiz', 'results', v_id, 'explanation'], v_item -> 'explicacao', true);
      END IF;
    END LOOP;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_revision_restore_explanations(jsonb, jsonb),
  internal_academic.ead_sanitize_assessment_config(jsonb),
  internal_academic.ead_revision_feedback(jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ead_get_aluno_progress(p_aluno_id uuid, p_curso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_context jsonb;
  v_revision jsonb;
  v_can_upgrade boolean := false;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND public.current_aluno_id() IS DISTINCT FROM p_aluno_id THEN
    RAISE EXCEPTION 'O progresso EAD só pode ser acessado pelo próprio aluno.' USING ERRCODE = '42501';
  END IF;
  v_result := public.ead_get_aluno_progress_core_20260822(p_aluno_id, p_curso_id);
  v_context := internal_academic.ead_revision_context(p_aluno_id, p_curso_id);
  v_result := v_result || jsonb_build_object('assessmentFeedback',
    internal_academic.ead_revision_feedback(
      v_result -> 'progress', v_context -> 'config',
      v_context -> 'activityAnswers', v_context -> 'quizAnswers'));
  IF v_context ->> 'revision' IS NULL THEN
    RETURN v_result;
  END IF;
  v_can_upgrade := v_context ->> 'revision' IS DISTINCT FROM v_context ->> 'currentRevision'
    AND NOT coalesce((v_result #>> '{summary,quizPassed}')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM public.matriculas m JOIN public.turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = p_aluno_id AND t.curso_id = p_curso_id
        AND upper(coalesce(m.status, '')) = 'ATIVO')
    AND NOT EXISTS (SELECT 1 FROM public.certificados_academicos ca
      WHERE ca.aluno_id = p_aluno_id AND ca.curso_id = p_curso_id AND ca.modalidade = 'EAD');
  v_revision := jsonb_build_object(
    'current', v_context ->> 'revision',
    'available', v_context ->> 'currentRevision',
    'canUpgrade', v_can_upgrade,
    'isHistorical', v_context ->> 'revision' IS DISTINCT FROM v_context ->> 'currentRevision');
  RETURN v_result || jsonb_build_object(
    'effectiveEadConfig', internal_academic.ead_sanitize_assessment_config(v_context -> 'config'),
    'assessmentRevision', v_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.ead_get_aluno_progress(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ead_get_aluno_progress(uuid, uuid) TO authenticated, service_role;
