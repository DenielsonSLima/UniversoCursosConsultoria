-- Alinha a autorização do dashboard com as abas efetivas usadas pelo frontend.
-- Esta migração não cria, altera nem consulta títulos bancários.

BEGIN;

CREATE OR REPLACE FUNCTION public.gestor_has_effective_financeiro_tab(p_tab text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permissions jsonb;
  v_legacy_tabs jsonb;
  v_scoped_tabs jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') = 'service_role' THEN
    RETURN true;
  END IF;

  IF NOT public.gestor_has_module('financeiro') THEN
    RETURN false;
  END IF;

  v_permissions := public.gestor_effective_permissions();
  v_legacy_tabs := v_permissions -> 'financeiroTabs';
  v_scoped_tabs := v_permissions -> 'tabs' -> 'financeiro';

  -- O formato granular prevalece quando possui ao menos uma aba. Um array
  -- granular vazio mantém a compatibilidade com financeiroTabs legado.
  IF jsonb_typeof(v_scoped_tabs) = 'array'
    AND jsonb_array_length(v_scoped_tabs) > 0 THEN
    RETURN v_scoped_tabs ? p_tab;
  END IF;

  RETURN jsonb_typeof(v_legacy_tabs) = 'array'
    AND v_legacy_tabs ? p_tab;
END;
$$;

REVOKE ALL ON FUNCTION public.gestor_has_effective_financeiro_tab(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_has_effective_financeiro_tab(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.gestor_has_dashboard_widget(p_widget text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permissions jsonb;
  v_selected boolean;
  v_eligible boolean := false;
  v_academic_overview boolean;
  v_academic_activity boolean;
  v_financial boolean;
  v_cash_flow boolean;
  v_secretaria_alunos boolean;
BEGIN
  IF coalesce((SELECT auth.role()), '') = 'service_role' THEN
    RETURN true;
  END IF;

  IF NOT public.gestor_has_module('inicio') THEN
    RETURN false;
  END IF;

  v_permissions := public.gestor_effective_permissions();
  v_selected := CASE
    WHEN NOT coalesce(v_permissions ? 'dashboardWidgets', false) THEN true
    WHEN jsonb_typeof(v_permissions -> 'dashboardWidgets') <> 'array' THEN false
    ELSE (v_permissions -> 'dashboardWidgets') ? p_widget
  END;

  IF NOT v_selected THEN
    RETURN false;
  END IF;

  -- Busca de Aluno 360º é uma operação explícita. Outras declarações da
  -- Secretaria não concedem acesso a agregados ou atividades acadêmicas.
  v_secretaria_alunos :=
    public.gestor_has_module('secretaria')
    AND jsonb_typeof(v_permissions -> 'tabs' -> 'secretaria') = 'array'
    AND (v_permissions -> 'tabs' -> 'secretaria') ? 'alunos';

  v_academic_overview :=
    public.gestor_has_module('parceiros')
    OR public.gestor_has_tab('gestao', 'resumo')
    OR public.gestor_has_tab('gestao', 'alunos')
    OR v_secretaria_alunos;

  v_academic_activity :=
    public.gestor_has_module('parceiros')
    OR public.gestor_has_tab('gestao', 'alunos')
    OR v_secretaria_alunos;

  v_financial :=
    public.gestor_has_effective_financeiro_tab('resumo')
    OR public.gestor_has_effective_financeiro_tab('receber');

  v_cash_flow := public.gestor_has_effective_financeiro_tab('resumo');

  v_eligible := CASE p_widget
    WHEN 'alunos-ativos' THEN v_academic_overview
    WHEN 'matriculas-mes' THEN v_academic_overview
    WHEN 'receita-mes' THEN v_financial
    WHEN 'inadimplencia' THEN v_financial
    WHEN 'fluxo-caixa' THEN v_cash_flow
    WHEN 'acoes-rapidas' THEN
      public.gestor_has_module('parceiros')
      OR public.gestor_has_module('cadastros')
      OR public.gestor_has_module('caixa')
    WHEN 'atividade-recente' THEN
      v_academic_activity
      OR v_financial
      OR public.gestor_has_module('biblioteca')
    ELSE false
  END;

  RETURN v_eligible;
END;
$$;

REVOKE ALL ON FUNCTION public.gestor_has_dashboard_widget(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_has_dashboard_widget(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(
  p_polo_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  tipo_atividade text,
  titulo text,
  descricao text,
  data_evento timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_permissions jsonb;
  v_secretaria_alunos boolean;
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

  v_permissions := public.gestor_effective_permissions();
  v_secretaria_alunos := v_service_role OR (
    public.gestor_has_module('secretaria')
    AND jsonb_typeof(v_permissions -> 'tabs' -> 'secretaria') = 'array'
    AND (v_permissions -> 'tabs' -> 'secretaria') ? 'alunos'
  );
  v_academic := v_service_role
    OR public.gestor_has_module('parceiros')
    OR public.gestor_has_tab('gestao', 'alunos')
    OR v_secretaria_alunos;
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
      m.data_matricula::timestamptz AS data_evento
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
      d.created_at
    FROM public.biblioteca_documentos d
    WHERE v_library
      AND (p_polo_id IS NULL OR d.polo_id = p_polo_id OR d.polo_id IS NULL)
  ) activity
  ORDER BY activity.data_evento DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_recent_activity(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.gestor_has_effective_financeiro_tab(text) IS
  'Resolve a aba financeira efetiva com a mesma precedência entre tabs.financeiro e financeiroTabs usada pelo portal.';
COMMENT ON FUNCTION public.gestor_has_dashboard_widget(text) IS
  'Autoriza widgets do dashboard pela interseção entre seleção do perfil, módulos e abas granulares efetivas.';
COMMENT ON FUNCTION public.get_dashboard_recent_activity(uuid, integer) IS
  'Retorna somente categorias de atividade compatíveis com as permissões granulares do gestor.';

COMMIT;
