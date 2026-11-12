BEGIN;
CREATE TABLE private.nfse_reconciliation_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,last_kick_at timestamptz);
INSERT INTO private.nfse_reconciliation_control(singleton) VALUES(true);
ALTER TABLE private.nfse_reconciliation_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_reconciliation_control FROM PUBLIC,anon,authenticated,service_role;
-- Provisioned within Vault; no secret value is returned or embedded in cron text.
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='nfse_reconciliation_worker_secret') THEN
  PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'nfse_reconciliation_worker_secret');
 END IF;
END$$;
CREATE FUNCTION public.get_nfse_reconciliation_worker_secret_internal() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE value text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Internal worker required.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.nfse_reconciliation_control WHERE singleton AND enabled) THEN
  RAISE EXCEPTION 'Worker disabled.' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_worker_secret')<>1 THEN
  RAISE EXCEPTION 'Worker unavailable.' USING ERRCODE='42501'; END IF;
 SELECT decrypted_secret INTO value FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_worker_secret';
 IF coalesce(value,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Worker unavailable.' USING ERRCODE='42501'; END IF;
 RETURN value;
END$$;
REVOKE ALL ON FUNCTION public.get_nfse_reconciliation_worker_secret_internal() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_reconciliation_worker_secret_internal() TO service_role;
CREATE FUNCTION private.kick_nfse_reconciliation_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text; gateway_jwt text; claims jsonb; encoded text; due timestamptz; delay integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.nfse_reconciliation_control WHERE singleton AND enabled) THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('nfse-reconciliation-kick',0)) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM private.nfse_reconciliation_control WHERE singleton AND last_kick_at>clock_timestamp()-interval '1 second') THEN RETURN; END IF;
 SELECT min(CASE WHEN state='LEASED' THEN lease_until ELSE next_check_at END) INTO due
  FROM private.nfse_reconciliation_jobs WHERE state='READY' OR (state='LEASED' AND lease_until<=clock_timestamp());
 IF due IS NULL OR due>clock_timestamp()+interval '10 seconds' THEN RETURN; END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_worker_secret';
 IF coalesce(secret,'') !~ '^[a-f0-9]{64}$' THEN RETURN; END IF;
 -- Preserve gateway JWT verification. Only the project's anon JWT is allowed, never service_role.
 IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt')<>1 THEN RETURN; END IF;
 SELECT decrypted_secret INTO gateway_jwt FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt';
 IF octet_length(coalesce(gateway_jwt,''))>4096 OR coalesce(gateway_jwt,'') !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN RETURN; END IF;
 encoded:=translate(split_part(gateway_jwt,'.',2),'-_','+/');
 encoded:=encoded||repeat('=',(4-length(encoded)%4)%4);
 claims:=convert_from(decode(encoded,'base64'),'UTF8')::jsonb;
 IF claims->>'role' IS DISTINCT FROM 'anon' OR claims->>'ref' IS DISTINCT FROM 'kfekgwyqozhicpfuunpo'
  OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
  OR (claims->>'exp')::numeric<=extract(epoch from clock_timestamp()) THEN RETURN; END IF;
 delay:=greatest(0,least(10,ceil(extract(epoch from due-clock_timestamp()))::integer));
 UPDATE private.nfse_reconciliation_control SET last_kick_at=clock_timestamp() WHERE singleton;
 PERFORM net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/nfse-reconciliation-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||gateway_jwt,'X-Nfse-Worker-Token',secret),
  body:=jsonb_build_object('delaySeconds',delay),timeout_milliseconds:=85000);
EXCEPTION WHEN OTHERS THEN
 -- A scheduler outage must never roll back a valid fiscal response; the durable queue remains recoverable.
 RAISE WARNING 'NFSE_WORKER_KICK_UNAVAILABLE';
 RETURN;
END$$;
REVOKE ALL ON FUNCTION private.kick_nfse_reconciliation_worker() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.notify_nfse_reconciliation_worker() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 -- Terminal transitions also wake the next ready job, not only retries.
 PERFORM private.kick_nfse_reconciliation_worker(); RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.notify_nfse_reconciliation_worker() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_reconciliation_worker_kick AFTER INSERT OR UPDATE OF state,next_check_at ON private.nfse_reconciliation_jobs
 FOR EACH ROW EXECUTE FUNCTION private.notify_nfse_reconciliation_worker();
-- Disabled by default until code, authenticated endpoint, concurrency and proof gates pass.
SELECT cron.schedule('nfse-reconciliation-fallback-minute','* * * * *','SELECT private.kick_nfse_reconciliation_worker()');
COMMIT;
