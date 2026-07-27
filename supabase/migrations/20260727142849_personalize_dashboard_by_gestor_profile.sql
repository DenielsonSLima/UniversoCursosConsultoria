-- Personaliza o dashboard por perfil e impede que RPCs exponham indicadores
-- fora dos módulos, abas e widgets efetivamente concedidos ao gestor.

BEGIN;

ALTER TABLE public.perfis_acesso
  DROP CONSTRAINT IF EXISTS perfis_acesso_dashboard_widgets_shape;

ALTER TABLE public.perfis_acesso
  ADD CONSTRAINT perfis_acesso_dashboard_widgets_shape CHECK (
    NOT (permissoes ? 'dashboardWidgets')
    OR (
      jsonb_typeof(permissoes -> 'dashboardWidgets') = 'array'
      AND (permissoes -> 'dashboardWidgets') <@ '[
        "alunos-ativos",
        "receita-mes",
        "inadimplencia",
        "matriculas-mes",
        "fluxo-caixa",
        "acoes-rapidas",
        "atividade-recente"
      ]'::jsonb
    )
  ) NOT VALID;

ALTER TABLE public.perfis_acesso
  VALIDATE CONSTRAINT perfis_acesso_dashboard_widgets_shape;

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
  v_academic boolean;
  v_financial boolean;
  v_cash_flow boolean;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
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

  v_academic :=
    public.gestor_has_module('parceiros')
    OR public.gestor_has_module('cadastros')
    OR public.gestor_has_module('gestao')
    OR public.gestor_has_module('secretaria');

  v_financial :=
    public.gestor_has_module('financeiro')
    AND (
      public.gestor_has_financeiro_tab('resumo')
      OR public.gestor_has_financeiro_tab('receber')
    );

  v_cash_flow :=
    public.gestor_has_module('financeiro')
    AND public.gestor_has_financeiro_tab('resumo');

  v_eligible := CASE p_widget
    WHEN 'alunos-ativos' THEN v_academic
    WHEN 'matriculas-mes' THEN v_academic
    WHEN 'receita-mes' THEN v_financial
    WHEN 'inadimplencia' THEN v_financial
    WHEN 'fluxo-caixa' THEN v_cash_flow
    WHEN 'acoes-rapidas' THEN
      public.gestor_has_module('parceiros')
      OR public.gestor_has_module('cadastros')
      OR public.gestor_has_module('caixa')
    WHEN 'atividade-recente' THEN
      v_academic
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

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_polo_id uuid DEFAULT NULL)
RETURNS TABLE (
  alunos_ativos bigint,
  alunos_ativos_mudanca numeric,
  receita_mes numeric,
  receita_mes_mudanca numeric,
  taxa_inadimplencia numeric,
  taxa_inadimplencia_mudanca numeric,
  novas_matriculas bigint,
  novas_matriculas_mudanca numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_can_alunos boolean;
  v_can_receita boolean;
  v_can_inadimplencia boolean;
  v_can_matriculas boolean;
  v_inicio_mes_atual date := date_trunc('month', current_date)::date;
  v_fim_mes_atual date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_inicio_mes_anterior date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_fim_mes_anterior date := (date_trunc('month', current_date) - interval '1 day')::date;
  v_alunos_ativos bigint;
  v_alunos_ativos_anterior bigint;
  v_receita_mes numeric;
  v_receita_mes_anterior numeric;
  v_total_vencido numeric;
  v_total_recebido numeric;
  v_taxa_inadimplencia numeric;
  v_total_vencido_anterior numeric;
  v_total_recebido_anterior numeric;
  v_taxa_inadimplencia_anterior numeric;
  v_novas_matriculas bigint;
  v_novas_matriculas_anterior bigint;
BEGIN
  IF NOT v_service_role AND NOT (
    public.gestor_has_module('inicio')
    AND (
      (p_polo_id IS NULL AND public.gestor_has_all_polos())
      OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso aos indicadores do painel não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_can_alunos := public.gestor_has_dashboard_widget('alunos-ativos');
  v_can_receita := public.gestor_has_dashboard_widget('receita-mes');
  v_can_inadimplencia := public.gestor_has_dashboard_widget('inadimplencia');
  v_can_matriculas := public.gestor_has_dashboard_widget('matriculas-mes');

  IF NOT v_service_role AND NOT (
    v_can_alunos OR v_can_receita OR v_can_inadimplencia OR v_can_matriculas
  ) THEN
    RAISE EXCEPTION 'Nenhum indicador do painel foi concedido ao perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF v_can_alunos THEN
    SELECT count(*)
      INTO v_alunos_ativos
    FROM public.parceiros p
    WHERE p.tipo = 'Aluno'
      AND p.status = 'ATIVO'
      AND (
        p_polo_id IS NULL
        OR p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
      );

    SELECT count(*)
      INTO v_alunos_ativos_anterior
    FROM public.parceiros p
    WHERE p.tipo = 'Aluno'
      AND p.status = 'ATIVO'
      AND p.created_at < v_inicio_mes_atual
      AND (
        p_polo_id IS NULL
        OR p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
      );

    alunos_ativos := v_alunos_ativos;
    alunos_ativos_mudanca := round(
      (
        (v_alunos_ativos - v_alunos_ativos_anterior)::numeric
        / coalesce(nullif(v_alunos_ativos_anterior, 0), 1)
      ) * 100,
      1
    );
  END IF;

  IF v_can_receita THEN
    SELECT coalesce(sum(coalesce(cr.valor_pago, cr.valor)), 0)
      INTO v_receita_mes
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND (
        cr.data_pagamento BETWEEN v_inicio_mes_atual AND v_fim_mes_atual
        OR (
          cr.data_pagamento IS NULL
          AND cr.data_vencimento BETWEEN v_inicio_mes_atual AND v_fim_mes_atual
        )
      )
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

    SELECT coalesce(sum(coalesce(cr.valor_pago, cr.valor)), 0)
      INTO v_receita_mes_anterior
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND (
        cr.data_pagamento BETWEEN v_inicio_mes_anterior AND v_fim_mes_anterior
        OR (
          cr.data_pagamento IS NULL
          AND cr.data_vencimento BETWEEN v_inicio_mes_anterior AND v_fim_mes_anterior
        )
      )
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

    receita_mes := v_receita_mes;
    receita_mes_mudanca := round(
      (
        (v_receita_mes - v_receita_mes_anterior)::numeric
        / coalesce(nullif(v_receita_mes_anterior, 0), 1)
      ) * 100,
      1
    );
  END IF;

  IF v_can_inadimplencia THEN
    SELECT coalesce(sum(cr.valor), 0)
      INTO v_total_vencido
    FROM public.contas_receber cr
    WHERE cr.status <> 'PAGO'
      AND cr.data_vencimento < current_date
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

    SELECT coalesce(sum(coalesce(cr.valor_pago, cr.valor)), 0)
      INTO v_total_recebido
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

    v_taxa_inadimplencia := round(
      (
        v_total_vencido::numeric
        / coalesce(nullif(v_total_recebido + v_total_vencido, 0), 1)
      ) * 100,
      1
    );

    SELECT coalesce(sum(cr.valor), 0)
      INTO v_total_vencido_anterior
    FROM public.contas_receber cr
    WHERE cr.status <> 'PAGO'
      AND cr.data_vencimento <= v_fim_mes_anterior
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

    SELECT coalesce(sum(coalesce(cr.valor_pago, cr.valor)), 0)
      INTO v_total_recebido_anterior
    FROM public.contas_receber cr
    WHERE cr.status = 'PAGO'
      AND (
        cr.data_pagamento <= v_fim_mes_anterior
        OR (cr.data_pagamento IS NULL AND cr.data_vencimento <= v_fim_mes_anterior)
      )
      AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id);

    v_taxa_inadimplencia_anterior := round(
      (
        v_total_vencido_anterior::numeric
        / coalesce(nullif(v_total_recebido_anterior + v_total_vencido_anterior, 0), 1)
      ) * 100,
      1
    );

    taxa_inadimplencia := v_taxa_inadimplencia;
    taxa_inadimplencia_mudanca := round(
      v_taxa_inadimplencia - v_taxa_inadimplencia_anterior,
      1
    );
  END IF;

  IF v_can_matriculas THEN
    SELECT count(*)
      INTO v_novas_matriculas
    FROM public.matriculas m
    JOIN public.parceiros p ON p.id = m.aluno_id
    WHERE m.data_matricula BETWEEN v_inicio_mes_atual AND v_fim_mes_atual
      AND (
        p_polo_id IS NULL
        OR p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
      );

    SELECT count(*)
      INTO v_novas_matriculas_anterior
    FROM public.matriculas m
    JOIN public.parceiros p ON p.id = m.aluno_id
    WHERE m.data_matricula BETWEEN v_inicio_mes_anterior AND v_fim_mes_anterior
      AND (
        p_polo_id IS NULL
        OR p.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
      );

    novas_matriculas := v_novas_matriculas;
    novas_matriculas_mudanca := round(
      (
        (v_novas_matriculas - v_novas_matriculas_anterior)::numeric
        / coalesce(nullif(v_novas_matriculas_anterior, 0), 1)
      ) * 100,
      1
    );
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_kpis(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_chart_data(
  p_polo_id uuid DEFAULT NULL,
  p_months integer DEFAULT 6
)
RETURNS TABLE (
  mes_num double precision,
  ano_num double precision,
  mes_nome text,
  receitas numeric,
  despesas numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service_role boolean := coalesce(auth.role(), '') = 'service_role';
BEGIN
  IF p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'Período do gráfico inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_service_role AND NOT (
    public.gestor_has_dashboard_widget('fluxo-caixa')
    AND (
      (p_polo_id IS NULL AND public.gestor_has_all_polos())
      OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso ao desempenho de caixa não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH meses AS (
    SELECT
      extract(month FROM date_series)::double precision AS m_num,
      extract(year FROM date_series)::double precision AS a_num,
      date_series::date AS m_date
    FROM generate_series(
      date_trunc('month', current_date) - make_interval(months => p_months - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) date_series
  )
  SELECT
    m.m_num,
    m.a_num,
    CASE m.m_num::integer
      WHEN 1 THEN 'Jan'
      WHEN 2 THEN 'Fev'
      WHEN 3 THEN 'Mar'
      WHEN 4 THEN 'Abr'
      WHEN 5 THEN 'Mai'
      WHEN 6 THEN 'Jun'
      WHEN 7 THEN 'Jul'
      WHEN 8 THEN 'Ago'
      WHEN 9 THEN 'Set'
      WHEN 10 THEN 'Out'
      WHEN 11 THEN 'Nov'
      WHEN 12 THEN 'Dez'
    END,
    coalesce((
      SELECT sum(coalesce(cr.valor_pago, cr.valor))::numeric
      FROM public.contas_receber cr
      WHERE cr.status = 'PAGO'
        AND (
          cr.data_pagamento >= m.m_date
          AND cr.data_pagamento < (m.m_date + interval '1 month')::date
          OR (
            cr.data_pagamento IS NULL
            AND cr.data_vencimento >= m.m_date
            AND cr.data_vencimento < (m.m_date + interval '1 month')::date
          )
        )
        AND (p_polo_id IS NULL OR cr.polo_id = p_polo_id)
    ), 0)::numeric,
    coalesce((
      SELECT sum(coalesce(cp.valor_pago, cp.valor))::numeric
      FROM public.contas_pagar cp
      WHERE cp.status = 'PAGO'
        AND (
          cp.data_pagamento >= m.m_date
          AND cp.data_pagamento < (m.m_date + interval '1 month')::date
          OR (
            cp.data_pagamento IS NULL
            AND cp.data_vencimento >= m.m_date
            AND cp.data_vencimento < (m.m_date + interval '1 month')::date
          )
        )
        AND (p_polo_id IS NULL OR cp.polo_id = p_polo_id)
    ), 0)::numeric
  FROM meses m
  ORDER BY m.m_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_chart_data(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_chart_data(uuid, integer)
  TO authenticated, service_role;

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
  v_service_role boolean := coalesce(auth.role(), '') = 'service_role';
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
    OR public.gestor_has_module('cadastros')
    OR public.gestor_has_module('gestao')
    OR public.gestor_has_module('secretaria');
  v_financial := v_service_role OR (
    public.gestor_has_module('financeiro')
    AND (
      public.gestor_has_financeiro_tab('resumo')
      OR public.gestor_has_financeiro_tab('receber')
    )
  );
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

-- Os endpoints filtrados não são usados pela tela atual e ainda não possuem
-- contrato RBAC equivalente. Permanecem disponíveis apenas para serviço interno.
REVOKE ALL ON FUNCTION public.get_dashboard_kpis_filtered(uuid, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_chart_data_filtered(uuid, integer, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_recent_activity_filtered(uuid, integer, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_aluno_matches_modalidades(uuid, text[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis_filtered(uuid, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_chart_data_filtered(uuid, integer, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity_filtered(uuid, integer, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_aluno_matches_modalidades(uuid, text[])
  TO service_role;

COMMENT ON FUNCTION public.gestor_has_dashboard_widget(text) IS
  'Autoriza widgets do dashboard pela interseção entre seleção do perfil e módulos/abas efetivos.';
COMMENT ON FUNCTION public.get_dashboard_kpis(uuid) IS
  'Retorna somente KPIs concedidos ao perfil; campos não autorizados permanecem nulos.';
COMMENT ON FUNCTION public.get_dashboard_chart_data(uuid, integer) IS
  'Retorna fluxo de caixa somente para perfil com Financeiro/Resumo e widget habilitado.';
COMMENT ON FUNCTION public.get_dashboard_recent_activity(uuid, integer) IS
  'Retorna atividades recentes filtradas pelas áreas acadêmica, financeira e biblioteca autorizadas.';

COMMIT;
