-- Activate preparation only after every monitor dependency has its cold-data reader.
-- The scheduling flag remains disabled until the real Storage round-trip pilot succeeds.
DO $guard$
BEGIN
  IF to_regprocedure('public.proesc_technical_history_service(uuid,uuid,uuid,text)') IS NULL
    OR to_regprocedure('internal_proesc.run_observation_ids(uuid)') IS NULL
    OR position('archived_technical_runs' in pg_get_viewdef('internal_proesc.sync_run_item_errors'::regclass))=0
    OR position('archived_technical_runs' in pg_get_viewdef('internal_proesc.sync_run_http_counts'::regclass))=0
    OR position('technical_run_scopes' in pg_get_functiondef(
      'public.get_proesc_reconciliation_dashboard(uuid,timestamptz,timestamptz)'::regprocedure))=0
    OR position('run_observation_ids' in pg_get_functiondef(
      'public.get_proesc_reconciliation_feed_page(text,uuid,uuid,timestamptz,timestamptz,integer,integer)'::regprocedure))=0
  THEN RAISE EXCEPTION 'Leitores do histórico técnico incompletos.'; END IF;
  UPDATE internal_proesc.technical_archive_runtime SET readers_ready=true WHERE singleton;
END;
$guard$;

