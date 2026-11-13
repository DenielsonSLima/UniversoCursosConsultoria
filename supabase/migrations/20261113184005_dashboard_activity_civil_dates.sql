-- Mantém a RPC original para clientes antigos. Nenhum registro é alterado.
-- A chave legada serve apenas à ordenação; não é exposta como hora de pagamento.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity_v2(
  p_polo_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  tipo_atividade text,
  titulo text,
  descricao text,
  data_evento text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_academic boolean;
  v_financial boolean;
  v_library boolean;
BEGIN
  IF p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Limite de atividades inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_service_role AND NOT (
    public.gestor_has_dashboard_widget('atividade-recente')
    AND (
      (p_polo_id IS NULL AND public.gestor_has_all_polos())
      OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso às atividades recentes não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_academic := v_service_role
    OR public.gestor_has_module('parceiros')
    OR public.gestor_has_tab('gestao', 'alunos')
    OR public.gestor_has_dashboard_secretaria_alunos();
  v_financial := v_service_role
    OR public.gestor_has_effective_financeiro_tab('resumo')
    OR public.gestor_has_effective_financeiro_tab('receber');
  v_library := v_service_role OR public.gestor_has_module('biblioteca');

  RETURN QUERY
  SELECT activity.tipo_atividade, activity.titulo, activity.descricao, activity.data_evento
  FROM (
    SELECT
      'matricula'::text AS tipo_atividade,
      p.nome::text AS titulo,
      ('Realizou matrícula no curso ' || c.nome || ' - ' || t.nome)::text AS descricao,
      to_jsonb(m.data_matricula) #>> '{}' AS data_evento,
      m.data_matricula::timestamptz AS data_ordenacao
    FROM public.matriculas m
    JOIN public.parceiros p ON p.id = m.aluno_id
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE v_academic
      AND (
        p_polo_id IS NULL
        OR p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
      )

    UNION ALL

    SELECT
      'pagamento'::text,
      p.nome::text,
      ('Efetuou o pagamento de: ' || cr.descricao)::text,
      to_char(cr.data_pagamento, 'YYYY-MM-DD'),
      coalesce(cr.data_pagamento::timestamptz, cr.created_at)
    FROM public.contas_receber cr
    JOIN public.parceiros p ON p.id = cr.cliente_id
    WHERE v_financial
      AND cr.status = 'PAGO'
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)

    UNION ALL

    SELECT
      'documento'::text,
      d.author_name::text,
      ('Enviou o documento: ' || d.titulo)::text,
      to_jsonb(d.created_at) #>> '{}',
      d.created_at
    FROM public.biblioteca_documentos d
    WHERE v_library
      AND (p_polo_id IS NULL OR d.polo_id = p_polo_id OR d.polo_id IS NULL)
  ) activity
  ORDER BY activity.data_ordenacao DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_recent_activity_v2(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity_v2(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dashboard_recent_activity_v2(uuid, integer) IS
  'Atividades com timestamps ISO e offset para matrícula/documento e data civil para pagamento; data ausente permanece nula.';

COMMIT;
