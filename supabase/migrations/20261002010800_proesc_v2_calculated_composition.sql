BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- Explicit approval for four report compositions, not a new global V2 rule.
-- No receipt, payment, immutable evidence or accounting line is rewritten.
CREATE TABLE internal_proesc.v2_composition_approvals (
  link_id uuid PRIMARY KEY REFERENCES internal_proesc.obligation_links(id),
  snapshot_id uuid NOT NULL UNIQUE REFERENCES internal_proesc.financial_snapshots(id),
  approval_basis text NOT NULL CHECK(approval_basis='USER_APPROVED_EARLY_PAYMENT_2026_10_01'),
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE internal_proesc.v2_composition_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.v2_composition_approvals FROM PUBLIC,anon,authenticated,service_role;

-- Configuration supports the user-authorized calculation; it is not a proof of
-- applied source components. Only an exact, early, fully settled payment qualifies.
CREATE FUNCTION internal_proesc.v2_calculated_composition_candidate(
  p_receivable_id uuid,p_snapshot_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $candidate$
  SELECT EXISTS (
    SELECT 1 FROM public.contas_receber c
    JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
    JOIN public.turmas cl ON cl.id=c.turma_id
    JOIN internal_proesc.v2_enrollment_links pin ON pin.matricula_id=c.matricula_id
    JOIN LATERAL (
      SELECT * FROM internal_proesc.financial_snapshots s WHERE s.link_id=l.id
      ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1
    ) s ON s.id=p_snapshot_id
    JOIN LATERAL (
      SELECT * FROM internal_proesc.v2_invoice_observations o WHERE o.link_id=l.id
      ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1
    ) o ON true
    WHERE c.id=p_receivable_id AND c.status='PAGO'
      AND c.origem_pagamento='SISTEMA_ANTERIOR' AND c.tipo_lancamento='PARCELA'
      AND c.gateway_provider IS NULL AND c.gateway_payment_id IS NULL
      AND c.manual_settlement_id IS NULL AND c.gateway_financial_terms IS NULL
      AND c.valor=279.90 AND c.valor_pago=260 AND c.data_pagamento<=c.data_vencimento
      AND isfinite(c.data_pagamento) AND isfinite(c.data_vencimento)
      AND l.source_unit_id='3145' AND l.matricula_id=c.matricula_id AND l.turma_id=c.turma_id
      AND l.auto_enabled AND cl.polo_id=c.polo_id
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.obligation_links replacement WHERE replacement.parent_link_id=l.id)
      AND cl.codigo IN (
        'ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT','ENF-T39-SEM-PDF',
        'ENF-T40-INT-MAT','ENF-T41-SEM-AQB','ENF-T42-INT-MAT','ENF-T43-INT-MAT',
        'ENF-T44-SEM-AQB','ENF-T45-SEM-PDF')
      AND EXISTS(SELECT 1 FROM internal_proesc.class_scopes sc WHERE sc.turma_id=cl.id
        AND sc.class_code=cl.codigo AND sc.polo_id=cl.polo_id AND sc.source_unit_id=l.source_unit_id
        AND sc.source_class_id=l.source_class_id AND sc.phase='CONFIRMED')
      AND (c.regra_financeira_tecnica_snapshot IS NULL OR (
        c.regra_financeira_tecnica_snapshot->>'origem'='TURMA'
        AND c.regra_financeira_tecnica_snapshot->>'overrideAtivo' IS NULL
        AND c.regra_financeira_tecnica_snapshot#>>'{identidade,efetivaFingerprint}' IS NULL
        AND c.regra_financeira_tecnica_snapshot#>>'{identidade,overrideFingerprint}' IS NULL))
      AND NOT EXISTS(SELECT 1 FROM public.matriculas_tecnicas_financeiro_config cfg
        WHERE cfg.matricula_id=c.matricula_id AND cfg.override_ativo)
      AND s.evidence_kind='API_V2_INVOICE_PAID' AND s.source_status='PAID' AND s.verification='VERIFIED'
      AND s.principal_cents=27990 AND s.received_cents=26000 AND s.payment_date=c.data_pagamento
      AND s.accounting_lines='[]'::jsonb AND s.review_reasons='[]'::jsonb
      AND s.components='{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}'::jsonb
      AND o.snapshot_id=s.id AND o.result IN ('APPLIED','PRESERVED') AND o.source_status='PAGA'
      AND o.unit_id=l.source_unit_id AND o.invoice_id=l.source_key
      AND o.normalized->>'invoiceId'=l.source_key AND o.normalized->>'unitId'=l.source_unit_id
      AND o.normalized->>'sourceStatus'='PAGA' AND o.normalized->'reviewReasons'='[]'::jsonb
      AND o.normalized->>'dueDate'=c.data_vencimento::text
      AND o.normalized->>'paymentDate'=c.data_pagamento::text
      AND o.normalized->'principalCents'='27990'::jsonb AND o.normalized->'paidCents'='26000'::jsonb
      AND o.normalized->'financialConfiguration'=
        '{"fineRate":"2","interestRate":"0.033","earlyDiscountCents":1990,"fixedDiscountCents":0,"earlyDiscountPercentage":"7.1"}'::jsonb
      AND pin.unit_id=l.source_unit_id AND pin.source_class_id=l.source_class_id
      AND pin.source_class_id=o.normalized->>'sourceClassId'
      AND pin.source_person_id=o.normalized->>'personId'
      AND pin.source_enrollment_id=o.normalized->>'sourceEnrollmentId'
      AND pin.person_hash=o.normalized->>'personHash'
      AND pin.person_hash=internal_proesc.person_document_hash(c.cliente_id)
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id AND (
        h.evidence_kind='PORTAL_CONFIRMED' OR h.source_status='CANCELED'
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(h.accounting_lines) line
          WHERE line->>'cancelled'='true' OR line->>'renegotiation'='true')))
  );
$candidate$;
REVOKE ALL ON FUNCTION internal_proesc.v2_calculated_composition_candidate(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Freeze only the reviewed scope. Future matching payments require new approval.
DO $approval$
DECLARE v_count integer;
BEGIN
  INSERT INTO internal_proesc.v2_composition_approvals(link_id,snapshot_id,approval_basis)
  SELECT l.id,s.id,'USER_APPROVED_EARLY_PAYMENT_2026_10_01'
  FROM public.contas_receber c
  JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
  JOIN LATERAL (SELECT id FROM internal_proesc.financial_snapshots s WHERE s.link_id=l.id
    ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1) s ON true
  WHERE c.polo_id='44444444-4444-4444-4444-444444444444'
    AND c.data_pagamento='2026-10-01' AND c.data_vencimento='2026-10-05'
    AND internal_proesc.v2_calculated_composition_candidate(c.id,s.id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>4 THEN RAISE EXCEPTION 'Expected exactly four reviewed V2 compositions; re-review scope'; END IF;
END;
$approval$;

-- Patch the existing secured resolver only, retaining all old branches and ACLs.
DO $patch$
DECLARE
  v_oid oid:=to_regprocedure('public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)');
  v_definition text;
  v_metadata jsonb;
  v_marker text:=$marker$    if found and v_snapshot.verification='VERIFIED' and v_snapshot.source_status='PAID'$marker$;
  v_branch text:=$branch$    if found and exists (
      select 1 from internal_proesc.v2_composition_approvals approval
      where approval.link_id=v_snapshot.link_id and approval.snapshot_id=v_snapshot.id
    ) and internal_proesc.v2_calculated_composition_candidate(p_receivable_id,v_snapshot.id) then
      select * into v_calculated from internal_proesc.calculate_confirmed_payment_rule(
        p_valor_base,p_data_vencimento,p_data_pagamento);
      if found and v_calculated.juros=0 and v_calculated.multa=0
        and v_calculated.acrescimo=0 and v_calculated.desconto=19.90
        and p_valor_base+v_calculated.juros+v_calculated.multa+v_calculated.acrescimo
          -v_calculated.desconto=p_valor_pago then
        return query select p_valor_base,v_calculated.juros,v_calculated.multa,
          v_calculated.acrescimo,v_calculated.desconto,0::numeric,
          'CALCULADO_REGRA_INFORMADA_PROESC'::text,p_valor_pago;
        return;
      end if;
    end if;
$branch$;
BEGIN
  SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_definition,v_metadata
    FROM pg_proc p WHERE p.oid=v_oid;
  IF v_oid IS NULL OR md5(v_definition) IS DISTINCT FROM '9ed7e108cfcc61da8ccc251c6cf5319e'
    OR (length(v_definition)-length(replace(v_definition,v_marker,'')))/length(v_marker)<>1 THEN
    RAISE EXCEPTION 'Composition resolver drift; rebase reviewed V2 branch';
  END IF;
  EXECUTE replace(v_definition,v_marker,v_branch||v_marker);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM replace(v_definition,v_marker,v_branch||v_marker) THEN
    RAISE EXCEPTION 'Composition resolver changed outside the reviewed V2 branch';
  END IF;
END;
$patch$;
COMMIT;
