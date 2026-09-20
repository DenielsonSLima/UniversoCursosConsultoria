-- Lossless SQL packing of terminal technical items, preserving all public monitor identities.
CREATE TABLE internal_proesc.packed_run_items (
  run_id uuid PRIMARY KEY REFERENCES internal_proesc.sync_runs(id),
  records jsonb NOT NULL CHECK (jsonb_typeof(records)='array'),
  error_records jsonb NOT NULL CHECK (jsonb_typeof(error_records)='array'),
  polo_ids uuid[] NOT NULL,
  original_snapshot_ids uuid[] NOT NULL,
  scoped_counts jsonb NOT NULL CHECK (jsonb_typeof(scoped_counts)='array'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 60),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  packed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_array_length(records)=row_count)
);
CREATE INDEX packed_items_observations_idx ON internal_proesc.packed_run_items USING gin(original_snapshot_ids);
CREATE TABLE internal_proesc.packed_item_snapshot_refs (
  snapshot_id uuid PRIMARY KEY REFERENCES internal_proesc.financial_snapshots(id)
);
CREATE TABLE internal_proesc.packed_item_scope_refs (
  link_id uuid NOT NULL REFERENCES internal_proesc.obligation_links(id),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  class_id uuid NOT NULL REFERENCES public.turmas(id),
  PRIMARY KEY(link_id,polo_id,class_id)
);
ALTER TABLE internal_proesc.packed_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.packed_item_snapshot_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_proesc.packed_item_scope_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.packed_run_items,internal_proesc.packed_item_snapshot_refs,
  internal_proesc.packed_item_scope_refs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.guard_packed_item_keeper()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND EXISTS(
    SELECT 1 FROM internal_proesc.packed_item_snapshot_refs WHERE snapshot_id=OLD.id
  ) THEN RAISE EXCEPTION 'Evidência referenciada por itens compactados é imutável.' USING ERRCODE='40001'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.guard_packed_item_keeper() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER proesc_guard_packed_item_keeper BEFORE UPDATE ON internal_proesc.financial_snapshots
FOR EACH ROW EXECUTE FUNCTION internal_proesc.guard_packed_item_keeper();

CREATE VIEW internal_proesc.sync_run_item_history WITH (security_invoker=true) AS
SELECT * FROM internal_proesc.sync_run_items
UNION ALL
SELECT a.run_id,i.link_id,i.position,i.polo_id,i.class_id,i.snapshot_id,i.result,i.stage,
  i.error_code,i.recorded_at,i.original_snapshot_id
FROM internal_proesc.packed_run_items a
CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,a.records) i;
CREATE VIEW internal_proesc.sync_run_item_errors WITH (security_invoker=true) AS
SELECT * FROM internal_proesc.sync_run_items WHERE error_code IS NOT NULL
UNION ALL
SELECT a.run_id,i.link_id,i.position,i.polo_id,i.class_id,i.snapshot_id,i.result,i.stage,
  i.error_code,i.recorded_at,i.original_snapshot_id
FROM internal_proesc.packed_run_items a
CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,a.error_records) i;
REVOKE ALL ON internal_proesc.sync_run_item_history,internal_proesc.sync_run_item_errors
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.packed_item_eligible(p_item internal_proesc.sync_run_items)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT p_item.polo_id IS NOT NULL AND p_item.class_id IS NOT NULL
    AND ((p_item.result='UNCHANGED' AND p_item.error_code IS NULL
      AND p_item.recorded_at<now()-interval '24 hours'
      AND p_item.original_snapshot_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM internal_proesc.compacted_snapshot_observations a
        JOIN internal_proesc.financial_snapshots s ON s.id=a.keeper_snapshot_id
        WHERE a.id=p_item.original_snapshot_id AND a.keeper_snapshot_id=p_item.snapshot_id AND s.link_id=p_item.link_id
      )) OR (p_item.result IN ('NOT_RECORDED','FAILED') AND p_item.snapshot_id IS NULL AND p_item.original_snapshot_id IS NULL
        AND (p_item.recorded_at IS NULL OR p_item.recorded_at<now()-interval '24 hours')));
