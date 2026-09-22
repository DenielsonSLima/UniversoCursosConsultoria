-- Bound retries of transient upstream failures; no financial cursor is advanced.
CREATE TABLE internal_proesc.sync_fetch_backoff (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  last_run_id uuid NOT NULL,
  credential_revision uuid NOT NULL,
  consecutive_failures integer NOT NULL CHECK(consecutive_failures BETWEEN 0 AND 5),
  retry_after timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
ALTER TABLE internal_proesc.sync_fetch_backoff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.sync_fetch_backoff FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.fetch_retry_delay(p_failures integer)
RETURNS interval LANGUAGE sql IMMUTABLE SET search_path=''
AS $function$
  SELECT make_interval(mins=>CASE WHEN coalesce(p_failures,0)<=0 THEN 0
    ELSE least(30,(2*power(2,least(5,p_failures)))::integer) END);
$function$;
REVOKE ALL ON FUNCTION internal_proesc.fetch_retry_delay(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.fetch_backoff_active()
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT EXISTS(SELECT 1 FROM internal_proesc.sync_fetch_backoff b
    JOIN internal_proesc.connection c ON c.id AND c.revision=b.credential_revision
    WHERE b.singleton AND b.consecutive_failures>0 AND b.retry_after>now());
$function$;
REVOKE ALL ON FUNCTION internal_proesc.fetch_backoff_active() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.refresh_fetch_backoff(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $function$
DECLARE
  v_run internal_proesc.sync_runs; v_previous internal_proesc.sync_fetch_backoff;
  v_revision uuid; v_retryable boolean; v_failures integer;
BEGIN
  SELECT * INTO STRICT v_run FROM internal_proesc.sync_runs WHERE id=p_run_id;
  IF v_run.status='RUNNING' OR v_run.finished_at IS NULL THEN RETURN; END IF;
  SELECT * INTO v_previous FROM internal_proesc.sync_fetch_backoff WHERE singleton FOR UPDATE;
  IF v_previous.last_run_id=p_run_id THEN RETURN; END IF;
  SELECT revision INTO STRICT v_revision FROM internal_proesc.connection WHERE id;
  v_retryable:=v_run.status='FAILED' AND v_run.consulted=0 AND v_run.stage='FETCH' AND (
    v_run.error_code IN ('TIMEOUT','TRANSPORT_ERROR','ABORTED') OR (
      v_run.error_code='HTTP_ERROR' AND EXISTS(SELECT 1 FROM internal_proesc.sync_run_http h
        WHERE h.run_id=p_run_id AND h.error_code='HTTP_ERROR'
          AND (h.http_status=429 OR h.http_status BETWEEN 500 AND 599))));
  v_failures:=CASE WHEN v_retryable THEN least(5,CASE WHEN v_previous.credential_revision=v_revision
    THEN coalesce(v_previous.consecutive_failures,0) ELSE 0 END+1) ELSE 0 END;
  INSERT INTO internal_proesc.sync_fetch_backoff(singleton,last_run_id,credential_revision,
    consecutive_failures,retry_after,updated_at)
  VALUES(true,p_run_id,v_revision,v_failures,clock_timestamp()+internal_proesc.fetch_retry_delay(v_failures),clock_timestamp())
  ON CONFLICT(singleton) DO UPDATE SET last_run_id=EXCLUDED.last_run_id,
    credential_revision=EXCLUDED.credential_revision,consecutive_failures=EXCLUDED.consecutive_failures,
    retry_after=EXCLUDED.retry_after,updated_at=EXCLUDED.updated_at;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.refresh_fetch_backoff(uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE
  v_definition text;
  v_enqueue text:='if not exists(select 1 from internal_proesc.sync_runtime where id and enabled) then';
  v_claim text:='if not v_state.enabled or v_state.lease_until>now() then';
  v_finish text:='  perform internal_proesc.refresh_settled_polling(v_state.lease_id);';
  v_needle text;
BEGIN
  v_definition:=pg_get_functiondef('public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure);
  IF md5(v_definition)<>'3fdae397e9f7335c7938b40c64e5da18' THEN
    RAISE EXCEPTION 'Proesc runtime changed; rebase transient retry backoff.'; END IF;
  FOREACH v_needle IN ARRAY ARRAY[v_enqueue,v_claim,v_finish] LOOP
    IF (length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN
      RAISE EXCEPTION 'Proesc runtime selector changed; rebase transient retry backoff.'; END IF;
  END LOOP;
  v_definition:=replace(v_definition,v_enqueue,
    'if internal_proesc.fetch_backoff_active() or not exists(select 1 from internal_proesc.sync_runtime where id and enabled) then');
  v_definition:=replace(v_definition,v_claim,
    'if not v_state.enabled or v_state.lease_until>now() or internal_proesc.fetch_backoff_active() then');
  v_definition:=replace(v_definition,v_finish,v_finish||E'\n  perform internal_proesc.refresh_fetch_backoff(v_state.lease_id);');
  EXECUTE v_definition;
END;
$migration$;
