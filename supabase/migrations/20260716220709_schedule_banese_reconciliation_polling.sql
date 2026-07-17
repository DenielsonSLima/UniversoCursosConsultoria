-- Polling automatico recomendado pelo Banese para conciliacao dos boletos.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.secrets
    WHERE name = 'payment_gateway_banese_card_reconciliation_worker_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'payment_gateway_banese_card_reconciliation_worker_secret',
      'Autenticacao interna do polling de conciliacao Banese'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_banese_reconciliation_batch(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(receivable_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := greatest(1, least(coalesce(p_limit, 10), 10));
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT cr.id
    FROM public.contas_receber cr
    WHERE cr.gateway_provider = 'banese_card'
      AND cr.gateway_payment_method = 'BOLETO'
      AND cr.gateway_environment IN ('sandbox', 'production')
      AND cr.status IN ('PENDENTE', 'VENCIDO')
      AND cr.gateway_boleto_nosso_numero ~ '^[0-9]{9}$'
      AND coalesce(cr.gateway_status, '') NOT IN (
        'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
        'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
      )
      AND coalesce(cr.gateway_synced_at, '-infinity'::timestamptz)
        < now() - interval '4 minutes'
    ORDER BY coalesce(cr.gateway_synced_at, '-infinity'::timestamptz), cr.id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.contas_receber cr
  SET gateway_synced_at = now(),
      gateway_last_error = NULL,
      updated_at = now()
  FROM candidates c
  WHERE cr.id = c.id
  RETURNING cr.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_banese_reconciliation_batch(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_banese_reconciliation_batch(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_banese_reconciliation_batch(INTEGER) IS
  'Reserva atomicamente um lote pequeno de boletos Banese para polling.';

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'banese-reconciliation-every-5-minutes'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'banese-reconciliation-every-5-minutes',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/banese-reconciliation-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Banese-Worker-Token', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'payment_gateway_banese_card_reconciliation_worker_secret'
          LIMIT 1
        )
      ),
      body := '{"batchSize":10}'::jsonb
    );
  $cron$
);
