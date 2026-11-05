-- The standalone credit creator historically omitted tipo_lancamento.
-- Admit only untyped standalone native credits; all payment, academic and bank guards remain.
-- No receivable is rewritten and no bank cancellation is executed by this migration.
CREATE OR REPLACE FUNCTION internal_other_credit_cancellation.eligible(r public.contas_receber)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT coalesce(
  r.categoria='OUTROS_CREDITOS'
  AND (r.tipo_lancamento='OUTRO_CREDITO'
    OR (r.tipo_lancamento IS NULL AND r.outros_creditos_plano_id IS NULL
      AND r.regra_financeira_outros_creditos_snapshot IS NULL
      AND r.origem_pagamento IN ('LOCAL','BANESE')))
  AND r.status IN ('PENDENTE','VENCIDO') AND r.polo_id IS NOT NULL
  AND r.matricula_id IS NULL AND r.turma_id IS NULL AND r.origem_cronograma_id IS NULL
  AND r.renegotiation_agreement_id IS NULL AND r.ead_checkout_attempt_id IS NULL
  AND r.regra_financeira_tecnica_snapshot IS NULL AND r.regra_financeira_plano_unico_snapshot IS NULL
  AND r.regra_financeira_dependencia_snapshot IS NULL AND r.regra_financeira_renegociacao_snapshot IS NULL
  AND NOT internal_other_credit_cancellation.has_payment_evidence(r)
  AND NOT EXISTS (SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.inscricoes_online l WHERE l.receivable_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.matricula_dependencia_cobrancas l WHERE l.conta_receber_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos l WHERE l.conta_receber_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.emprestimos_financeiros l WHERE l.conta_receber_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.receivable_renegotiation_source_items l
    WHERE l.receivable_id=r.id AND l.released_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM public.banese_cancellation_outbox l WHERE l.receivable_id=r.id)
  AND r.gateway_creation_token IS NULL AND r.gateway_cnab_file_id IS NULL
  AND (
    (coalesce(r.gateway_provider,'') IN ('','local') AND r.origem_pagamento='LOCAL'
      AND r.gateway_payment_id IS NULL AND r.asaas_payment_id IS NULL
      AND r.gateway_boleto_nosso_numero IS NULL AND r.nosso_numero_asaas IS NULL
      AND r.gateway_submission_channel IS NULL AND r.gateway_submission_status IS NULL
      AND r.gateway_invoice_url IS NULL AND r.gateway_bank_slip_url IS NULL
      AND r.gateway_pix_payload IS NULL AND r.asaas_invoice_url IS NULL
      AND r.asaas_bank_slip_url IS NULL AND r.gateway_boleto_issued_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.payment_gateway_transactions t WHERE t.receivable_id=r.id))
    OR (r.gateway_provider='banese_card' AND r.gateway_payment_method='BOLETO'
      AND r.forma_pagamento='BOLETO' AND r.gateway_environment IN ('production','sandbox')
      AND r.gateway_submission_channel='API' AND r.gateway_submission_status='API_REGISTERED'
      AND r.gateway_boleto_issued_at IS NOT NULL AND r.gateway_financial_terms_confirmed_at IS NOT NULL
      AND jsonb_typeof(r.gateway_financial_terms)='object'
      AND r.gateway_status IN ('PENDING','OVERDUE','CANCELED')
      AND r.gateway_payment_id=r.gateway_boleto_nosso_numero)
  ),false);
$function$;
