BEGIN;

CREATE FUNCTION internal_academic.can_manage_ead_quiz_wait(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_polo_id IS NOT NULL
    AND coalesce(public.gestor_has_module('secretaria'), false)
    AND coalesce(public.is_gestor_for_polo(p_polo_id), false)
    AND coalesce(
      jsonb_typeof(public.gestor_effective_permissions() #> '{tabs,secretaria}') = 'array'
      AND (public.gestor_effective_permissions() #> '{tabs,secretaria}') ? 'provas-ead',
      false
    );
$$;

CREATE FUNCTION public.secretaria_listar_provas_ead_em_carencia(
  p_polo_id uuid, p_busca text DEFAULT NULL, p_pagina integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_busca text := lower(btrim(coalesce(p_busca, '')));
  v_page_size constant integer := 20;
  v_result jsonb;
BEGIN
  IF NOT internal_academic.can_manage_ead_quiz_wait(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso a Provas EAD não autorizado para este polo.' USING ERRCODE = '42501';
  END IF;
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 10000 OR length(v_busca) > 100 THEN
    RAISE EXCEPTION 'Filtro ou página inválidos.' USING ERRCODE = '22023';
  END IF;

  WITH waiting AS MATERIALIZED (
    SELECT m.id AS matricula_id, p.nome AS aluno_nome, c.nome AS curso_nome,
      coalesce(nullif(t.nome, ''), nullif(t.codigo, ''), 'Turma EAD') AS turma_nome,
      study.started_at, study.started_at + interval '168 hours' AS available_at
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id AND c.modalidade = 'EAD'
    JOIN public.matriculas m ON m.turma_id = t.id
    JOIN public.parceiros p ON p.id = m.aluno_id
    JOIN internal_academic.ead_study_periods study ON study.matricula_id = m.id
    WHERE t.polo_id = p_polo_id
      AND (upper(m.status) = 'ATIVO' OR (
        internal_academic.ead_trust_full_course_enabled()
        AND internal_academic.ead_has_trust_access(m.id)
      ))
      AND study.started_at > statement_timestamp() - interval '168 hours'
      AND NOT EXISTS (
        SELECT 1 FROM internal_academic.ead_quiz_early_releases release
        WHERE release.matricula_id = m.id
      )
      AND (v_busca = '' OR strpos(lower(concat_ws(' ', p.nome, c.nome, t.nome)), v_busca) > 0)
  ), page_rows AS (
    SELECT * FROM waiting ORDER BY available_at, matricula_id
    LIMIT v_page_size OFFSET (p_pagina - 1) * v_page_size
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'matriculaId', page_rows.matricula_id,
      'alunoNome', page_rows.aluno_nome,
      'cursoNome', page_rows.curso_nome,
      'turmaNome', page_rows.turma_nome,
      'iniciadoEm', page_rows.started_at,
      'liberaEm', page_rows.available_at
    ) ORDER BY page_rows.available_at, page_rows.matricula_id) FROM page_rows), '[]'::jsonb),
    'total', (SELECT count(*) FROM waiting),
    'page', p_pagina,
    'pageSize', v_page_size
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.secretaria_liberar_prova_ead_antecipada(
  p_polo_id uuid, p_matricula_id uuid, p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_motivo, ''));
  v_study_started_at timestamptz;
  v_status text;
  v_release internal_academic.ead_quiz_early_releases%ROWTYPE;
BEGIN
  IF NOT internal_academic.can_manage_ead_quiz_wait(p_polo_id) THEN
    RAISE EXCEPTION 'Acesso a Provas EAD não autorizado para este polo.' USING ERRCODE = '42501';
  END IF;
  IF p_matricula_id IS NULL OR length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Informe um motivo entre 5 e 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT study.started_at, m.status
    INTO v_study_started_at, v_status
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id AND t.polo_id = p_polo_id
  JOIN public.cursos c ON c.id = t.curso_id AND c.modalidade = 'EAD'
  JOIN internal_academic.ead_study_periods study ON study.matricula_id = m.id
  WHERE m.id = p_matricula_id
  FOR UPDATE OF m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matrícula EAD em carência não localizada neste polo.' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_release
  FROM internal_academic.ead_quiz_early_releases
  WHERE matricula_id = p_matricula_id;

  IF FOUND THEN
    IF v_release.granted_by IS DISTINCT FROM v_actor OR v_release.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'A antecipação desta matrícula já foi registrada.' USING ERRCODE = 'PT409';
    END IF;
    RETURN jsonb_build_object('matriculaId', p_matricula_id, 'liberadoEm', v_release.granted_at);
  END IF;
  IF v_study_started_at + interval '168 hours' <= clock_timestamp()
    OR NOT (coalesce(upper(v_status) = 'ATIVO', false) OR coalesce(
      internal_academic.ead_trust_full_course_enabled()
      AND internal_academic.ead_has_trust_access(p_matricula_id),
      false
    )) THEN
    RAISE EXCEPTION 'A matrícula não está mais aguardando antecipação.' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO internal_academic.ead_quiz_early_releases (matricula_id, granted_at, granted_by, reason)
    VALUES (p_matricula_id, clock_timestamp(), v_actor, v_reason)
    RETURNING * INTO v_release;

  RETURN jsonb_build_object('matriculaId', p_matricula_id, 'liberadoEm', v_release.granted_at);
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.can_manage_ead_quiz_wait(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.secretaria_listar_provas_ead_em_carencia(uuid, text, integer),
  public.secretaria_liberar_prova_ead_antecipada(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.secretaria_listar_provas_ead_em_carencia(uuid, text, integer),
  public.secretaria_liberar_prova_ead_antecipada(uuid, uuid, text)
  TO authenticated;

COMMIT;
