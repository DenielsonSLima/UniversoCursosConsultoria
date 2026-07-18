BEGIN;

CREATE OR REPLACE FUNCTION public.gestor_has_any_module(p_modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_modules, ARRAY[]::text[])) requested(module_id)
    WHERE public.gestor_has_module(requested.module_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_any_module_for_polo(p_modules text[], p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_any_module(p_modules)
    AND public.is_gestor_for_polo(p_polo_id);
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_any_global_module(p_modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_any_module(p_modules)
    AND public.is_gestor_global();
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_tab(p_module text, p_tab text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_module(p_module)
    AND CASE
      WHEN jsonb_typeof(public.gestor_effective_permissions() -> 'tabs' -> p_module) = 'array' THEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(public.gestor_effective_permissions() -> 'tabs' -> p_module) tab_value(value)
        WHERE tab_value.value = p_tab
      )
      WHEN p_module = 'financeiro' THEN public.gestor_has_financeiro_tab(p_tab)
      WHEN p_module IN ('cadastros', 'secretaria') THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR (
      public.gestor_has_any_module(ARRAY['gestao', 'cadastros'])
      AND EXISTS (
        SELECT 1
        FROM public.turmas t
        WHERE t.id = p_turma_id
          AND public.is_gestor_for_polo(t.polo_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_partner_in_gestor_scope(p_polo_id uuid, p_polo_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_module('parceiros')
    AND (
      public.is_gestor_global()
      OR (
        public.is_gestor()
        AND (
          p_polo_id IS NULL
          OR p_polo_id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
          OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(p_polo_ids, ARRAY[]::uuid[])) partner_polo(id)
            WHERE partner_polo.id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
          )
        )
      )
    );
$$;

DO $$
DECLARE
  policy_row record;
  new_qual text;
  new_check text;
  roles_sql text;
  create_sql text;
BEGIN
  FOR policy_row IN
    WITH mapped AS (
      SELECT
        p.*,
        CASE
          WHEN p.tablename IN ('aulas', 'categorias', 'config_checklist_estagio', 'cursos', 'disciplinas', 'modelos_fichas', 'modulos')
            THEN ARRAY['cadastros']::text[]
          WHEN p.tablename IN ('biblioteca_documentos', 'biblioteca_pastas', 'biblioteca_professor_quotas')
            THEN ARRAY['biblioteca']::text[]
          WHEN p.tablename IN ('certificados_academicos', 'documentos_validacao', 'documentos_validacao_politicas', 'secretaria_config', 'secretaria_solicitacoes')
            THEN ARRAY['secretaria']::text[]
          WHEN p.tablename IN ('comunicacao_categorias', 'comunicacao_chats', 'comunicacao_config', 'comunicacao_mensagens', 'mensageria_config', 'templates_mensagens', 'site_publico_ticker_mensagens')
            THEN ARRAY['comunicacao', 'configuracoes']::text[]
          WHEN p.tablename LIKE 'whatsapp_%'
            THEN ARRAY['comunicacao']::text[]
          WHEN p.tablename IN ('contas_pagar', 'contas_receber', 'payment_gateway_customers', 'payment_gateway_transactions')
            THEN ARRAY['financeiro']::text[]
          WHEN p.tablename IN ('contas_bancarias', 'regras_cobranca', 'taxas_pagamento', 'asaas_config', 'asaas_webhook_events', 'payment_gateway_credentials', 'payment_gateway_issuer_config', 'payment_gateway_providers', 'payment_gateway_routes')
            THEN ARRAY['financeiro', 'caixa', 'configuracoes']::text[]
          WHEN p.tablename = 'transferencias_contas'
            THEN ARRAY['financeiro', 'caixa']::text[]
          WHEN p.tablename IN ('ead_aluno_progresso', 'inscricoes_online', 'turmas')
            THEN ARRAY['gestao', 'cadastros']::text[]
          WHEN p.tablename = 'documentos_templates'
            THEN ARRAY['cadastros', 'secretaria', 'configuracoes']::text[]
          ELSE NULL
        END AS required_modules
      FROM pg_policies p
      WHERE p.schemaname = 'public'
    )
    SELECT *
    FROM mapped
    WHERE required_modules IS NOT NULL
      AND (
        coalesce(qual, '') LIKE '%is_gestor%'
        OR coalesce(with_check, '') LIKE '%is_gestor%'
      )
  LOOP
    new_qual := policy_row.qual;
    new_check := policy_row.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'is_gestor_for_polo(', format('gestor_has_any_module_for_polo(%L::text[], ', policy_row.required_modules));
      new_qual := replace(new_qual, 'is_gestor_global()', format('gestor_has_any_global_module(%L::text[])', policy_row.required_modules));
      new_qual := replace(new_qual, 'is_gestor()', format('gestor_has_any_module(%L::text[])', policy_row.required_modules));
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'is_gestor_for_polo(', format('gestor_has_any_module_for_polo(%L::text[], ', policy_row.required_modules));
      new_check := replace(new_check, 'is_gestor_global()', format('gestor_has_any_global_module(%L::text[])', policy_row.required_modules));
      new_check := replace(new_check, 'is_gestor()', format('gestor_has_any_module(%L::text[])', policy_row.required_modules));
    END IF;

    SELECT string_agg(quote_ident(role_name), ', ')
      INTO roles_sql
    FROM unnest(policy_row.roles) role_name;

    EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);

    create_sql := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
      policy_row.policyname,
      policy_row.tablename,
      policy_row.permissive,
      policy_row.cmd,
      roles_sql
    );
    IF new_qual IS NOT NULL THEN
      create_sql := create_sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      create_sql := create_sql || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE create_sql;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.gestor_has_any_module(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestor_has_any_module_for_polo(text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestor_has_any_global_module(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gestor_has_any_module(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_has_any_module_for_polo(text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_has_any_global_module(text[]) TO authenticated, service_role;

COMMIT;
