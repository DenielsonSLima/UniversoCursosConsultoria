-- Fecha o bypass de escopo causado por polo_id nulo em Parceiros.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_partner_in_gestor_scope(
  p_polo_id uuid,
  p_polo_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.gestor_has_module('parceiros')
    AND (
      public.is_gestor_global()
      OR (
        public.is_gestor()
        AND (
          (
            p_polo_id IS NOT NULL
            AND p_polo_id = ANY(
              coalesce(
                public.gestor_allowed_polo_ids(),
                ARRAY[]::uuid[]
              )
            )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(
              coalesce(p_polo_ids, ARRAY[]::uuid[])
            ) AS partner_polo(id)
            WHERE partner_polo.id IS NOT NULL
              AND partner_polo.id = ANY(
                coalesce(
                  public.gestor_allowed_polo_ids(),
                  ARRAY[]::uuid[]
                )
              )
          )
        )
      )
    );
$function$;

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
  SELECT public.gestor_has_any_module(
    ARRAY[
      'inicio',
      'parceiros',
      'cadastros',
      'gestao',
      'secretaria',
      'financeiro',
      'caixa',
      'relatorios'
    ]::text[]
  )
    AND (
      public.is_gestor_global()
      OR (
        public.is_gestor()
        AND (
          (
            p_polo_id IS NOT NULL
            AND p_polo_id = ANY(
              coalesce(
                public.gestor_allowed_polo_ids(),
                ARRAY[]::uuid[]
              )
            )
          )
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(
              coalesce(p_polo_ids, ARRAY[]::uuid[])
            ) AS partner_polo(id)
            WHERE partner_polo.id IS NOT NULL
              AND partner_polo.id = ANY(
                coalesce(
                  public.gestor_allowed_polo_ids(),
                  ARRAY[]::uuid[]
                )
              )
          )
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.is_partner_in_gestor_scope(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_partner_in_gestor_scope(uuid, uuid[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.is_partner_in_gestor_scope(uuid, uuid[]) IS
  'Autoriza escrita em Parceiros somente por módulo e interseção explícita de polo; escopo global permanece permitido.';
COMMENT ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[]) IS
  'Autoriza leitura de Parceiros somente por módulo e interseção explícita de polo; escopo global permanece permitido.';

COMMIT;
