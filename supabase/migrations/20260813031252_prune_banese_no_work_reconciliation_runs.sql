-- Mantém o histórico financeiro relevante e remove somente execuções vazias
-- da reconciliação recorrente, após uma janela de 48 horas.
CREATE OR REPLACE FUNCTION public.prune_banese_reconciliation_no_work_runs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_runs_deleted bigint := 0;
  v_scheduler_details_deleted bigint := 0;
BEGIN
  WITH deleted_runs AS (
    DELETE FROM public.banese_reconciliation_runs AS run
    WHERE run.status = 'SUCCESS'
      AND run.finished_at < now() - interval '48 hours'
      AND run.claimed = 0
      AND run.checked = 0
      AND run.pending = 0
      AND run.paid = 0
      AND run.failed = 0
      AND coalesce(run.throttled, false) = false
      AND coalesce(run.oauth_requests, 0) = 0
      AND coalesce(run.oauth_reused, false) = false
      AND coalesce(run.decision, '') = 'Perfil mantido.'
      AND NOT EXISTS (
        SELECT 1
        FROM public.banese_reconciliation_attempts AS attempt
        WHERE attempt.run_id = run.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.banese_reconciliation_transitions AS transition
        WHERE transition.run_id = run.id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_runs_deleted FROM deleted_runs;

  -- O pg_cron não expira essa telemetria por conta própria. Conservamos
  -- falhas do agendador e removemos somente execuções técnicas concluídas.
  DELETE FROM cron.job_run_details AS detail
  WHERE detail.jobid IN (
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname IN (
      'banese-reconciliation-every-minute',
      'prune-banese-reconciliation-no-work-hourly'
    )
  )
    AND detail.status = 'succeeded'
    AND coalesce(detail.end_time, detail.start_time) < now() - interval '48 hours';
  GET DIAGNOSTICS v_scheduler_details_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'runs_deleted', v_runs_deleted,
    'scheduler_details_deleted', v_scheduler_details_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.prune_banese_reconciliation_no_work_runs() IS
  'Remove após 48 horas somente execuções Banese bem-sucedidas sem título, tentativa, transição, falha, pagamento ou uso de OAuth; conserva auditoria financeira relevante.';

REVOKE ALL ON FUNCTION public.prune_banese_reconciliation_no_work_runs()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_banese_reconciliation_no_work_runs()
  TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'prune-banese-reconciliation-no-work-hourly'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'prune-banese-reconciliation-no-work-hourly',
    '17 * * * *',
    'SELECT public.prune_banese_reconciliation_no_work_runs();'
  );
END;
$$;
