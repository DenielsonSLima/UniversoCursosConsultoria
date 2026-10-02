BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- User-authorized report composition for the single Porto payment on 01/10.
-- Reuse the reviewed full identity/configuration guard and calculated provenance.
-- This neither enables a future-payment rule nor changes a receipt or snapshot.
DO $porto_approval$
DECLARE
  v_candidate record;
  v_count integer:=0;
  v_existing internal_proesc.v2_composition_approvals;
BEGIN
  LOCK TABLE internal_proesc.v2_composition_approvals IN SHARE ROW EXCLUSIVE MODE;
  FOR v_candidate IN
    SELECT l.id link_id,s.id snapshot_id
    FROM public.contas_receber c
    JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
    JOIN LATERAL (
      SELECT id FROM internal_proesc.financial_snapshots s WHERE s.link_id=l.id
      ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1
    ) s ON true
    WHERE c.polo_id='31497afd-e2dd-4444-aa3d-8087c0ae0753'
      AND c.status='PAGO' AND c.valor=279.90 AND c.valor_pago=260
      AND c.data_pagamento='2026-10-01' AND c.data_vencimento='2026-10-05'
      AND internal_proesc.v2_calculated_composition_candidate(c.id,s.id)
    ORDER BY c.id
    FOR SHARE OF c,l
  LOOP
    v_count:=v_count+1;
    IF v_count>1 THEN
      RAISE EXCEPTION 'Expected exactly one reviewed Porto composition; re-review scope';
    END IF;
    SELECT * INTO v_existing FROM internal_proesc.v2_composition_approvals
      WHERE link_id=v_candidate.link_id;
    IF FOUND THEN
      -- Exact replay is harmless; never replace a prior snapshot approval.
      IF v_existing.snapshot_id IS DISTINCT FROM v_candidate.snapshot_id
        OR v_existing.approval_basis IS DISTINCT FROM 'USER_APPROVED_EARLY_PAYMENT_2026_10_01' THEN
        RAISE EXCEPTION 'Porto composition approval differs from the reviewed evidence';
      END IF;
    ELSE
      INSERT INTO internal_proesc.v2_composition_approvals(link_id,snapshot_id,approval_basis)
      VALUES(v_candidate.link_id,v_candidate.snapshot_id,'USER_APPROVED_EARLY_PAYMENT_2026_10_01');
    END IF;
  END LOOP;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one reviewed Porto composition; re-review scope';
  END IF;
END;
$porto_approval$;
COMMIT;
