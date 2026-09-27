-- Avoid reconstructing canonical history when a selected batch has no candidates.
-- Positive-work batches retain both complete hashes, all evidence guards and locks.
-- Do not change cron cadence, batch size, retention or any observation data here.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='8s';

DO $migration$
DECLARE
  v_oid regprocedure:='internal_proesc.compact_snapshot_observations(integer)'::regprocedure;
  v_definition text; v_expected text; v_metadata jsonb;
  v_hash_select text:=$hash$  SELECT md5(coalesce(string_agg(md5(to_jsonb(h)::text),'' ORDER BY h.id),''))
    INTO v_before FROM internal_proesc.financial_observation_history h WHERE h.link_id=ANY(v_links);
$hash$;
  v_branch text:=E'  IF v_count>0 THEN\n';
BEGIN
  SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
    INTO STRICT v_definition,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_definition)<>'78ce8e039c288d7f849112d63171d002'
    OR (length(v_definition)-length(replace(v_definition,v_hash_select,'')))/length(v_hash_select)<>1
    OR (length(v_definition)-length(replace(v_definition,v_branch,'')))/length(v_branch)<>1 THEN
    RAISE EXCEPTION 'Observation compactor source drift; review before moving the idle hash.';
  END IF;

  -- The map is computed while the existing state/link locks are held. No write
  -- precedes the relocated hash, so active batches keep the same before/after proof.
  v_expected:=replace(v_definition,v_hash_select,'');
  v_expected:=replace(v_expected,v_branch,
    v_branch||'  '||replace(rtrim(v_hash_select,E'\n'),E'\n',E'\n  ')||E'\n');
  EXECUTE v_expected;

  IF pg_get_functiondef(v_oid) IS DISTINCT FROM v_expected
    OR (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata THEN
    RAISE EXCEPTION 'Unexpected compactor body, identity, privilege or configuration change.';
  END IF;
END;
$migration$;
COMMIT;
