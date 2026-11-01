-- O início consome RPCs agregadas e não concede leitura do cadastro completo.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_partner_in_gestor_read_scope(
  p_polo_id uuid,
  p_polo_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND public.is_gestor()
    AND public.gestor_has_any_module(
      ARRAY[
        'parceiros', 'cadastros', 'gestao', 'secretaria',
        'financeiro', 'caixa', 'relatorios'
      ]::text[]
    )
    AND (
      public.is_gestor_global()
      OR (
        p_polo_id IS NOT NULL
        AND p_polo_id = ANY(coalesce(
          public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]
        ))
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(
          coalesce(p_polo_ids, ARRAY[]::uuid[])
        ) AS partner_polo(id)
        WHERE partner_polo.id IS NOT NULL
          AND partner_polo.id = ANY(coalesce(
            public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]
          ))
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[]) IS
  'Leitura operacional de cadastros por polo. Início/dashboard usa RPCs próprias e não autoriza o cadastro completo.';

COMMIT;
