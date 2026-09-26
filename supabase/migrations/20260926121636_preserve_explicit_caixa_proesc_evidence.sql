BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='8s';
-- Read-side evidence selection only: no receipt, observation, polling or money writes.
-- An empty payment search is not a new explicit financial state.
DO $retention$
BEGIN
  IF md5(pg_get_functiondef('internal_proesc.compact_snapshot_observations(integer)'::regprocedure))
    IS DISTINCT FROM '78ce8e039c288d7f849112d63171d002' THEN
    RAISE EXCEPTION 'Observation retention changed: review state-boundary preservation first';
  END IF;
END;
$retention$;

-- These private invoker-only SQL helpers deliberately have no SET clause so
-- PostgreSQL can inline them into the two existing secured readers' plans.
-- All stored-object/function references are qualified; callers retain their
-- original SECURITY DEFINER + empty search_path and no helper receives a grant.
CREATE FUNCTION internal_contas.caixa_proesc_uninformative_observation(
  p_snapshot internal_proesc.financial_snapshots, p_principal bigint
) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER
AS $uninformative$
  SELECT coalesce(
    p_snapshot.verification='REVIEW' AND p_snapshot.source_status='UNKNOWN'
    AND p_snapshot.evidence_kind='UNRESOLVED'
    AND p_snapshot.principal_cents=p_principal
    AND p_snapshot.received_cents IS NULL AND p_snapshot.payment_date IS NULL
    AND p_snapshot.open_evidence IS NULL
    AND p_snapshot.collector_review_reasons='["NO_PAYMENT_IN_OBSERVED_PERIODS"]'::jsonb
    AND p_snapshot.review_reasons='["ESTADO_REQUER_REVISAO","SEM_CONFIRMACAO"]'::jsonb
    AND p_snapshot.components='{"interestCents":null,"penaltyCents":null,"discountCents":null,"additionCents":null}'::jsonb
    -- A cancellation/adjustment/unknown block is informative, even without block 2.
    AND pg_catalog.jsonb_typeof(p_snapshot.accounting_lines)='array'
    AND pg_catalog.jsonb_array_length(p_snapshot.accounting_lines)=1
    AND p_snapshot.accounting_lines->0->>'blockCode'='1'
    AND p_snapshot.accounting_lines->0->>'amountCents'=p_principal::text
    AND coalesce(p_snapshot.accounting_lines->0->'paymentDate','null'::jsonb)='null'::jsonb
    AND p_snapshot.accounting_lines->0->'cancelled'='false'::jsonb
    AND p_snapshot.accounting_lines->0->'renegotiation'='false'::jsonb,
    false
  );
$uninformative$;

