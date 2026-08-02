CREATE OR REPLACE FUNCTION public.get_banese_reconciliation_sync_summary_secure(
  p_environment text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Maceio')::date;
  v_week_start date := date_trunc('week', v_today::timestamp)::date;
  v_month_start date := date_trunc('month', v_today::timestamp)::date;
  v_api jsonb;
  v_cnab jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_gestor_global()
       AND public.gestor_has_financeiro_tab('conciliacao-bancaria')
     )
  THEN
    RAISE EXCEPTION 'Acesso a conciliacao bancaria nao autorizado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'lastConsultaAt', (
      SELECT transaction.created_at
      FROM public.payment_gateway_transactions AS transaction
      WHERE transaction.provider_code = 'banese_card'
        AND transaction.environment = p_environment
        AND transaction.payment_method = 'BOLETO'
        AND transaction.raw_payload -> 'reconciliation' IS NOT NULL
      ORDER BY transaction.created_at DESC
      LIMIT 1
    ),
    'lastSincronizacaoAt', (
      SELECT COALESCE(transaction.updated_at, transaction.created_at)
      FROM public.payment_gateway_transactions AS transaction
      WHERE transaction.provider_code = 'banese_card'
        AND transaction.environment = p_environment
        AND transaction.payment_method = 'BOLETO'
        AND transaction.raw_payload -> 'reconciliation' IS NOT NULL
      ORDER BY transaction.created_at DESC
      LIMIT 1
    ),
    'lastApiSyncAt', (
      SELECT transaction.created_at
      FROM public.payment_gateway_transactions AS transaction
      WHERE transaction.provider_code = 'banese_card'
        AND transaction.environment = p_environment
        AND transaction.payment_method = 'BOLETO'
        AND transaction.raw_payload -> 'reconciliation' IS NOT NULL
      ORDER BY transaction.created_at DESC
      LIMIT 1
    ),
    'syncsToday', count(*) FILTER (
      WHERE (transaction.created_at AT TIME ZONE 'America/Maceio')::date = v_today
    ),
    'syncsThisWeek', count(*) FILTER (
      WHERE (transaction.created_at AT TIME ZONE 'America/Maceio')::date >= v_week_start
    ),
    'syncsThisMonth', count(*) FILTER (
      WHERE (transaction.created_at AT TIME ZONE 'America/Maceio')::date >= v_month_start
    ),
    'hasApiSyncError', COALESCE(bool_or(
      NULLIF(trim(COALESCE(transaction.last_error, '')), '') IS NOT NULL
      AND trim(transaction.last_error) <> '-'
    ), false)
  )
  INTO v_api
  FROM public.payment_gateway_transactions AS transaction
  WHERE transaction.provider_code = 'banese_card'
    AND transaction.environment = p_environment
    AND transaction.payment_method = 'BOLETO'
    AND transaction.raw_payload -> 'reconciliation' IS NOT NULL;

  SELECT jsonb_build_object(
    'lastConsultaAt', (
      SELECT COALESCE(exchange_file.imported_at, exchange_file.created_at)
      FROM public.payment_gateway_cnab_files AS exchange_file
      WHERE exchange_file.provider_code = 'banese_card'
        AND exchange_file.environment = p_environment
        AND exchange_file.direction = 'RETORNO'
      ORDER BY COALESCE(exchange_file.imported_at, exchange_file.created_at) DESC
      LIMIT 1
    ),
    'lastSincronizacaoAt', (
      SELECT COALESCE(
        exchange_file.processed_at,
        exchange_file.updated_at,
        exchange_file.imported_at,
        exchange_file.created_at
      )
      FROM public.payment_gateway_cnab_files AS exchange_file
      WHERE exchange_file.provider_code = 'banese_card'
        AND exchange_file.environment = p_environment
        AND exchange_file.direction = 'RETORNO'
      ORDER BY COALESCE(exchange_file.imported_at, exchange_file.created_at) DESC
      LIMIT 1
    ),
    'lastApiSyncAt', (
      SELECT COALESCE(exchange_file.imported_at, exchange_file.created_at)
      FROM public.payment_gateway_cnab_files AS exchange_file
      WHERE exchange_file.provider_code = 'banese_card'
        AND exchange_file.environment = p_environment
        AND exchange_file.direction = 'RETORNO'
      ORDER BY COALESCE(exchange_file.imported_at, exchange_file.created_at) DESC
      LIMIT 1
    ),
    'syncsToday', count(*) FILTER (
      WHERE (
        COALESCE(exchange_file.imported_at, exchange_file.created_at)
        AT TIME ZONE 'America/Maceio'
      )::date = v_today
    ),
    'syncsThisWeek', count(*) FILTER (
      WHERE (
        COALESCE(exchange_file.imported_at, exchange_file.created_at)
        AT TIME ZONE 'America/Maceio'
      )::date >= v_week_start
    ),
    'syncsThisMonth', count(*) FILTER (
      WHERE (
        COALESCE(exchange_file.imported_at, exchange_file.created_at)
        AT TIME ZONE 'America/Maceio'
      )::date >= v_month_start
    ),
    'hasApiSyncError', COALESCE(bool_or(
      exchange_file.status IN ('REJECTED', 'PARTIAL')
    ), false)
  )
  INTO v_cnab
  FROM public.payment_gateway_cnab_files AS exchange_file
  WHERE exchange_file.provider_code = 'banese_card'
    AND exchange_file.environment = p_environment
    AND exchange_file.direction = 'RETORNO';

  RETURN jsonb_build_object(
    'apiSync', COALESCE(v_api, '{}'::jsonb),
    'cnab240Sync', COALESCE(v_cnab, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_banese_reconciliation_sync_summary_secure(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_banese_reconciliation_sync_summary_secure(text)
  TO authenticated, service_role;
