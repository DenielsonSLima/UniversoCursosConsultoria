-- Restringe relatórios SECURITY DEFINER ao módulo e escopo de polo/turma.
-- As implementações existentes são preservadas como funções internas para
-- evitar duplicar cálculos acadêmicos ou financeiros no frontend.

BEGIN;

ALTER FUNCTION public.get_dashboard_kpis(uuid)
  RENAME TO internal_get_dashboard_kpis_20260719;

REVOKE ALL ON FUNCTION public.internal_get_dashboard_kpis_20260719(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_dashboard_kpis_20260719(uuid)
  TO service_role;

CREATE FUNCTION public.get_dashboard_kpis(p_polo_id uuid DEFAULT NULL)
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
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT (
    public.gestor_has_module('inicio')
    AND (
      (p_polo_id IS NULL AND public.gestor_has_all_polos())
      OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso aos indicadores do painel não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.internal_get_dashboard_kpis_20260719(p_polo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid)
  TO authenticated, service_role;

ALTER FUNCTION public.get_gestao_resumo_kpis(uuid)
  RENAME TO internal_get_gestao_resumo_kpis_20260719;

REVOKE ALL ON FUNCTION public.internal_get_gestao_resumo_kpis_20260719(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_gestao_resumo_kpis_20260719(uuid)
  TO service_role;

CREATE FUNCTION public.get_gestao_resumo_kpis(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT (
    public.gestor_has_module('gestao')
    AND (
      (p_polo_id IS NULL AND public.gestor_has_all_polos())
      OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso ao resumo de gestão não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.internal_get_gestao_resumo_kpis_20260719(p_polo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_gestao_resumo_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gestao_resumo_kpis(uuid)
  TO authenticated, service_role;

ALTER FUNCTION public.get_turma_resumo_academico(uuid)
  RENAME TO internal_get_turma_resumo_academico_20260719;

REVOKE ALL ON FUNCTION public.internal_get_turma_resumo_academico_20260719(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_turma_resumo_academico_20260719(uuid)
  TO service_role;

CREATE FUNCTION public.get_turma_resumo_academico(p_turma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT (
    public.gestor_has_module('gestao')
    AND public.can_write_turma(p_turma_id)
  ) THEN
    RAISE EXCEPTION 'Acesso ao resumo acadêmico da turma não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.internal_get_turma_resumo_academico_20260719(p_turma_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_turma_resumo_academico(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_turma_resumo_academico(uuid)
  TO authenticated, service_role;

ALTER FUNCTION public.get_sistema_eventos(integer, integer, text, text, text, text, uuid)
  RENAME TO internal_get_sistema_eventos_20260719;

REVOKE ALL ON FUNCTION public.internal_get_sistema_eventos_20260719(
  integer, integer, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_sistema_eventos_20260719(
  integer, integer, text, text, text, text, uuid
) TO service_role;

CREATE FUNCTION public.get_sistema_eventos(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_modulo text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_actor_tipo text DEFAULT NULL,
  p_pessoa_tipo text DEFAULT NULL,
  p_polo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text,
  data_evento timestamptz,
  usuario_nome text,
  usuario_email text,
  usuario_tipo text,
  pessoa_nome text,
  pessoa_tipo text,
  polo_id uuid,
  polo_nome text,
  modulo text,
  entidade text,
  acao text,
  descricao text,
  entidade_id text,
  origem text,
  detalhes jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT (
    public.gestor_has_module('configuracoes')
    AND (
      (p_polo_id IS NULL AND public.gestor_has_all_polos())
      OR (p_polo_id IS NOT NULL AND public.is_gestor_for_polo(p_polo_id))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso aos logs do sistema não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.internal_get_sistema_eventos_20260719(
    p_page,
    p_page_size,
    p_modulo,
    p_search,
    p_actor_tipo,
    p_pessoa_tipo,
    p_polo_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sistema_eventos(
  integer, integer, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sistema_eventos(
  integer, integer, text, text, text, text, uuid
) TO authenticated, service_role;

COMMIT;
