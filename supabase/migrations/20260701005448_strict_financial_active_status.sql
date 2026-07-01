-- Endurece o status ativo usado pelas rotinas financeiras.
-- O helper global is_active_status permanece intocado para nao afetar telas legadas.

CREATE OR REPLACE FUNCTION public.is_financeiro_operador()
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
      AND lower(coalesce(u.status, '')) IN ('ativo', 'active')
      AND lower(coalesce(u.perfil, '')) IN ('gestor', 'financeiro')
  );
$$;

CREATE OR REPLACE FUNCTION public.financeiro_polo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN u.context::uuid
    ELSE NULL::uuid
  END
  FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email()
    AND lower(coalesce(u.status, '')) IN ('ativo', 'active')
    AND lower(coalesce(u.perfil, '')) IN ('gestor', 'financeiro')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro_global()
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
      AND lower(coalesce(u.status, '')) IN ('ativo', 'active')
      AND lower(coalesce(u.perfil, '')) IN ('gestor', 'financeiro')
      AND (
        lower(coalesce(u.context, '')) = 'global'
        OR coalesce(p.is_matriz, false) = true
      )
  );
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
      AND public.financeiro_polo_id() = p_polo_id
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
        AND (
          p.polo_id = p_polo_id
          OR p_polo_id = ANY(coalesce(p.polo_ids, ARRAY[]::uuid[]))
        )
        AND public.financeiro_polo_id() = p_polo_id
    );
$$;