$function$;

CREATE FUNCTION internal_proesc.runs_for_observation(p_snapshot_id uuid)
RETURNS TABLE(run_id uuid) LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT i.run_id FROM internal_proesc.sync_run_items i WHERE coalesce(i.original_snapshot_id,i.snapshot_id)=p_snapshot_id
  UNION
  SELECT a.run_id FROM internal_proesc.packed_run_items a WHERE a.original_snapshot_ids@>ARRAY[p_snapshot_id];
$function$;

CREATE FUNCTION internal_proesc.run_item_counts(p_run_id uuid,p_polo_ids uuid[])
RETURNS TABLE(claimed bigint,consulted bigint,applied bigint,unchanged bigint,review bigint,failed bigint)
LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT coalesce(sum(c.claimed),0)::bigint,coalesce(sum(c.consulted),0)::bigint,
    coalesce(sum(c.applied),0)::bigint,coalesce(sum(c.unchanged),0)::bigint,
    coalesce(sum(c.review),0)::bigint,coalesce(sum(c.failed),0)::bigint FROM (
    SELECT count(*) claimed,count(*) FILTER(WHERE snapshot_id IS NOT NULL) consulted,
      count(*) FILTER(WHERE result='APPLIED') applied,count(*) FILTER(WHERE result='UNCHANGED') unchanged,
      count(*) FILTER(WHERE result='REVIEW') review,count(*) FILTER(WHERE result='FAILED') failed
    FROM internal_proesc.sync_run_items WHERE run_id=p_run_id AND polo_id=ANY(p_polo_ids)
    UNION ALL
    SELECT s.claimed,s.consulted,s.applied,s.unchanged,s.review,s.failed
    FROM internal_proesc.packed_run_items a
    CROSS JOIN LATERAL jsonb_to_recordset(a.scoped_counts)
      s(polo_id uuid,claimed bigint,consulted bigint,applied bigint,unchanged bigint,review bigint,failed bigint)
    WHERE a.run_id=p_run_id AND s.polo_id=ANY(p_polo_ids)
  ) c;
$function$;

