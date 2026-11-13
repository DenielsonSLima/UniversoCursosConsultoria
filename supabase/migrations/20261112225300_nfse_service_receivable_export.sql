BEGIN;

CREATE FUNCTION public.exportar_servicos_receber_secure(p_polo_id uuid DEFAULT NULL,p_search text DEFAULT NULL,
  p_due_start date DEFAULT NULL,p_due_end date DEFAULT NULL,p_status_scope text DEFAULT 'ALL') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='15s' AS $$
DECLARE v_total bigint;v_result jsonb;
BEGIN
  PERFORM private.authorize_nfse_service_receivable_read(p_polo_id);
  -- STABLE keeps count, rows and the canonical summary on the caller's single
  -- statement snapshot. Check the complete selection before projecting rows.
  SELECT count(*) INTO v_total FROM private.nfse_service_receivable_filtered(
    p_polo_id,p_search,p_due_start,p_due_end,p_status_scope);
  IF v_total>5000 THEN
    RAISE EXCEPTION 'Refine os filtros para exportar até 5.000 recebíveis de serviços.' USING ERRCODE='54000';
  END IF;
  SELECT jsonb_build_object('rows',coalesce(jsonb_agg(private.nfse_service_receivable_projection(c.id)
      ORDER BY c.data_vencimento,c.created_at,c.id),'[]'::jsonb),'total_items',v_total,
    'summary',(SELECT to_jsonb(s) FROM public.get_servicos_receber_summary(
      p_polo_id,p_search,p_due_start,p_due_end,p_status_scope) s),'generated_at',statement_timestamp())
    INTO v_result FROM private.nfse_service_receivable_filtered(
      p_polo_id,p_search,p_due_start,p_due_end,p_status_scope) c;
  RETURN v_result;
END$$;
REVOKE ALL ON FUNCTION public.exportar_servicos_receber_secure(uuid,text,date,date,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.exportar_servicos_receber_secure(uuid,text,date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
