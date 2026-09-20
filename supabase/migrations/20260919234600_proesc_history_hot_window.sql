-- Six hours of hot observations/receipts; older evidence remains losslessly recoverable.
-- Financial-event retention and HTTP/item packing retain their separate 24-hour limits.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $migration$
DECLARE
  v_spec record; v_oid regprocedure; v_body text; v_definition text; v_replacement text;
  v_old text:='interval ''24 hours'''; v_new text:='interval ''6 hours''';
  v_default_old text:='''24:00:00''::interval';
BEGIN
  FOR v_spec IN SELECT * FROM (VALUES
    ('internal_proesc.compact_snapshot_observations(integer)',
      '4408dde5acb9067be99c48c1acde8b18',3,false),
    ('public.proesc_prepare_receipt_archive_service(integer,timestamptz)',
      '6e3d49a85bcd70de789ccc8d2d3ac69b',1,true),
    ('public.proesc_commit_receipt_archive_service(uuid,uuid,text,text,bigint)',
      'd73dd5b0c57c8b42baec1b763b44f637',1,false)
  ) specification(signature,body_md5,occurrences,changes_default)
  LOOP
    v_oid:=v_spec.signature::regprocedure;
    SELECT prosrc INTO STRICT v_body FROM pg_proc WHERE oid=v_oid;
    v_definition:=pg_get_functiondef(v_oid);
    IF md5(v_body)<>v_spec.body_md5
      OR (length(v_body)-length(replace(v_body,v_old,'')))/length(v_old)<>v_spec.occurrences THEN
      RAISE EXCEPTION 'History hot-window source drift: %',v_spec.signature;
    END IF;
    v_replacement:=replace(v_definition,v_old,v_new);
    IF v_spec.changes_default THEN
      IF (length(v_definition)-length(replace(v_definition,v_default_old,'')))/length(v_default_old)<>1 THEN
        RAISE EXCEPTION 'Receipt preparation default differs from the reviewed 24-hour contract.';
      END IF;
      v_replacement:=replace(v_replacement,v_default_old,'''06:00:00''::interval');
    END IF;
    EXECUTE v_replacement;
    -- The only body difference must be the reviewed interval literals.
    IF (SELECT replace(prosrc,v_new,v_old) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_body THEN
      RAISE EXCEPTION 'Unexpected body change while adjusting the history hot window.';
    END IF;
  END LOOP;
END;
$migration$;
