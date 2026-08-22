-- O catálogo e as leituras diretas recebem somente a configuração sanitizada.
-- Escritas autorizadas continuam aceitando os cinco aliases e preservam chaves
-- existentes quando um cliente envia uma configuração já sanitizada.

CREATE FUNCTION internal_academic.ead_secure_course_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_activity jsonb := '{}'::jsonb;
  v_existing_quiz jsonb := '{}'::jsonb;
  v_collected jsonb;
BEGIN
  IF NEW.modalidade = 'EAD' THEN
    SELECT k.activity_answers, k.quiz_answers
    INTO v_existing_activity, v_existing_quiz
    FROM internal_academic.ead_assessment_answer_keys k
    WHERE k.course_id = NEW.id;

    v_collected := internal_academic.ead_collect_assessment_answer_keys(
      NEW.ead_config,
      coalesce(v_existing_activity, '{}'::jsonb),
      coalesce(v_existing_quiz, '{}'::jsonb)
    );

    INSERT INTO internal_academic.ead_assessment_answer_keys (
      course_id,
      activity_answers,
      quiz_answers,
      updated_at
    )
    VALUES (
      NEW.id,
      v_collected -> 'activities',
      v_collected -> 'quiz',
      now()
    )
    ON CONFLICT (course_id) DO UPDATE SET
      activity_answers = EXCLUDED.activity_answers,
      quiz_answers = EXCLUDED.quiz_answers,
      updated_at = now();

    NEW.ead_config := internal_academic.ead_sanitize_assessment_config(NEW.ead_config);
  ELSIF TG_OP = 'UPDATE' AND OLD.modalidade = 'EAD' THEN
    DELETE FROM internal_academic.ead_assessment_answer_keys
    WHERE course_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_secure_course_config()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER secure_ead_course_config
BEFORE INSERT OR UPDATE OF ead_config, modalidade
ON public.cursos
FOR EACH ROW
EXECUTE FUNCTION internal_academic.ead_secure_course_config();

UPDATE public.cursos
SET ead_config = ead_config
WHERE modalidade = 'EAD';

CREATE FUNCTION public.get_ead_course_configs_for_management(
  p_course_ids uuid[]
)
RETURNS TABLE (
  course_id uuid,
  ead_config jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_course_ids IS NULL OR cardinality(p_course_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_course_ids) > 200
    OR array_position(p_course_ids, NULL) IS NOT NULL
    OR cardinality(p_course_ids) <> (
      SELECT count(DISTINCT requested_id)
      FROM unnest(p_course_ids) requested(requested_id)
    )
  THEN
    RAISE EXCEPTION 'Informe até 200 IDs de cursos EAD, sem nulos ou repetições.'
      USING ERRCODE = '23514';
  END IF;

  v_ids := p_course_ids;
  IF coalesce(auth.role(), '') <> 'service_role'
    AND NOT (
      public.is_gestor_global()
      AND public.gestor_can_manage_curso_modalidade('EAD')
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(v_ids) requested(requested_id)
        LEFT JOIN public.cursos c
          ON c.id = requested.requested_id
         AND c.modalidade = 'EAD'
        WHERE c.id IS NULL
      )
    )
  THEN
    RAISE EXCEPTION 'Sem permissão para consultar configurações EAD de gestão.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) requested(requested_id)
    LEFT JOIN public.cursos c
      ON c.id = requested.requested_id
     AND c.modalidade = 'EAD'
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Um ou mais cursos EAD solicitados não existem.'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    internal_academic.ead_restore_assessment_answers(
      c.ead_config,
      k.activity_answers,
      k.quiz_answers
    )
  FROM unnest(v_ids) requested(requested_id)
  JOIN public.cursos c
    ON c.id = requested.requested_id
   AND c.modalidade = 'EAD'
  JOIN internal_academic.ead_assessment_answer_keys k ON k.course_id = c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ead_course_configs_for_management(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ead_course_configs_for_management(uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ead_course_configs_for_management(uuid[]) IS
  'Reconstitui em lote os gabaritos canônicos somente para gestor global autorizado em Cadastros EAD.';
