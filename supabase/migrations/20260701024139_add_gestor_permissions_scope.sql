-- Escopo granular de usuarios gestores: polos permitidos, modulos e abas.

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS polo_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS permissoes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_polo_ids
  ON public.usuarios_sistema USING gin (polo_ids);

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_permissoes
  ON public.usuarios_sistema USING gin (permissoes);

UPDATE public.usuarios_sistema u
SET polo_ids = ARRAY[u.context::uuid]
WHERE u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.polos p
    WHERE p.id = u.context::uuid
      AND coalesce(p.is_matriz, false) = true
  );

UPDATE public.usuarios_sistema u
SET permissoes = jsonb_build_object(
  'modules',
  to_jsonb(ARRAY[
    'inicio',
    'parceiros',
    'cadastros',
    'gestao',
    'secretaria',
    'caixa',
    'financeiro',
    'biblioteca',
    'calendario',
    'comunicacao',
    'relatorios',
    'configuracoes'
  ]::text[]),
  'financeiroTabs',
  to_jsonb(ARRAY[
    'resumo',
    'receber',
    'despesas',
    'transferencias',
    'outros-debitos',
    'outros-creditos'
  ]::text[]),
  'allPolos',
  CASE
    WHEN lower(coalesce(u.context, '')) = 'global' THEN true
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN EXISTS (
      SELECT 1
      FROM public.polos p
      WHERE p.id = u.context::uuid
        AND coalesce(p.is_matriz, false) = true
    )
    ELSE false
  END
)
WHERE coalesce(u.permissoes, '{}'::jsonb) = '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.gestor_allowed_polo_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) > 0
      THEN u.polo_ids
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ARRAY[u.context::uuid]
    ELSE ARRAY[]::uuid[]
  END
  FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_all_polos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    LEFT JOIN public.polos p
      ON p.id = CASE
        WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN u.context::uuid
        ELSE NULL::uuid
      END
    WHERE lower(u.email) = public.auth_email()
      AND public.is_active_status(u.status)
      AND cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) = 0
      AND CASE
        WHEN u.permissoes ? 'allPolos'
          THEN coalesce((u.permissoes ->> 'allPolos')::boolean, false)
        ELSE (
          lower(coalesce(u.context, '')) = 'global'
          OR coalesce(p.is_matriz, false) = true
        )
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_module(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE lower(u.email) = public.auth_email()
      AND public.is_active_status(u.status)
      AND CASE
        WHEN jsonb_typeof(coalesce(u.permissoes -> 'modules', '[]'::jsonb)) = 'array' THEN (
          jsonb_array_length(coalesce(u.permissoes -> 'modules', '[]'::jsonb)) = 0
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(coalesce(u.permissoes -> 'modules', '[]'::jsonb)) module_value(value)
            WHERE module_value.value = p_module
              OR (p_module = 'inicio' AND module_value.value = 'dashboard')
          )
        )
        ELSE true
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_financeiro_tab(p_tab text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE lower(u.email) = public.auth_email()
      AND public.is_active_status(u.status)
      AND public.gestor_has_module('financeiro')
      AND CASE
        WHEN jsonb_typeof(coalesce(u.permissoes -> 'financeiroTabs', '[]'::jsonb)) = 'array' THEN (
          jsonb_array_length(coalesce(u.permissoes -> 'financeiroTabs', '[]'::jsonb)) = 0
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(coalesce(u.permissoes -> 'financeiroTabs', '[]'::jsonb)) tab_value(value)
            WHERE tab_value.value = p_tab
          )
        )
        ELSE true
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.gestor_polo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.gestor_allowed_polo_ids())[1];
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_global()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_all_polos();
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_for_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_gestor_global()
    OR (
      public.is_gestor()
      AND (
        p_polo_id IS NULL
        OR p_polo_id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
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
  SELECT public.is_gestor_global()
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
    );
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro_operador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_gestor()
    AND (
      public.gestor_has_module('financeiro')
      OR public.gestor_has_module('caixa')
    );
$$;

CREATE OR REPLACE FUNCTION public.financeiro_polo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_polo_id();
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro_global()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_financeiro_operador() AND public.is_gestor_global();
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro_for_polo(p_polo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_financeiro_global()
    OR (
      p_polo_id IS NOT NULL
      AND public.is_financeiro_operador()
      AND p_polo_id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_parceiro_in_financeiro_scope(
  p_parceiro_id uuid,
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_financeiro_global()
    OR EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE p.id = p_parceiro_id
        AND p_polo_id IS NOT NULL
        AND public.is_financeiro_operador()
        AND (
          p.polo_id = p_polo_id
          OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
        )
        AND p_polo_id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
    );
$$;

GRANT EXECUTE ON FUNCTION public.gestor_allowed_polo_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_has_all_polos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_has_module(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_has_financeiro_tab(text) TO authenticated, service_role;
