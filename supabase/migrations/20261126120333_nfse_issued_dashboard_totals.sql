BEGIN;

-- Dashboard-only aggregate: no document, recipient or XML is returned.
CREATE FUNCTION public.get_nfse_issued_dashboard_totals_secure(
  p_context_key uuid, p_polo_id uuid, p_environment text, p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET statement_timeout = '12s' AS $function$
DECLARE
  v_company uuid;
  v_is_matriz boolean;
  v_polo_id uuid;
  v_polos uuid[];
  v_first date;
  v_total text;
  v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key, p_polo_id, p_environment, p_month);
  SELECT company_id, is_matriz INTO v_company, v_is_matriz FROM public.polos WHERE id = p_polo_id;
  IF v_is_matriz IS NOT TRUE OR v_company IS NULL THEN
    RAISE EXCEPTION 'O consolidado fiscal é exclusivo da matriz.' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_polos
  FROM public.polos
  WHERE company_id = v_company AND public.is_active_status(status);
  -- Just as in the accounting report, deny the whole consolidation if any
  -- member unit is out of scope; never label a partial sum "todos os polos".
  FOREACH v_polo_id IN ARRAY v_polos LOOP
    PERFORM private.authorize_nfse_model_scope(p_context_key, v_polo_id, p_environment, p_month);
  END LOOP;
  v_first := (p_month || '-01')::date;

  WITH issued AS MATERIALIZED (
    SELECT v.polo_id,
      CASE WHEN (v.command->>'amount') ~ '^(0|[1-9][0-9]{0,17})[.][0-9]{2}$'
        THEN (v.command->>'amount')::numeric END AS amount,
      (private.nfse_authorized_xml_emitted_at(o.authorized_xml)
        AT TIME ZONE 'America/Maceio')::date AS emitted_date
    FROM private.nfse_operation_source_projection v
    JOIN private.nfse_individual_operations o ON o.id = v.operation_id
    WHERE v.polo_id = ANY(v_polos) AND v.environment = p_environment
      AND v.issue_state = 'AUTHORIZED'
      AND NOT EXISTS (
        SELECT 1 FROM private.nfse_confirmed_cancellations c WHERE c.operation_id = v.operation_id
      )
  ), monthly AS (
    SELECT polo_id, CASE WHEN count(*) = count(amount) THEN sum(amount) END AS amount
    FROM issued
    WHERE emitted_date >= v_first AND emitted_date < (v_first + interval '1 month')::date
    GROUP BY polo_id
  ), unit_totals AS (
    SELECT p.id, p.nome, p.is_matriz,
      CASE WHEN m.polo_id IS NULL THEN 0::numeric ELSE m.amount END AS amount
    FROM public.polos p LEFT JOIN monthly m ON m.polo_id = p.id
    WHERE p.id = ANY(v_polos)
  )
  SELECT CASE WHEN count(*) = count(amount) THEN sum(amount)::numeric(30,2)::text END,
    jsonb_agg(jsonb_build_object('poloId', id, 'poloName', nome, 'amount', amount::numeric(30,2)::text)
      ORDER BY is_matriz DESC NULLS LAST, nome, id)
  INTO v_total, v_rows FROM unit_totals;

  RETURN jsonb_build_object('version', 1,
    'scope', jsonb_build_object('contextKey', p_context_key, 'poloId', p_polo_id,
      'environment', p_environment, 'month', p_month),
    'data', jsonb_build_object('totalAmount', v_total, 'byPolo', v_rows));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_nfse_issued_dashboard_totals_secure(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_issued_dashboard_totals_secure(uuid,uuid,text,text)
  TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
