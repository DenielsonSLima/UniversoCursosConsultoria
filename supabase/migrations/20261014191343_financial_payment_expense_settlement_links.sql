BEGIN;
-- Global expense lists need the same active-convenio route as scoped readers.
-- Expose only the relation IDs already available in the detailed expense reader.
CREATE FUNCTION public.get_expense_settlement_links_secure(p_expense_ids uuid[])
RETURNS TABLE(despesa_lancamento_id uuid,convenio_mes_id uuid,convenio_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PAYMENT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_expense_ids IS NULL OR cardinality(p_expense_ids)>500 THEN
  RAISE EXCEPTION 'PAYMENT_INVALID_SOURCE_BATCH' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT d.id,v.competencia_id,v.convenio_id
 FROM public.despesas_lancamentos d
 JOIN public.convenios_financeiros_despesas v ON v.despesa_lancamento_id=d.id AND v.status='ATIVO'
 WHERE d.id=ANY(p_expense_ids) AND d.excluido_em IS NULL
  AND internal_financial_payments.actor_allowed(auth.uid(),d.polo_id,
    CASE WHEN d.tipo='OUTRO_DEBITO' THEN 'outros-debitos' ELSE 'despesas' END) IS TRUE;
END $$;
REVOKE ALL ON FUNCTION public.get_expense_settlement_links_secure(uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_expense_settlement_links_secure(uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
