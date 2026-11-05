-- Minimal database fixture for standalone cancellation eligibility.
CREATE SCHEMA internal_proesc;
CREATE SCHEMA internal_other_credit_cancellation;
CREATE TABLE public.contas_receber (
  id uuid,
  polo_id uuid,
  data_pagamento date,
  valor_pago numeric,
  status text,
  matricula_id uuid,
  turma_id uuid,
  forma_pagamento text,
  nosso_numero_asaas text,
  categoria text,
  tipo_lancamento text,
  origem_cronograma_id text,
  asaas_payment_id text,
  asaas_invoice_url text,
  origem_pagamento text,
  asaas_bank_slip_url text,
  gateway_provider text,
  gateway_environment text,
  gateway_payment_method text,
  gateway_payment_id text,
  gateway_status text,
  gateway_invoice_url text,
  gateway_bank_slip_url text,
  gateway_pix_payload text,
  gateway_transaction_receipt_url text,
  gateway_boleto_nosso_numero text,
  gateway_financial_terms jsonb,
  gateway_financial_terms_confirmed_at timestamptz,
  gateway_boleto_issued_at timestamptz,
  gateway_creation_token uuid,
  gateway_submission_channel text,
  gateway_submission_status text,
  gateway_cnab_file_id uuid,
  manual_settlement_id uuid,
  manual_settlement_principal_cents int8,
  manual_settlement_interest_cents int8,
  manual_settlement_penalty_cents int8,
  manual_settlement_addition_cents int8,
  manual_settlement_discount_cents int8,
  manual_settlement_received_cents int8,
  manual_settlement_reversed_at timestamptz,
  gateway_settlement_channel text,
  gateway_settlement_source text,
  gateway_settlement_evidence jsonb,
  gateway_settlement_recorded_at timestamptz,
  regra_financeira_tecnica_snapshot jsonb,
  regra_financeira_plano_unico_snapshot jsonb,
  regra_financeira_dependencia_snapshot jsonb,
  regra_financeira_renegociacao_snapshot jsonb,
  renegotiation_agreement_id uuid,
  ead_checkout_attempt_id uuid,
  outros_creditos_plano_id uuid,
  regra_financeira_outros_creditos_snapshot jsonb
);
CREATE TABLE internal_proesc.obligation_links (receivable_id uuid);
CREATE TABLE public.inscricoes_online (receivable_id uuid);
CREATE TABLE public.matricula_dependencia_cobrancas (conta_receber_id uuid);
CREATE TABLE public.convenios_financeiros_creditos (conta_receber_id uuid);
CREATE TABLE public.emprestimos_financeiros (conta_receber_id uuid);
CREATE TABLE public.receivable_renegotiation_source_items (receivable_id uuid, released_at timestamptz);
CREATE TABLE public.banese_cancellation_outbox (receivable_id uuid);
CREATE TABLE public.payment_gateway_transactions (receivable_id uuid);
CREATE TABLE public.receivable_manual_settlements (receivable_id uuid);
CREATE OR REPLACE FUNCTION internal_other_credit_cancellation.has_payment_evidence(r public.contas_receber)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    coalesce(r.valor_pago,0)<>0 or r.data_pagamento is not null
    or r.manual_settlement_id is not null or r.manual_settlement_reversed_at is not null
    or coalesce(r.manual_settlement_received_cents,0)<>0
    or coalesce(r.manual_settlement_principal_cents,0)<>0
    or coalesce(r.manual_settlement_interest_cents,0)<>0
    or coalesce(r.manual_settlement_penalty_cents,0)<>0
    or coalesce(r.manual_settlement_addition_cents,0)<>0
    or coalesce(r.manual_settlement_discount_cents,0)<>0
    or r.gateway_settlement_recorded_at is not null
    or r.gateway_settlement_evidence is not null
    or r.gateway_settlement_source is not null or r.gateway_settlement_channel is not null
    or nullif(r.gateway_transaction_receipt_url,'') is not null
    or exists(select 1 from public.receivable_manual_settlements s where s.receivable_id=r.id)
    or upper(coalesce(r.status,'')) in ('PAGO','PARCIAL','EM_PROCESSAMENTO')
    or upper(coalesce(r.gateway_status,'')) in
      ('PAID','RECEIVED','CONFIRMED','PAGO','LIQUIDATED','PARTIALLY_PAID','PROCESSING')
  ),false);
$function$;

CREATE OR REPLACE FUNCTION internal_other_credit_cancellation.eligible(r public.contas_receber)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT coalesce(
  r.categoria='OUTROS_CREDITOS' AND r.tipo_lancamento='OUTRO_CREDITO'
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
