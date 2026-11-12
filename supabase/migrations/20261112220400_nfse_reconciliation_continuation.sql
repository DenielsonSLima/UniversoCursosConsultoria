BEGIN;

-- A fast completion may occur inside the kick debounce. Keep one short future
-- wake-up instead of losing that continuation until the fallback cron runs.
ALTER TABLE private.nfse_reconciliation_control
  ADD COLUMN scheduled_kick_at timestamptz;

CREATE OR REPLACE FUNCTION private.kick_nfse_reconciliation_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text; gateway_jwt text; claims jsonb; encoded text; due timestamptz;
  control private.nfse_reconciliation_control%ROWTYPE;
  v_now timestamptz; scheduled_time timestamptz; delay integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('nfse-reconciliation-kick',0)) THEN RETURN; END IF;
  SELECT * INTO control FROM private.nfse_reconciliation_control WHERE singleton;
  IF control.enabled IS DISTINCT FROM true THEN RETURN; END IF;

  v_now:=clock_timestamp();
  SELECT min(CASE WHEN state='LEASED' THEN lease_until ELSE next_check_at END) INTO due
    FROM private.nfse_reconciliation_jobs
    WHERE state='READY' OR (state='LEASED' AND lease_until<=v_now);
  -- Long backoffs remain durable in the queue and use the existing minute cron.
  -- No worker is kept sleeping for 30/60/300 seconds or for an active lease.
  IF due IS NULL OR due>v_now+interval '10 seconds' THEN RETURN; END IF;
  delay:=greatest(0,least(10,ceil(extract(epoch FROM
    greatest(due,v_now,coalesce(control.last_kick_at+interval '1 second',v_now))-v_now
  ))::integer));
  scheduled_time:=v_now+make_interval(secs=>delay);
  -- Repeated/concurrent triggers reuse an already scheduled short continuation.
  -- A new earlier target can still preempt a slower pending wake-up.
  IF control.scheduled_kick_at>v_now AND control.scheduled_kick_at<=scheduled_time THEN RETURN; END IF;

  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_worker_secret';
  IF coalesce(secret,'') !~ '^[a-f0-9]{64}$' THEN RETURN; END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt')<>1 THEN RETURN; END IF;
  SELECT decrypted_secret INTO gateway_jwt FROM vault.decrypted_secrets WHERE name='nfse_reconciliation_gateway_jwt';
  IF octet_length(coalesce(gateway_jwt,''))>4096 OR coalesce(gateway_jwt,'') !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN RETURN; END IF;
  encoded:=translate(split_part(gateway_jwt,'.',2),'-_','+/');
  encoded:=encoded||repeat('=',(4-length(encoded)%4)%4);
  claims:=convert_from(decode(encoded,'base64'),'UTF8')::jsonb;
  IF claims->>'role' IS DISTINCT FROM 'anon' OR claims->>'ref' IS DISTINCT FROM 'kfekgwyqozhicpfuunpo'
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
    OR (claims->>'exp')::numeric<=extract(epoch FROM clock_timestamp()) THEN RETURN; END IF;

  UPDATE private.nfse_reconciliation_control
    SET last_kick_at=v_now,scheduled_kick_at=scheduled_time WHERE singleton;
  PERFORM net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/nfse-reconciliation-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||gateway_jwt,'X-Nfse-Worker-Token',secret),
    body:=jsonb_build_object('delaySeconds',delay),timeout_milliseconds:=85000);
EXCEPTION WHEN OTHERS THEN
  -- The exception subtransaction also rolls back the marker if enqueue fails.
  -- Fiscal state and the durable job remain available for the fallback cron.
  RAISE WARNING 'NFSE_WORKER_KICK_UNAVAILABLE';
  RETURN;
END$$;
REVOKE ALL ON FUNCTION private.kick_nfse_reconciliation_worker() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
