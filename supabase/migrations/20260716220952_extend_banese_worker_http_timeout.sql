-- O lote sequencial pode ultrapassar o timeout padrao de 5 segundos do pg_net.

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
      body := '{"batchSize":10}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
