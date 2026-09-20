-- Enable only after the real private Storage roundtrip and cold receipt restoration pilot.
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.receipt_archive_batches WHERE status='COMMITTED')
    OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='proesc-history' AND NOT public)
    OR to_regprocedure('internal_proesc.compact_http_telemetry(integer)') IS NULL
    OR to_regprocedure('internal_proesc.compact_sync_items(integer)') IS NULL THEN
    RAISE EXCEPTION 'Archive pilot, private bucket or lossless compactors unavailable';
  END IF;
END;
$guard$;
UPDATE internal_proesc.receipt_archive_runtime SET enabled=true WHERE singleton;
-- HTTP is small; items run on an even minute, away from the old-observation compactor.
SELECT cron.schedule('compact-proesc-http-history','3-59/10 * * * *',
  'set statement_timeout=''15s''; select internal_proesc.compact_http_telemetry(25)');
SELECT cron.schedule('compact-proesc-item-history','4-59/10 * * * *',
  'set statement_timeout=''15s''; select internal_proesc.compact_sync_items(25)');
