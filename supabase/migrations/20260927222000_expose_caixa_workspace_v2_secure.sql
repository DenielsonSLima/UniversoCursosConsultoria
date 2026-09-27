BEGIN;

CREATE OR REPLACE FUNCTION public.get_caixa_workspace_v2_secure(
  p_company_id uuid,
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT pg_catalog.timezone(
    'America/Maceio', pg_catalog.now()
  )::date,
  p_meses_historico integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_modulo_autorizado boolean;
BEGIN
  IF NOT v_service_role THEN
    IF auth.uid() IS NULL OR NOT coalesce(public.is_gestor(), false) THEN
      RAISE EXCEPTION 'Identidade gestora válida é obrigatória para o Workspace do Caixa.'
        USING ERRCODE = '42501';
    END IF;

    v_modulo_autorizado := CASE
      WHEN p_polo_id IS NULL THEN
        -- allPolos/is_gestor_global é hoje administrador global do sistema,
        -- portanto pode escolher qualquer empresa; o core ainda isola o payload.
        coalesce(public.gestor_has_any_global_module(ARRAY['caixa']), false)
        OR (
          coalesce(public.gestor_has_any_global_module(ARRAY['financeiro']), false)
          AND coalesce(public.gestor_has_effective_financeiro_tab('despesas'), false)
        )
      ELSE
        coalesce(
          public.gestor_has_any_module_for_polo(ARRAY['caixa'], p_polo_id),
          false
        )
        OR (
          coalesce(
            public.gestor_has_any_module_for_polo(
              ARRAY['financeiro'], p_polo_id
            ),
            false
          )
          AND coalesce(public.gestor_has_effective_financeiro_tab('despesas'), false)
        )
    END;

    IF NOT v_modulo_autorizado THEN
      RAISE EXCEPTION 'Módulo, aba ou polo fora do escopo autorizado do Caixa.'
        USING ERRCODE = '42501';
    END IF;

    IF p_company_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.polos authorized_polo
      WHERE authorized_polo.company_id = p_company_id
        AND authorized_polo.status = 'ativo'
        AND (p_polo_id IS NULL OR authorized_polo.id = p_polo_id)
    ) THEN
      RAISE EXCEPTION 'Empresa ou polo fora do escopo autorizado do Caixa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN internal_contas.get_caixa_workspace_v2_company_core(
    p_company_id,
    p_polo_id,
    p_competencia,
    p_meses_historico
  );
END;
$function$;

ALTER FUNCTION public.get_caixa_workspace_v2_secure(
  uuid, uuid, date, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_caixa_workspace_v2_secure(
  uuid, uuid, date, integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_caixa_workspace_v2_secure(
  uuid, uuid, date, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_caixa_workspace_v2_secure(
  uuid, uuid, date, integer
) IS
  'Wrapper público do Caixa Workspace v2. allPolos é administrador global do sistema; demais gestores exigem polo autorizado da empresa. Delega ao core privado company-scoped.';

NOTIFY pgrst, 'reload schema';

COMMIT;
