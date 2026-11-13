BEGIN;
CREATE FUNCTION private.kick_nfse_service_bolepix_worker(p_continuation boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;gateway_jwt text;encoded text;claims jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('nfse-service-bolepix-kick',0)) OR NOT EXISTS(
    SELECT 1 FROM private.nfse_service_bolepix_control WHERE singleton AND enabled
      AND (p_continuation OR last_kick_at IS NULL OR last_kick_at<clock_timestamp()-interval '5 seconds'))
    OR EXISTS(SELECT 1 FROM private.nfse_service_bolepix_jobs WHERE state='LEASED' AND lease_until>clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM private.nfse_service_bolepix_jobs WHERE state='READY' AND next_check_at<=clock_timestamp()
      OR state='LEASED' AND lease_until<=clock_timestamp()) THEN RETURN; END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='payment_gateway_banese_card_reconciliation_worker_secret')<>1
    OR (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt')<>1 THEN RETURN; END IF;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets
    WHERE name='payment_gateway_banese_card_reconciliation_worker_secret';
  SELECT decrypted_secret INTO gateway_jwt FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt';
  IF length(coalesce(secret,''))<32 OR octet_length(coalesce(gateway_jwt,''))>4096
    OR coalesce(gateway_jwt,'') !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN RETURN; END IF;
  encoded:=translate(split_part(gateway_jwt,'.',2),'-_','+/');encoded:=encoded||repeat('=',(4-length(encoded)%4)%4);
  claims:=convert_from(decode(encoded,'base64'),'UTF8')::jsonb;
  IF claims->>'role' IS DISTINCT FROM 'anon' OR claims->>'ref' IS DISTINCT FROM 'kfekgwyqozhicpfuunpo'
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' OR (claims->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RETURN; END IF;
  UPDATE private.nfse_service_bolepix_control SET last_kick_at=clock_timestamp() WHERE singleton;
  PERFORM net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/nfse-service-bolepix-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||gateway_jwt,'X-Banese-Worker-Token',secret),
    body:='{}'::jsonb,timeout_milliseconds:=85000);
EXCEPTION WHEN OTHERS THEN
  -- The fiscal/financial transaction survives a scheduler outage; cron recovers the durable queue.
  RAISE WARNING 'NFSE_SERVICE_BOLEPIX_KICK_UNAVAILABLE';
END$$;
REVOKE ALL ON FUNCTION private.kick_nfse_service_bolepix_worker(boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.notify_nfse_service_bolepix_worker() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.state='LEASED' AND NEW.state<>'LEASED' THEN
      PERFORM private.kick_nfse_service_bolepix_worker(true);RETURN NEW;
    END IF;
  END IF;
  PERFORM private.kick_nfse_service_bolepix_worker(false);RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.notify_nfse_service_bolepix_worker() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_service_bolepix_worker_kick AFTER INSERT OR UPDATE OF state,next_check_at
  ON private.nfse_service_bolepix_jobs FOR EACH ROW EXECUTE FUNCTION private.notify_nfse_service_bolepix_worker();
SELECT cron.schedule('nfse-service-bolepix-fallback-minute','* * * * *','SELECT private.kick_nfse_service_bolepix_worker()');
COMMIT;
