-- Remove per-row SPI calls while keeping the exact, reviewed eligibility predicate.
-- Applied migrations remain unchanged; both source definitions are checked for drift.
DO $migration$
DECLARE v_definition text; v_helper text; v_predicate text; v_call text:='internal_proesc.packed_item_eligible(i)';
BEGIN
  v_definition:=pg_get_functiondef('internal_proesc.compact_sync_items(integer)'::regprocedure);
  v_helper:=pg_get_functiondef('internal_proesc.packed_item_eligible(internal_proesc.sync_run_items)'::regprocedure);
  IF md5(v_definition)<>'fe0789cb2926826608acf6075151c0ae'
    OR md5(v_helper)<>'6e30cc2ed3bfa133a2dd971f2af8c810' THEN
    RAISE EXCEPTION 'Compactador ou elegibilidade mudou; revisar antes de eliminar chamadas por linha.';
  END IF;
  SELECT prosrc INTO v_predicate FROM pg_proc
    WHERE oid='internal_proesc.packed_item_eligible(internal_proesc.sync_run_items)'::regprocedure;
  v_predicate:=regexp_replace(v_predicate,'^\s*SELECT\s+','','i');
  v_predicate:=regexp_replace(v_predicate,';\s*$','');
  v_predicate:=replace(v_predicate,'p_item.','i.');
  IF (length(v_definition)-length(replace(v_definition,v_call,'')))/length(v_call)<>2
    OR strpos(v_predicate,'p_item.')>0 OR strpos(v_predicate,'i.original_snapshot_id')=0 THEN
    RAISE EXCEPTION 'Ocorrências ou predicado não correspondem à revisão.';
  END IF;
  EXECUTE replace(v_definition,v_call,'('||v_predicate||')');
END;
$migration$;
