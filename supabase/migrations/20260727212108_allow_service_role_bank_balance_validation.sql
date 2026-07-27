BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_conta_bancaria(
  p_conta_bancaria_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
  OR public.gestor_has_any_global_module(
    ARRAY['financeiro', 'caixa', 'configuracoes']
  )
  OR EXISTS (
    SELECT 1
    FROM public.contas_bancarias_polos acesso
    WHERE acesso.conta_bancaria_id = p_conta_bancaria_id
      AND public.gestor_has_any_module_for_polo(
        ARRAY['financeiro', 'caixa', 'configuracoes'],
        acesso.polo_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_conta_bancaria(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_conta_bancaria(uuid)
  TO authenticated, service_role;

COMMIT;
