BEGIN;

-- The old progress creation clock could come from enrollment or a catalog read.
-- Use an actual change by the student's account before a corroborated approval.
CREATE FUNCTION internal_academic.ead_historical_study_evidence(p_certificado_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH certificate AS (
    SELECT ca.id, ca.data_inscricao, ca.data_conclusao, ca.emitido_em, ca.created_at,
      m.data_matricula, ep.id AS progress_id, aluno.auth_user_id,
      CASE WHEN ep.progress ->> 'completedAt' ~ '^[0-9]{13}(\.[0-9]+)?$'
        THEN to_timestamp((ep.progress ->> 'completedAt')::double precision / 1000)
      END AS approved_at
    FROM public.certificados_academicos ca
    JOIN public.matriculas m ON m.id = ca.matricula_id AND m.aluno_id = ca.aluno_id
    JOIN public.turmas t ON t.id = m.turma_id AND t.id = ca.turma_id
      AND t.curso_id = ca.curso_id AND t.polo_id = ca.polo_id
    JOIN public.cursos c ON c.id = ca.curso_id AND c.modalidade = 'EAD'
    JOIN public.parceiros aluno ON aluno.id = ca.aluno_id AND aluno.auth_user_id IS NOT NULL
    JOIN public.ead_aluno_progresso ep ON ep.aluno_id = ca.aluno_id AND ep.curso_id = ca.curso_id
    WHERE ca.id = p_certificado_id AND ca.modalidade = 'EAD'
      AND ca.status = 'FINALIZADO' AND ca.codigo_validacao IS NOT NULL
      AND m.data_matricula IS NOT NULL AND ca.data_inscricao IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.matriculas another
        JOIN public.turmas another_class ON another_class.id = another.turma_id
        WHERE another.aluno_id = m.aluno_id AND another_class.curso_id = ca.curso_id
          AND another.id <> m.id
      )
  )
  SELECT jsonb_build_object(
    'fonte', 'AUDITORIA_PROGRESSO',
    'iniciadoEm', first_activity.created_at,
    'concluidoEm', cert.approved_at,
    'inicioData', (first_activity.created_at AT TIME ZONE 'America/Maceio')::date,
    'conclusaoData', (cert.approved_at AT TIME ZONE 'America/Maceio')::date,
    'referencia', 'Auditoria de progresso ' || first_activity.id::text
  )
  FROM certificate cert
  CROSS JOIN LATERAL (
    SELECT log.id, log.created_at
    FROM public.sistema_eventos log
    WHERE log.entidade = 'ead_aluno_progresso'
      AND log.entidade_id::text = cert.progress_id::text
      AND log.acao = 'Atualizou' AND log.origem = 'Auditoria'
      AND log.actor_id = cert.auth_user_id
      AND log.detalhes -> 'camposAlterados' = '["progress"]'::jsonb
      AND log.created_at >= greatest(cert.data_matricula, cert.data_inscricao)
      AND log.created_at < cert.approved_at - interval '1 second'
    ORDER BY log.created_at, log.id
    LIMIT 1
  ) first_activity
  WHERE abs(extract(epoch FROM cert.created_at - cert.approved_at)) < 1
    AND cert.emitido_em >= cert.approved_at - interval '1 second'
    AND cert.data_conclusao IN (
      (cert.approved_at AT TIME ZONE 'UTC')::date,
      (cert.approved_at AT TIME ZONE 'America/Maceio')::date
    )
    AND EXISTS (
      SELECT 1 FROM public.sistema_eventos issuance_event
      WHERE issuance_event.entidade = 'certificados_academicos'
        AND issuance_event.entidade_id::text = cert.id::text
        AND issuance_event.acao = 'Criou' AND issuance_event.origem = 'Auditoria'
        AND abs(extract(epoch FROM issuance_event.created_at - cert.approved_at)) < 1
    );
$$;

CREATE FUNCTION public.secretaria_get_ead_certificate_study_evidence(p_certificado_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_polo_id uuid;
BEGIN
  SELECT polo_id INTO v_polo_id
  FROM public.certificados_academicos
  WHERE id = p_certificado_id AND modalidade = 'EAD' AND status = 'FINALIZADO';

  IF auth.uid() IS NULL OR v_polo_id IS NULL
    OR NOT coalesce(public.can_manage_secretaria_document('certificado_ead', v_polo_id), false) THEN
    RAISE EXCEPTION 'Acesso ao certificado EAD não autorizado.' USING ERRCODE = '42501';
  END IF;

  RETURN internal_academic.ead_historical_study_evidence(p_certificado_id);
END;
$$;

REVOKE ALL ON FUNCTION internal_academic.ead_historical_study_evidence(uuid),
  public.secretaria_get_ead_certificate_study_evidence(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.secretaria_get_ead_certificate_study_evidence(uuid) TO authenticated;

COMMIT;
