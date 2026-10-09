CREATE FUNCTION internal_proesc.v2_net_discount_candidate(p_receivable_id uuid,p_snapshot_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $candidate$
  SELECT EXISTS (
    SELECT 1 FROM public.contas_receber c
    JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
    JOIN public.turmas t ON t.id=c.turma_id
    JOIN public.matriculas m ON m.id=c.matricula_id AND m.aluno_id=c.cliente_id AND m.turma_id=c.turma_id
    JOIN internal_proesc.v2_enrollment_links pin ON pin.matricula_id=c.matricula_id
    JOIN LATERAL (SELECT * FROM internal_proesc.financial_snapshots s WHERE s.link_id=l.id
      ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1) s ON s.id=p_snapshot_id
    JOIN LATERAL (SELECT * FROM internal_proesc.v2_invoice_observations o
      WHERE o.unit_id=l.source_unit_id AND o.invoice_id=l.source_key
      ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1) o ON true
    JOIN LATERAL (SELECT id FROM internal_proesc.v2_runs
      WHERE mode='FULL' AND status='COMPLETE' ORDER BY finished_at DESC,id DESC LIMIT 1) full_run ON true
    WHERE c.id=p_receivable_id AND c.status='PAGO' AND c.tipo_lancamento='PARCELA'
      AND c.origem_pagamento='SISTEMA_ANTERIOR' AND c.valor>0 AND c.valor_pago>0 AND c.valor_pago<c.valor
      AND c.valor*100=round(c.valor*100) AND c.valor_pago*100=round(c.valor_pago*100)
      AND isfinite(c.data_vencimento) AND isfinite(c.data_pagamento)
      AND c.data_pagamento>='2026-10-01'::date
      AND c.data_pagamento<=(now() AT TIME ZONE 'America/Maceio')::date
      AND c.gateway_provider IS NULL AND c.gateway_payment_id IS NULL
      AND c.gateway_financial_terms IS NULL AND c.gateway_creation_token IS NULL
      AND c.gateway_submission_channel IS NULL AND c.gateway_submission_status IS NULL
      AND c.gateway_boleto_nosso_numero IS NULL AND c.asaas_payment_id IS NULL
      AND c.nosso_numero_asaas IS NULL AND c.manual_settlement_id IS NULL
      AND l.archived_receivable_id IS NULL AND l.auto_enabled AND l.parent_link_id IS NULL
      AND l.source_unit_id='3145' AND l.matricula_id=c.matricula_id AND l.turma_id=c.turma_id
      AND t.polo_id=c.polo_id
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.obligation_links child WHERE child.parent_link_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM public.payment_gateway_transactions g WHERE g.receivable_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM internal_academic.technical_manual_cycle_runs r WHERE c.id=ANY(r.receivable_ids))
      AND EXISTS(SELECT 1 FROM internal_proesc.class_scopes sc WHERE sc.turma_id=t.id
        AND sc.class_code=t.codigo AND sc.polo_id=c.polo_id AND sc.phase='CONFIRMED'
        AND sc.source_unit_id=l.source_unit_id AND sc.source_class_id=l.source_class_id)
      AND (c.regra_financeira_tecnica_snapshot IS NULL OR (
        c.regra_financeira_tecnica_snapshot->>'origem'='TURMA'
        AND c.regra_financeira_tecnica_snapshot->>'overrideAtivo' IS NULL
        AND c.regra_financeira_tecnica_snapshot#>>'{identidade,efetivaFingerprint}' IS NULL
        AND c.regra_financeira_tecnica_snapshot#>>'{identidade,overrideFingerprint}' IS NULL
        AND c.regra_financeira_tecnica_snapshot->'cicloManual' IS NULL))
      AND NOT EXISTS(SELECT 1 FROM public.matriculas_tecnicas_financeiro_config cfg
        WHERE cfg.matricula_id=c.matricula_id AND cfg.override_ativo)
      AND s.evidence_kind='API_V2_INVOICE_PAID' AND s.source_status='PAID' AND s.verification='VERIFIED'
      AND s.principal_cents=round(c.valor*100)::bigint AND s.received_cents=round(c.valor_pago*100)::bigint
      AND s.payment_date=c.data_pagamento AND s.review_reasons='[]'::jsonb
      AND s.accounting_lines='[]'::jsonb
      AND s.components='{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}'::jsonb
      AND o.link_id=l.id AND o.snapshot_id=s.id AND o.result IN ('APPLIED','PRESERVED')
      AND o.source_status='PAGA' AND o.normalized->>'sourceStatus'='PAGA'
      AND o.normalized->'reviewReasons'='[]'::jsonb
      AND isfinite(o.observed_at) AND o.observed_at<=now()+interval '5 minutes'
      AND s.observed_at<=o.observed_at
      AND o.normalized->>'unitId'=l.source_unit_id AND o.normalized->>'invoiceId'=l.source_key
      AND o.normalized->>'sourceClassId'=l.source_class_id
      AND o.normalized->>'dueDate'=c.data_vencimento::text
      AND o.normalized->>'paymentDate'=c.data_pagamento::text
      AND o.normalized->'principalCents'=to_jsonb(round(c.valor*100)::bigint)
      AND o.normalized->'paidCents'=to_jsonb(round(c.valor_pago*100)::bigint)
      AND pin.unit_id=l.source_unit_id AND pin.source_class_id=l.source_class_id
      AND pin.source_person_id=o.normalized->>'personId'
      AND pin.source_enrollment_id=o.normalized->>'sourceEnrollmentId'
      AND pin.person_hash=o.normalized->>'personHash'
      AND pin.person_hash=internal_proesc.person_document_hash(c.cliente_id)
      AND (SELECT count(DISTINCT(p.person_id,e->>'sourceEnrollmentId'))
        FROM internal_proesc.v2_people_observations p CROSS JOIN LATERAL jsonb_array_elements(p.enrollments) e
        WHERE p.run_id=full_run.id AND p.unit_id=l.source_unit_id AND p.person_hash=pin.person_hash
          AND e->>'sourceClassId'=l.source_class_id)=1
      AND EXISTS(SELECT 1 FROM internal_proesc.v2_people_observations p
        CROSS JOIN LATERAL jsonb_array_elements(p.enrollments) e
        WHERE p.run_id=full_run.id AND p.unit_id=pin.unit_id AND p.person_hash=pin.person_hash
          AND p.person_id=pin.source_person_id AND e->>'sourceClassId'=pin.source_class_id
          AND e->>'sourceEnrollmentId'=pin.source_enrollment_id)
      -- Never replace an explicit/ambiguous payment conference with this default.
      -- Historical OPEN proof is compatible with a later documented payment.
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id AND (
        h.source_status='CANCELED'
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(h.accounting_lines) line
          WHERE line->>'cancelled'='true' OR line->>'renegotiation'='true')
        OR (h.source_status='PAID' AND (h.evidence_kind='PORTAL_CONFIRMED'
          OR h.components IS DISTINCT FROM s.components OR h.accounting_lines<>'[]'::jsonb
          OR h.principal_cents IS DISTINCT FROM s.principal_cents
          OR h.received_cents IS DISTINCT FROM s.received_cents
          OR h.payment_date IS DISTINCT FROM s.payment_date))))
  );
$candidate$;
