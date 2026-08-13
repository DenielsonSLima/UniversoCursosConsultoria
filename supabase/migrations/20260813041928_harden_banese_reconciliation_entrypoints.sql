-- Fecha os entrypoints legados e reduz os dois entrypoints atuais ao menor
-- privilégio necessário. O worker usa service_role e o prune roda como
-- postgres pelo pg_cron, portanto SECURITY DEFINER não é necessário.
ALTER FUNCTION public.prepare_banese_reconciliation_batch_v3()
  SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.prepare_banese_reconciliation_batch_v3()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_banese_reconciliation_batch_v3()
  TO service_role;

ALTER FUNCTION public.prune_banese_reconciliation_no_work_runs()
  SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.prune_banese_reconciliation_no_work_runs()
  FROM PUBLIC, anon, authenticated, service_role;

-- O worker v25 substituiu definitivamente begin + claim pela reserva v3.
-- Revogar os entrypoints antigos impede qualquer caller interno desatualizado
-- de voltar a criar execuções vazias.
REVOKE ALL ON FUNCTION public.begin_banese_reconciliation_run()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_banese_reconciliation_batch_v2(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Mantém o prune horário proporcional quando o histórico relevante crescer.
CREATE INDEX IF NOT EXISTS banese_reconciliation_runs_no_work_retention_idx
  ON public.banese_reconciliation_runs (finished_at)
  WHERE status = 'SUCCESS'
    AND claimed = 0;
