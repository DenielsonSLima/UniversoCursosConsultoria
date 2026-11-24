BEGIN;

CREATE FUNCTION internal_contas.ead_checkout_receivable_presentation(p_receivable public.contas_receber)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
BEGIN
  IF p_receivable.status = 'CANCELADO' THEN
    IF p_receivable.gateway_status IN ('CANCELED', 'EXPIRED') AND EXISTS (
      SELECT 1
      FROM public.ead_checkout_attempts a
      JOIN public.banese_ead_checkout_expiration_jobs j ON j.attempt_id = a.id
        AND j.receivable_id = a.receivable_id
      WHERE a.id = p_receivable.ead_checkout_attempt_id
        AND a.receivable_id = p_receivable.id
        AND a.nature = 'COMPRA_OPCIONAL' AND a.state = 'EXPIRED'
        AND j.cancel_reason = 'EXPIRED_OPTIONAL' AND j.canceled_at IS NOT NULL
        AND j.remote_status IN ('CANCELED', 'EXPIRED')
    ) THEN
      RETURN 'EXPIRED';
    END IF;
  ELSIF p_receivable.status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    AND internal_contas.ead_checkout_is_optional(p_receivable.id) THEN
    IF p_receivable.status <> 'SUSPENSO'
      AND p_receivable.gateway_provider = 'banese_card'
      AND p_receivable.gateway_payment_method = 'BOLETO'
      AND p_receivable.gateway_payment_id IS NOT NULL
      AND p_receivable.data_vencimento < internal_contas.ead_expiration_today() THEN
      RETURN 'AWAITING_BANK_VERIFICATION';
    END IF;
    RETURN 'PENDING';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION internal_contas.ead_checkout_receivable_presentation(public.contas_receber)
  FROM PUBLIC, anon, authenticated, service_role;

-- Enrich only the EAD rows already selected by the scoped and paginated RPC.
DO $page$
DECLARE
  definition text := pg_get_functiondef(
    'public.get_receivables_modality_page_v4_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)'::regprocedure);
  anchor constant text := 'entry.value || internal_academic.receivable_cycle_presentation(target) || pg_catalog.jsonb_build_object(';
  projection constant text := $projection$entry.value || internal_academic.receivable_cycle_presentation(target)
    || CASE WHEN p_modality = 'EAD' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'optional_ead_checkout_status', internal_contas.ead_checkout_receivable_presentation(target)
    )) ELSE '{}'::jsonb END || pg_catalog.jsonb_build_object($projection$;
BEGIN
  IF length(definition)-length(replace(definition,anchor,'')) <> length(anchor) THEN
    RAISE EXCEPTION 'EAD_OPTIONAL_RECEIVABLE_PAGE_DRIFT';
  END IF;
  EXECUTE replace(definition,anchor,projection);
END $page$;

-- Match the existing pending filters and remaining balance basis exactly.
DO $summary$
DECLARE
  definition text := pg_get_functiondef(
    'public.get_receivables_modality_summary_v3_secure(text,uuid,uuid,text,date,date)'::regprocedure);
  anchor constant text := $anchor$'pending_value', COALESCE(SUM(remaining_value) FILTER (WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')), 0),$anchor$;
  optional_totals constant text := $totals$
    'pending_optional_checkout_count', COUNT(*) FILTER (
      WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO') AND optional_checkout),
    'pending_optional_checkout_value', COALESCE(SUM(remaining_value) FILTER (
      WHERE due_in_period AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO') AND optional_checkout), 0),$totals$;
BEGIN
  IF length(definition)-length(replace(definition,anchor,'')) <> length(anchor)
    OR position(' AS optional_checkout,' IN definition) = 0 THEN
    RAISE EXCEPTION 'EAD_OPTIONAL_RECEIVABLE_SUMMARY_DRIFT';
  END IF;
  EXECUTE replace(definition,anchor,anchor || optional_totals);
END $summary$;

NOTIFY pgrst, 'reload schema';
COMMIT;
