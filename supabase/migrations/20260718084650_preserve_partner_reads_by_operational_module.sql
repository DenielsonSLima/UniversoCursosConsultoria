BEGIN;

CREATE OR REPLACE FUNCTION public.is_partner_in_gestor_read_scope(p_polo_id uuid, p_polo_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_any_module(
    ARRAY['parceiros', 'cadastros', 'gestao', 'secretaria', 'financeiro', 'caixa', 'relatorios']
  )
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

DROP POLICY IF EXISTS portal_parceiros_select ON public.parceiros;
CREATE POLICY portal_parceiros_select
ON public.parceiros
FOR SELECT
TO authenticated
USING (
  id = public.current_aluno_id()
  OR id = public.current_professor_id()
  OR public.is_partner_in_gestor_read_scope(polo_id, polo_ids)
);

REVOKE ALL ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_partner_in_gestor_read_scope(uuid, uuid[]) TO authenticated, service_role;

COMMIT;
