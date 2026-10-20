BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='8s';

-- SQL AND/OR do not establish function evaluation order. CASE avoids invoking
-- the expensive evidence queries for facts that their canonical guards reject.
-- The enclosing receipt branch already matches these arguments to the row.
DO $patch$
DECLARE
  v_oid oid:=to_regprocedure('public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)');
  v_definition text; v_expected text; v_metadata jsonb;
  v_old_net text:=$old_net$    if found and internal_proesc.v2_net_discount_candidate(p_receivable_id,v_snapshot.id) then$old_net$;
  v_new_net text:=$new_net$    if (case when found and p_valor_pago>0 and p_valor_pago<p_valor_base
      and p_data_pagamento>='2026-10-01'::date
      then internal_proesc.v2_net_discount_candidate(p_receivable_id,v_snapshot.id)
      else false end) then$new_net$;
  v_old_early text:=$old_early$    if found and (exists (
      select 1 from internal_proesc.v2_composition_approvals approval
      where approval.link_id=v_snapshot.link_id and approval.snapshot_id=v_snapshot.id
    ) or internal_proesc.v2_automatic_composition_allowed(p_receivable_id))
      and internal_proesc.v2_calculated_composition_candidate(p_receivable_id,v_snapshot.id) then$old_early$;
  v_new_early text:=$new_early$    if (case when found and p_valor_base=279.90 and p_valor_pago=260
      and p_data_pagamento<=p_data_vencimento then
      case when exists (
        select 1 from internal_proesc.v2_composition_approvals approval
        where approval.link_id=v_snapshot.link_id and approval.snapshot_id=v_snapshot.id
      ) or internal_proesc.v2_automatic_composition_allowed(p_receivable_id)
      then internal_proesc.v2_calculated_composition_candidate(p_receivable_id,v_snapshot.id)
      else false end
      else false end) then$new_early$;
BEGIN
  SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
    INTO v_definition,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF v_oid IS NULL OR md5(v_definition) IS DISTINCT FROM 'c4cbe356f04f83c78fd80747af6f47dc'
    OR (length(v_definition)-length(replace(v_definition,v_old_net,'')))/length(v_old_net)<>1
    OR (length(v_definition)-length(replace(v_definition,v_old_early,'')))/length(v_old_early)<>1 THEN
    RAISE EXCEPTION 'Composition resolver drift; review evidence evaluation gates';
  END IF;
  v_expected:=replace(replace(v_definition,v_old_net,v_new_net),v_old_early,v_new_early);
  EXECUTE v_expected;
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Evidence gates changed unreviewed resolver body/metadata';
  END IF;
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