CREATE FUNCTION internal_contas.caixa_proesc_effective_snapshot(
  p_receivable public.contas_receber, p_link_id uuid
) RETURNS SETOF internal_proesc.financial_snapshots
LANGUAGE sql STABLE SECURITY INVOKER ROWS 1
AS $effective$
  WITH latest AS MATERIALIZED (
    SELECT ROW(s.*)::internal_proesc.financial_snapshots AS snapshot
    FROM internal_proesc.financial_snapshots s
    WHERE s.link_id=p_link_id
    ORDER BY s.observed_at DESC,s.recorded_at DESC,s.id DESC LIMIT 1
  ), barrier AS MATERIALIZED (
    -- Stop at the FIRST informative observation. Never jump over a conflict to
    -- find any older VERIFIED row. Compaction retains the first AND last row of
    -- every exact-content block. Every state boundary selected here survives;
    -- historical replay still uses financial_observation_history separately.
    SELECT ROW(s.*)::internal_proesc.financial_snapshots AS snapshot
    FROM internal_proesc.financial_snapshots s
    WHERE s.link_id=p_link_id
      AND EXISTS(SELECT 1 FROM latest l WHERE
        internal_contas.caixa_proesc_uninformative_observation(l.snapshot,pg_catalog.round(p_receivable.valor*100)::bigint))
      AND NOT internal_contas.caixa_proesc_uninformative_observation(ROW(s.*)::internal_proesc.financial_snapshots,pg_catalog.round(p_receivable.valor*100)::bigint)
    ORDER BY s.observed_at DESC,s.recorded_at DESC,s.id DESC LIMIT 1
  ), selected AS (
    SELECT CASE WHEN
      internal_contas.caixa_proesc_uninformative_observation(l.snapshot,pg_catalog.round(p_receivable.valor*100)::bigint)
      AND (b.snapshot).verification='VERIFIED' AND (b.snapshot).source_status='OPEN'
      AND (b.snapshot).evidence_kind IN ('PORTAL_CONFIRMED','API_OPEN_OBLIGATION')
      AND (b.snapshot).review_reasons='[]'::jsonb
      AND (b.snapshot).collector_review_reasons='[]'::jsonb
      AND internal_contas.caixa_proesc_open_receivable_verified(p_receivable,b.snapshot)
      -- Preserve the proof's own age; a poll never refreshes observed_at.
      -- No new expiration policy is introduced by this correction.
      AND pg_catalog.isfinite((b.snapshot).observed_at)
      AND (b.snapshot).observed_at<=pg_catalog.now()+interval '5 minutes'
      AND p_receivable.updated_at IS NOT NULL
      AND p_receivable.updated_at<=(b.snapshot).recorded_at
      AND EXISTS(SELECT 1 FROM internal_proesc.obligation_links link
        WHERE link.id=p_link_id AND link.receivable_id=p_receivable.id
          AND link.matricula_id=p_receivable.matricula_id
          AND link.turma_id=p_receivable.turma_id
          AND link.confirmed_at<=(b.snapshot).recorded_at
          AND NOT EXISTS(SELECT 1 FROM internal_proesc.obligation_links replacement
            WHERE replacement.parent_link_id=link.id))
      THEN b.snapshot ELSE l.snapshot END AS snapshot
    FROM latest l LEFT JOIN barrier b ON true
  )
  SELECT (s.snapshot).* FROM selected s;
$effective$;

REVOKE ALL ON FUNCTION
  internal_contas.caixa_proesc_uninformative_observation(internal_proesc.financial_snapshots,bigint),
  internal_contas.caixa_proesc_effective_snapshot(public.contas_receber,uuid)
FROM public,anon,authenticated,service_role;

DO $patch$
DECLARE
  v_target record; v_oid oid; v_definition text; v_metadata jsonb;
BEGIN
  FOR v_target IN SELECT * FROM (VALUES
    ('internal_contas.caixa_monthly_delinquency(uuid,date,date)',
      'c32d1f8caaeaba081405f945cd9aae81',
      $old_monthly$from internal_proesc.financial_snapshots s where s.link_id=l.id
      order by s.observed_at desc,s.recorded_at desc,s.id desc limit 1$old_monthly$,
      'from internal_contas.caixa_proesc_effective_snapshot(c,l.id) s'),
    ('internal_contas.caixa_open_receivables(uuid)',
      'b95b6bd9d8719fb3ba396f88b5ff9599',
      $old_open$select s as snapshot from internal_proesc.financial_snapshots s where s.link_id = l.id
      order by s.observed_at desc, s.recorded_at desc, s.id desc limit 1$old_open$,
      'select s as snapshot from internal_contas.caixa_proesc_effective_snapshot(c,l.id) s')
  ) AS t(signature,expected_md5,old_fragment,new_fragment)
  LOOP
    v_oid:=to_regprocedure(v_target.signature);
    SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_definition,v_metadata
      FROM pg_proc p WHERE p.oid=v_oid;
    IF v_oid IS NULL OR md5(v_definition) IS DISTINCT FROM v_target.expected_md5
      OR (length(v_definition)-length(replace(v_definition,v_target.old_fragment,'')))
        /length(v_target.old_fragment)<>1 THEN
      RAISE EXCEPTION 'Caixa evidence reader drift: review and rebase %',v_target.signature;
    END IF;
    EXECUTE replace(v_definition,v_target.old_fragment,v_target.new_fragment);
    IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata
      OR pg_get_functiondef(v_oid) IS DISTINCT FROM
        replace(v_definition,v_target.old_fragment,v_target.new_fragment) THEN
      RAISE EXCEPTION 'Caixa reader metadata or body changed outside the reviewed fragment';
    END IF;
  END LOOP;
END;
$patch$;

NOTIFY pgrst,'reload schema';

COMMIT;