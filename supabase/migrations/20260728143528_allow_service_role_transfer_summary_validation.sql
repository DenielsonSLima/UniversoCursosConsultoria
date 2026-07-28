-- Corrige a guarda da RPC-base: service_role deve ignorar as verificacoes de
-- gestor por polo, enquanto authenticated continua exigindo ambos os polos e
-- a permissao de Caixa ou da aba Transferencias.

DO $$
DECLARE
  v_definition text;
  v_updated_definition text;
  v_old_guard constant text := $guard$
    AND public.is_gestor_for_polo(tc.polo_id)
    AND public.is_gestor_for_polo(tc.polo_destino_id)
    AND (
      auth.role() = 'service_role'
      OR public.gestor_has_module('caixa')
      OR public.gestor_has_financeiro_tab('transferencias')
    )
$guard$;
  v_new_guard constant text := $guard$
    AND (
      auth.role() = 'service_role'
      OR (
        public.is_gestor_for_polo(tc.polo_id)
        AND public.is_gestor_for_polo(tc.polo_destino_id)
        AND (
          public.gestor_has_module('caixa')
          OR public.gestor_has_financeiro_tab('transferencias')
        )
      )
    )
$guard$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_transferencias_contas(uuid,text,uuid,uuid,date,date,boolean)'::regprocedure
  )
  INTO v_definition;

  IF position(v_old_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'Guarda esperada nao foi encontrada em get_transferencias_contas.';
  END IF;

  v_updated_definition := replace(v_definition, v_old_guard, v_new_guard);
  EXECUTE v_updated_definition;
END;
$$;
