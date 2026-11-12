BEGIN;
-- Read-only reconciliation scheduling. No certificate, XML, personal data, or actor impersonation.
CREATE TABLE private.nfse_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('ISSUE','CANCEL')),
  target_id uuid NOT NULL,
  operation_id uuid NOT NULL REFERENCES private.nfse_individual_operations(id),
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','LEASED','DONE','BLOCKED')),
  lease_token uuid, lease_until timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_code text CHECK (last_code IN ('PENDING','NOT_FOUND','TRANSPORT','THROTTLED','AUTH_BLOCKED','INVALID_EVIDENCE','CONFIRMED','INELIGIBLE')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_kind,target_id),
  CHECK ((state='LEASED') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX nfse_reconciliation_due_idx ON private.nfse_reconciliation_jobs(next_check_at,id)
  WHERE state IN ('READY','LEASED');
ALTER TABLE private.nfse_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_reconciliation_jobs FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.nfse_reconciliation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES private.nfse_reconciliation_jobs(id),
  action text NOT NULL CHECK(action IN ('ENQUEUE','CLAIM','FINISH','STOP')),
  attempt_count integer NOT NULL, code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.nfse_reconciliation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_reconciliation_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.nfse_reconciliation_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.reject_nfse_reconciliation_audit_change()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Reconciliation audit is append-only.' USING ERRCODE='42501'; END
$$;
REVOKE ALL ON FUNCTION private.reject_nfse_reconciliation_audit_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_reconciliation_audit_immutable BEFORE UPDATE OR DELETE ON private.nfse_reconciliation_audit
 FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_reconciliation_audit_change();

CREATE FUNCTION private.nfse_reconciliation_eligible(p_kind text,p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT CASE WHEN p_kind='ISSUE' THEN EXISTS (
    SELECT 1 FROM private.nfse_individual_operations o WHERE o.id=p_target
      AND o.state IN ('PROCESSING','AWAITING_CONFIRMATION')
      AND length(btrim(coalesce(o.signed_dps_xml,'')))>0 AND o.environment='PRODUCAO'
  ) WHEN p_kind='CANCEL' THEN EXISTS (
    SELECT 1 FROM private.nfse_individual_cancellations c
    JOIN private.nfse_individual_operations o ON o.id=c.operation_id
    WHERE c.id=p_target AND c.state IN ('PROCESSING','CANCELLATION_PENDING','AWAITING_ANALYSIS')
      AND length(btrim(coalesce(c.signed_event_xml,'')))>0 AND o.environment='PRODUCAO'
      AND o.state='AUTHORIZED' AND length(btrim(coalesce(o.authorized_xml,'')))>0
  ) ELSE false END
$$;
REVOKE ALL ON FUNCTION private.nfse_reconciliation_eligible(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.sync_nfse_reconciliation_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_kind text:=CASE TG_TABLE_NAME WHEN 'nfse_individual_operations' THEN 'ISSUE' ELSE 'CANCEL' END;
  v_operation uuid; v_job uuid;
BEGIN
  IF v_kind='ISSUE' THEN v_operation:=NEW.id; ELSE v_operation:=NEW.operation_id; END IF;
  IF private.nfse_reconciliation_eligible(v_kind,NEW.id) THEN
    INSERT INTO private.nfse_reconciliation_jobs(target_kind,target_id,operation_id,next_check_at)
    VALUES(v_kind,NEW.id,v_operation,now()+interval '3 seconds')
    ON CONFLICT(target_kind,target_id) DO NOTHING RETURNING id INTO v_job;
    IF v_job IS NOT NULL THEN
      INSERT INTO private.nfse_reconciliation_audit(job_id,action,attempt_count) VALUES(v_job,'ENQUEUE',0);
    END IF;
  ELSE
    WITH stopped AS (
      UPDATE private.nfse_reconciliation_jobs SET state='DONE',lease_token=NULL,lease_until=NULL,
        last_code='INELIGIBLE',updated_at=now()
      WHERE target_kind=v_kind AND target_id=NEW.id AND state<>'DONE' RETURNING id,attempt_count
    ) INSERT INTO private.nfse_reconciliation_audit(job_id,action,attempt_count,code)
      SELECT id,'STOP',attempt_count,'INELIGIBLE' FROM stopped;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.sync_nfse_reconciliation_job() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_reconciliation_issue_enqueue AFTER INSERT OR UPDATE OF state,signed_dps_xml
  ON private.nfse_individual_operations FOR EACH ROW EXECUTE FUNCTION private.sync_nfse_reconciliation_job();
CREATE TRIGGER nfse_reconciliation_cancel_enqueue AFTER INSERT OR UPDATE OF state,signed_event_xml
  ON private.nfse_individual_cancellations FOR EACH ROW EXECUTE FUNCTION private.sync_nfse_reconciliation_job();

CREATE FUNCTION public.claim_nfse_reconciliation_jobs_internal(p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE v_job private.nfse_reconciliation_jobs%ROWTYPE; v_result jsonb:='[]'::jsonb;
  v_scope record; v_lock bigint; v_count integer:=0; v_live integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Internal executor required.' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION 'Invalid batch size.' USING ERRCODE='22023'; END IF;
  FOR v_job IN SELECT j.* FROM private.nfse_reconciliation_jobs j
    WHERE j.next_check_at<=clock_timestamp() AND
      (j.state='READY' OR (j.state='LEASED' AND j.lease_until<=clock_timestamp()))
    ORDER BY j.next_check_at,j.id LIMIT 100 FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_count>=p_limit;
    IF NOT private.nfse_reconciliation_eligible(v_job.target_kind,v_job.target_id) THEN
      UPDATE private.nfse_reconciliation_jobs SET state='DONE',lease_token=NULL,lease_until=NULL,
        last_code='INELIGIBLE',updated_at=now() WHERE id=v_job.id;
      CONTINUE;
    END IF;
    SELECT o.polo_id,o.environment,o.month INTO STRICT v_scope FROM private.nfse_individual_operations o WHERE o.id=v_job.operation_id;
    v_lock:=hashtextextended('nfse-reconciliation-polo:'||v_scope.polo_id::text,0);
    IF NOT pg_try_advisory_xact_lock(v_lock) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_live FROM private.nfse_reconciliation_jobs j
      JOIN private.nfse_individual_operations o ON o.id=j.operation_id
      WHERE o.polo_id=v_scope.polo_id AND j.state='LEASED' AND j.lease_until>clock_timestamp();
    IF v_live>=2 THEN CONTINUE; END IF;
    UPDATE private.nfse_reconciliation_jobs SET state='LEASED',lease_token=gen_random_uuid(),
      lease_until=clock_timestamp()+interval '90 seconds',attempt_count=attempt_count+1,updated_at=now()
      WHERE id=v_job.id RETURNING * INTO v_job;
    INSERT INTO private.nfse_reconciliation_audit(job_id,action,attempt_count) VALUES(v_job.id,'CLAIM',v_job.attempt_count);
    v_result:=v_result||jsonb_build_array(jsonb_build_object('jobId',v_job.id,'targetKind',v_job.target_kind,
      'targetId',v_job.target_id,'operationId',v_job.operation_id,'leaseToken',v_job.lease_token,
      'leaseUntil',v_job.lease_until,'attemptCount',v_job.attempt_count,
      'poloId',v_scope.polo_id,'environment',v_scope.environment,'month',v_scope.month));
    v_count:=v_count+1;
  END LOOP;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.claim_nfse_reconciliation_jobs_internal(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_nfse_reconciliation_jobs_internal(integer) TO service_role;

CREATE FUNCTION public.finish_nfse_reconciliation_job_internal(
  p_job_id uuid,p_lease_token uuid,p_outcome text,p_code text,p_retry_after_seconds integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE v_job private.nfse_reconciliation_jobs%ROWTYPE; v_delay integer; v_state text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Internal executor required.' USING ERRCODE='42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('PENDING','RETRY','BLOCKED') OR p_code IS NULL OR
    p_code NOT IN ('PENDING','NOT_FOUND','TRANSPORT','THROTTLED','AUTH_BLOCKED','INVALID_EVIDENCE','CONFIRMED','INELIGIBLE') OR
    (p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds<0) THEN
    RAISE EXCEPTION 'Invalid scheduling outcome.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_job FROM private.nfse_reconciliation_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown job.' USING ERRCODE='22023'; END IF;
  -- A terminal fiscal update can already have invalidated this lease via trigger.
  IF v_job.state='DONE' AND NOT private.nfse_reconciliation_eligible(v_job.target_kind,v_job.target_id) THEN
    RETURN jsonb_build_object('state','DONE'); END IF;
  IF v_job.state<>'LEASED' OR p_lease_token IS NULL OR v_job.lease_token IS DISTINCT FROM p_lease_token OR
    v_job.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Stale reconciliation lease.' USING ERRCODE='40001'; END IF;
  IF NOT private.nfse_reconciliation_eligible(v_job.target_kind,v_job.target_id) THEN v_state:='DONE';
  ELSIF p_code IN ('CONFIRMED','INELIGIBLE') THEN RAISE EXCEPTION 'Canonical state is still pending.' USING ERRCODE='22023';
  ELSIF p_outcome='BLOCKED' THEN v_state:='BLOCKED';
  ELSE v_state:='READY'; END IF;
  v_delay:=CASE WHEN v_job.attempt_count<=1 THEN 3 WHEN v_job.attempt_count=2 THEN 5
    WHEN v_job.attempt_count=3 THEN 10 WHEN v_job.attempt_count=4 THEN 30
    WHEN v_job.attempt_count<=10 THEN 60 ELSE 300 END;
  -- Honor a provider Retry-After even beyond 24h; never cap it downward.
  v_delay:=greatest(v_delay,coalesce(p_retry_after_seconds,0));
  UPDATE private.nfse_reconciliation_jobs SET state=v_state,lease_token=NULL,lease_until=NULL,
    next_check_at=clock_timestamp()+make_interval(secs=>v_delay),last_code=CASE WHEN v_state='DONE' THEN 'INELIGIBLE' ELSE p_code END,updated_at=now()
    WHERE id=v_job.id;
  INSERT INTO private.nfse_reconciliation_audit(job_id,action,attempt_count,code)
    VALUES(v_job.id,'FINISH',v_job.attempt_count,p_code);
  RETURN jsonb_build_object('state',v_state,'retryAfterSeconds',CASE WHEN v_state='READY' THEN v_delay ELSE NULL END);
END
$$;
REVOKE ALL ON FUNCTION public.finish_nfse_reconciliation_job_internal(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_nfse_reconciliation_job_internal(uuid,uuid,text,text,integer) TO service_role;

-- Backfill only already-submitted nonterminal operations. Previews never enter this queue.
INSERT INTO private.nfse_reconciliation_jobs(target_kind,target_id,operation_id)
 SELECT 'ISSUE',id,id FROM private.nfse_individual_operations
 WHERE private.nfse_reconciliation_eligible('ISSUE',id)
 ON CONFLICT(target_kind,target_id) DO NOTHING;
INSERT INTO private.nfse_reconciliation_jobs(target_kind,target_id,operation_id)
 SELECT 'CANCEL',id,operation_id FROM private.nfse_individual_cancellations
 WHERE private.nfse_reconciliation_eligible('CANCEL',id)
 ON CONFLICT(target_kind,target_id) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
