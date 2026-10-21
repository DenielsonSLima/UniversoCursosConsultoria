BEGIN;

-- A portal receipt can resolve either disputed provider label after the same
-- exact identity/payment checks. This does not reinterpret either API status
-- as settlement, calculate components, or change automatic synchronization.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef(
    'internal_proesc.confirm_portal_payment(uuid,uuid,jsonb)'::regprocedure);
  v_status text := 'or v_observation.source_status is distinct from ''PAGAMENTO PARCIAL''';
  v_reason text := 'where reason<>''PARTIAL_PAYMENT_REQUIRES_REVIEW''';
BEGIN
  IF (length(v_definition)-length(replace(v_definition,v_status,'')))/length(v_status) <> 1
    OR (length(v_definition)-length(replace(v_definition,v_reason,'')))/length(v_reason) <> 1 THEN
    RAISE EXCEPTION 'Unexpected portal payment confirmation guards; review required.';
  END IF;
  v_definition := replace(v_definition,v_status,
    'or v_observation.source_status is null
    or v_observation.source_status not in (''PAGAMENTO PARCIAL'',''PAGAMENTO SUPERIOR'')');
  v_definition := replace(v_definition,v_reason,
    'where reason<>case v_observation.source_status
        when ''PAGAMENTO PARCIAL'' then ''PARTIAL_PAYMENT_REQUIRES_REVIEW''
        when ''PAGAMENTO SUPERIOR'' then ''OVERPAYMENT_REQUIRES_REVIEW'' end');
  EXECUTE v_definition;
END;
$patch$;

COMMIT;
