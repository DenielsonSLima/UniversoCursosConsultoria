BEGIN;
CREATE OR REPLACE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_creditos jsonb;
BEGIN
  v_creditos := public.listar_outros_creditos_sem_convenios_core(p_polo_id);
  RETURN coalesce((
    SELECT jsonb_agg(item || jsonb_build_object(
      'other_credit_cancellation_eligible', internal_other_credit_cancellation.eligible(credito),
      'outros_creditos_plano_id', credito.outros_creditos_plano_id,
      'outros_creditos_papel', credito.outros_creditos_papel,
      'regra_financeira_outros_creditos_snapshot', credito.regra_financeira_outros_creditos_snapshot
    ) ORDER BY item ->> 'data_vencimento', item ->> 'created_at', item ->> 'id')
    FROM jsonb_array_elements(v_creditos) item
    JOIN public.contas_receber credito ON credito.id = (item ->> 'id')::uuid
    WHERE NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos convenio_credito
      WHERE convenio_credito.conta_receber_id = credito.id)
  ), '[]'::jsonb);
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