CREATE FUNCTION internal_proesc.compact_sync_items(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_run uuid; v_new jsonb; v_records jsonb; v_errors jsonb; v_scoped jsonb;
  v_polos uuid[]; v_snapshots uuid[]; v_before text; v_after text;
  v_count integer; v_deleted integer; v_runs integer:=0; v_total integer:=0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Tamanho do lote de itens inválido.' USING ERRCODE='22023';
  END IF;
  FOR v_run IN
    SELECT r.id FROM internal_proesc.sync_runs r
    WHERE r.status IN ('SUCCEEDED','PARTIAL','FAILED','ABANDONED')
      AND coalesce(r.finished_at,r.abandoned_at)<now()-interval '24 hours'
      AND EXISTS(SELECT 1 FROM internal_proesc.sync_run_items i WHERE i.run_id=r.id AND internal_proesc.packed_item_eligible(i))
    ORDER BY r.started_at,r.id LIMIT p_limit FOR UPDATE OF r SKIP LOCKED
  LOOP
    SELECT encode(extensions.digest(string_agg(to_jsonb(i)::text,'' ORDER BY position,link_id),'sha256'),'hex')
      INTO v_before FROM internal_proesc.sync_run_item_history i WHERE run_id=v_run;
    SELECT jsonb_agg(to_jsonb(i)-'run_id' ORDER BY position,link_id),count(*) INTO v_new,v_count
      FROM internal_proesc.sync_run_items i WHERE run_id=v_run AND internal_proesc.packed_item_eligible(i);
    IF v_count NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Contagem de itens fora do contrato.'; END IF;
    SELECT coalesce((SELECT records FROM internal_proesc.packed_run_items WHERE run_id=v_run),'[]'::jsonb)||v_new INTO v_records;
    IF jsonb_array_length(v_records)>60 OR EXISTS(
      SELECT 1 FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,v_records) i GROUP BY link_id HAVING count(*)>1
    ) OR EXISTS(
      SELECT 1 FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,v_records) i GROUP BY position HAVING count(*)>1
    ) THEN RAISE EXCEPTION 'Identidade ou posição de item duplicada.'; END IF;
    INSERT INTO internal_proesc.packed_item_snapshot_refs(snapshot_id)
      SELECT DISTINCT snapshot_id FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,v_new)
      WHERE snapshot_id IS NOT NULL ON CONFLICT DO NOTHING;
    INSERT INTO internal_proesc.packed_item_scope_refs(link_id,polo_id,class_id)
      SELECT DISTINCT link_id,polo_id,class_id FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,v_new)
      ON CONFLICT DO NOTHING;
    SELECT jsonb_agg(value ORDER BY (value->>'position')::integer,value->>'link_id'),
      coalesce(jsonb_agg(value ORDER BY (value->>'position')::integer) FILTER(WHERE value->>'error_code' IS NOT NULL),'[]'::jsonb)
      INTO v_records,v_errors FROM jsonb_array_elements(v_records);
    SELECT array_agg(DISTINCT polo_id ORDER BY polo_id),
      coalesce(array_agg(DISTINCT original_snapshot_id ORDER BY original_snapshot_id)
        FILTER(WHERE original_snapshot_id IS NOT NULL),ARRAY[]::uuid[])
      INTO v_polos,v_snapshots FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,v_records);
    SELECT jsonb_agg(to_jsonb(s) ORDER BY polo_id) INTO v_scoped FROM (
      SELECT polo_id,count(*) claimed,count(*) FILTER(WHERE snapshot_id IS NOT NULL) consulted,
        count(*) FILTER(WHERE result='APPLIED') applied,count(*) FILTER(WHERE result='UNCHANGED') unchanged,
        count(*) FILTER(WHERE result='REVIEW') review,count(*) FILTER(WHERE result='FAILED') failed
      FROM jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,v_records) GROUP BY polo_id
    ) s;
    INSERT INTO internal_proesc.packed_run_items(run_id,records,error_records,polo_ids,original_snapshot_ids,scoped_counts,row_count,content_sha256)
      VALUES(v_run,v_records,v_errors,v_polos,v_snapshots,v_scoped,jsonb_array_length(v_records),
        encode(extensions.digest(v_records::text,'sha256'),'hex'))
      ON CONFLICT(run_id) DO UPDATE SET records=excluded.records,error_records=excluded.error_records,
        polo_ids=excluded.polo_ids,original_snapshot_ids=excluded.original_snapshot_ids,scoped_counts=excluded.scoped_counts,
        row_count=excluded.row_count,content_sha256=excluded.content_sha256,packed_at=now();
    DELETE FROM internal_proesc.sync_run_items i WHERE i.run_id=v_run
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_new) e WHERE e->>'link_id'=i.link_id::text);
    GET DIAGNOSTICS v_deleted=ROW_COUNT;
    IF v_deleted<>v_count THEN RAISE EXCEPTION 'Contagem de itens mudou durante consolidação.'; END IF;
    SELECT encode(extensions.digest(string_agg(to_jsonb(i)::text,'' ORDER BY position,link_id),'sha256'),'hex')
      INTO v_after FROM internal_proesc.sync_run_item_history i WHERE run_id=v_run;
    IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Conteúdo, escopo ou identidade do item alterado.'; END IF;
    v_runs:=v_runs+1; v_total:=v_total+v_count;
  END LOOP;
  RETURN jsonb_build_object('packedRuns',v_runs,'packedRows',v_total,'historyVerified',true);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.packed_item_eligible(internal_proesc.sync_run_items),
  internal_proesc.runs_for_observation(uuid),
  internal_proesc.run_item_counts(uuid,uuid[]),internal_proesc.compact_sync_items(integer)
  FROM PUBLIC,anon,authenticated,service_role;

