BEGIN;

-- Both the list and its summary use this canonical exclusion. Replace in place
-- so existing database callers retain the same function identity and guards.
CREATE OR REPLACE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_rows jsonb;
BEGIN
  v_rows:=public.listar_outros_creditos_sem_convenios_core(p_polo_id);
  RETURN coalesce((SELECT jsonb_agg(item||jsonb_build_object(
      'other_credit_cancellation_eligible',internal_other_credit_cancellation.eligible(c),
      'payment_summary',c.payment_summary,'outros_creditos_plano_id',c.outros_creditos_plano_id,
      'outros_creditos_papel',c.outros_creditos_papel,
      'regra_financeira_outros_creditos_snapshot',c.regra_financeira_outros_creditos_snapshot)
      ORDER BY item->>'data_vencimento',item->>'created_at',item->>'id')
    FROM jsonb_array_elements(v_rows) item JOIN public.contas_receber c ON c.id=(item->>'id')::uuid
    WHERE NOT EXISTS(SELECT 1 FROM public.convenios_financeiros_creditos f WHERE f.conta_receber_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM private.nfse_service_receivables l WHERE l.receivable_id=c.id)),'[]');
END;
$function$;
REVOKE ALL ON FUNCTION public.listar_outros_creditos_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.listar_outros_creditos_secure(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION internal_financial_payments.authorize_source(p_actor uuid,p_source_kind text,p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE r jsonb; tab_name text;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_source_kind='EXPENSE' THEN
    SELECT to_jsonb(s) INTO r FROM public.despesas_lancamentos s WHERE id=p_source_id FOR UPDATE;
    tab_name:=CASE WHEN r->>'tipo'='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END;
  ELSIF p_source_kind='PAYABLE' THEN
    SELECT to_jsonb(s) INTO r FROM public.contas_pagar s WHERE id=p_source_id FOR UPDATE;
    tab_name:='despesas';
  ELSIF p_source_kind='RECEIVABLE' THEN
    SELECT to_jsonb(s) INTO r FROM public.contas_receber s WHERE id=p_source_id FOR UPDATE;
    tab_name:=CASE WHEN EXISTS(SELECT 1 FROM private.nfse_service_receivables l WHERE l.receivable_id=p_source_id)
      THEN 'receber' WHEN r->>'categoria'='OUTROS_CREDITOS' THEN 'outros-creditos' ELSE 'receber' END;
  ELSE RAISE EXCEPTION 'PAYMENT_INVALID_SOURCE'; END IF;
  IF r IS NULL OR internal_financial_payments.actor_allowed(p_actor,(r->>'polo_id')::uuid,tab_name) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  RETURN r;
END;
$function$;
REVOKE ALL ON FUNCTION internal_financial_payments.authorize_source(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
