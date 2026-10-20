BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '8s';

-- Resolve the unique receipt link before scanning its history. The old join
-- sorts every snapshot for each receipt; the scalar InitPlan lets the existing
-- (link_id, observed_at DESC) index stop at the latest timestamp group.
-- Preserve every evidence status and the complete recorded_at/id tie-break.
DO $patch$
DECLARE
  v_oid oid := to_regprocedure('public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)');
  v_definition text;
  v_metadata jsonb;
  v_old text := $old$    select snapshot.* into v_snapshot
    from internal_proesc.financial_snapshots snapshot
    join internal_proesc.obligation_links link on link.id=snapshot.link_id
    where link.receivable_id=p_receivable_id
    order by snapshot.observed_at desc,snapshot.recorded_at desc,snapshot.id desc limit 1;$old$;
  v_new text := $new$    select snapshot.* into v_snapshot
    from internal_proesc.financial_snapshots snapshot
    where snapshot.link_id=(
      select link.id from internal_proesc.obligation_links link
      where link.receivable_id=p_receivable_id
    )
    order by snapshot.observed_at desc,snapshot.recorded_at desc,snapshot.id desc limit 1;$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid), to_jsonb(p)-'prosrc'
    INTO v_definition, v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF v_oid IS NULL OR md5(v_definition) IS DISTINCT FROM '5f0357c93d635447fd6cb21d7ea7c73c'
    OR (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Composition resolver drift; review latest snapshot lookup before applying';
  END IF;
  -- Scalar lookup is equivalent only while each active receipt has one link.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='receivable_id'
    WHERE c.conrelid='internal_proesc.obligation_links'::regclass
      AND c.contype='u' AND c.conkey=ARRAY[a.attnum]::smallint[]
      AND c.convalidated AND NOT c.condeferrable
  ) THEN
    RAISE EXCEPTION 'Unique nondeferrable receivable link required for scalar lookup';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM replace(v_definition,v_old,v_new) THEN
    RAISE EXCEPTION 'Latest snapshot patch changed unreviewed resolver body/metadata';
  END IF;
END;
$patch$;
NOTIFY pgrst, 'reload schema';
COMMIT;
