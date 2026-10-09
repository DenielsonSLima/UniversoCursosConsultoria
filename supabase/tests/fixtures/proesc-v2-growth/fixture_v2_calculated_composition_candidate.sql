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
