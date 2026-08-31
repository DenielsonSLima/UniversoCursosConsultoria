BEGIN;

-- As RPCs v3 são SECURITY DEFINER e executáveis por authenticated. O helper
-- precisa validar também o acesso funcional, não apenas o polo informado.
CREATE OR REPLACE FUNCTION public.assert_receivables_filter_scope(
  p_polo_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.gestor_has_module('financeiro')
     OR NOT public.gestor_has_financeiro_tab('receber')
  THEN
    RAISE EXCEPTION 'Acesso negado aos recebíveis financeiros.'
      USING ERRCODE = '42501';
  END IF;

  IF (p_polo_id IS NULL AND NOT public.is_gestor_global())
     OR (
       p_polo_id IS NOT NULL
       AND NOT public.is_gestor_for_polo(p_polo_id)
     )
  THEN
    RAISE EXCEPTION 'Acesso financeiro fora do escopo autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN TRUE;
END;
$function$;

ALTER FUNCTION public.assert_receivables_filter_scope(uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assert_receivables_filter_scope(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.assert_receivables_filter_scope(uuid) IS
  'Autoriza internamente as RPCs de recebíveis por identidade, módulo, aba e escopo de polo; service_role é reservado à integração.';

NOTIFY pgrst, 'reload schema';

COMMIT;