-- Protect permanent keeper references before the observation compactor attempts its DELETE.
DO $migration$
DECLARE v_definition text; v_old text;
BEGIN
  v_definition:=pg_get_functiondef('internal_proesc.compact_snapshot_observations(integer)'::regprocedure);
  IF md5(v_definition)<>'7347d1f7c5b81a65915eec2d7c77990c' THEN
    RAISE EXCEPTION 'Compactador remoto mudou; revisar referências de itens antes da aplicação.';
  END IF;
  v_old:='AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations a WHERE a.keeper_snapshot_id=s.id)';
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Guarda de keeper não localizada.'; END IF;
  EXECUTE replace(v_definition,v_old,v_old||E'\n    AND NOT EXISTS(SELECT 1 FROM internal_proesc.packed_item_snapshot_refs a WHERE a.snapshot_id=s.id)');
END;
$migration$;

-- Follows the HTTP packing migration; only item readers change here.
DO $migration$
DECLARE v_definition text; v_old text; v_new text; v_scope text; v_visible text;
BEGIN
  v_scope:='exists(select 1 from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos))';
  v_visible:='('||v_scope||' or exists(select 1 from internal_proesc.packed_run_items a where a.run_id=r.id and a.polo_ids&&v_polos))';
  v_definition:=pg_get_functiondef('public.get_proesc_reconciliation_dashboard(uuid,timestamptz,timestamptz)'::regprocedure);
  IF md5(v_definition)<>'8ffe5b1272e5d8c50d960bb815fb7ea0' OR strpos(v_definition,v_scope)=0 THEN
    RAISE EXCEPTION 'Dashboard remoto difere da base HTTP esperada.';
  END IF;
  EXECUTE replace(v_definition,v_scope,v_visible);

  v_definition:=pg_get_functiondef('public.get_proesc_reconciliation_feed_page(text,uuid,uuid,timestamptz,timestamptz,integer,integer)'::regprocedure);
  IF md5(v_definition)<>'e658e5336fc021999345f8786d74d435' THEN
    RAISE EXCEPTION 'Feed remoto difere da base HTTP esperada.';
  END IF;
  v_definition:=replace(v_definition,v_scope,'__PROESC_RUN_VISIBLE__');
  v_old:=$old$cross join lateral(select count(*) claimed,count(*) filter(where snapshot_id is not null) consulted,
      count(*) filter(where result='APPLIED') applied,count(*) filter(where result='UNCHANGED') unchanged,
      count(*) filter(where result='REVIEW') review,count(*) filter(where result='FAILED') failed
      from internal_proesc.sync_run_items i where i.run_id=r.id and i.polo_id=any(v_polos)) scoped$old$;
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Contadores por polo não localizados.'; END IF;
  v_definition:=replace(v_definition,v_old,'cross join lateral internal_proesc.run_item_counts(r.id,v_polos) scoped');
  v_old:=$old$(select run_id from internal_proesc.sync_run_items
        where coalesce(original_snapshot_id,snapshot_id)=s.id offset 0) i$old$;
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Busca de observação por run não localizada.'; END IF;
  v_definition:=replace(v_definition,v_old,'internal_proesc.runs_for_observation(s.id) i');
  v_definition:=replace(v_definition,'internal_proesc.sync_run_items','internal_proesc.sync_run_item_history');
  v_old:='from internal_proesc.sync_run_item_history i join runs r on r.id=i.run_id where i.error_code is not null';
  v_new:='from internal_proesc.sync_run_item_errors i join runs r on r.id=i.run_id where i.error_code is not null';
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Fonte de erros dos itens não localizada.'; END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  v_old:='from internal_proesc.sync_run_item_history i where i.run_id=r.id and i.error_code is not null';
  v_new:='from internal_proesc.sync_run_item_errors i where i.run_id=r.id and i.error_code is not null';
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Existência de erro por run não localizada.'; END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE replace(v_definition,'__PROESC_RUN_VISIBLE__',v_visible);
END;
$migration$;
