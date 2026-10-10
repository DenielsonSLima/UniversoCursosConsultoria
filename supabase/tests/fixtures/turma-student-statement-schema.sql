-- Isolated synthetic harness; no production data or mutations against a server.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA internal_academic;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.role', true), ''), 'anon');
$$;
CREATE FUNCTION public.current_aluno_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.aluno', true), '')::uuid;
$$;
CREATE FUNCTION public.is_financeiro_for_polo(p_polo_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_polo_id = nullif(current_setting('test.finance_polo', true), '')::uuid;
$$;
CREATE TABLE public.parceiros (id uuid PRIMARY KEY, nome text, cpf_cnpj text);
CREATE TABLE public.cursos (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.polos (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.turmas (
  id uuid PRIMARY KEY, nome text, codigo text, curso_id uuid, polo_id uuid
);
CREATE TABLE public.matriculas (
  id uuid PRIMARY KEY, aluno_id uuid, turma_id uuid, status text, data_matricula date
);
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY, matricula_id uuid, descricao text,
  valor numeric, valor_pago numeric, data_vencimento date, data_pagamento date,
  status text, forma_pagamento text, origem_pagamento text,
  tipo_lancamento text, parcela_numero integer, created_at timestamptz,
  asaas_status text, asaas_invoice_url text, asaas_payment_id text,
  gateway_provider text, gateway_payment_method text, gateway_payment_id text,
  gateway_status text, gateway_invoice_url text, gateway_bank_slip_url text,
  gateway_transaction_receipt_url text, gateway_settlement_channel text,
  gateway_settlement_source text, gateway_last_error text,
  gateway_submission_status text, gateway_boleto_issued_at timestamptz,
  gateway_boleto_nosso_numero text, gateway_financial_terms jsonb,
  gateway_financial_terms_confirmed_at timestamptz,
  manual_settlement_id uuid, manual_settlement_reversed_at timestamptz,
  manual_settlement_principal_cents bigint, manual_settlement_interest_cents bigint,
  manual_settlement_penalty_cents bigint, manual_settlement_addition_cents bigint,
  manual_settlement_discount_cents bigint, manual_settlement_received_cents bigint
);
CREATE TABLE public.test_cycle_projections (receivable_id uuid PRIMARY KEY, payload jsonb);
-- Existing canonical helpers are injected boundaries; this test exercises the
-- real statement SQL, its authorization and projection without recomputing money.
CREATE FUNCTION internal_academic.receivable_cycle_presentation(p_row public.contas_receber)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT payload FROM public.test_cycle_projections
    WHERE receivable_id = p_row.id), '{}'::jsonb);
$$;
CREATE FUNCTION public.resolve_integrated_receivable_financial_composition(
  uuid, numeric, numeric, date, date, jsonb, uuid, timestamptz,
  bigint, bigint, bigint, bigint, bigint, bigint
) RETURNS TABLE (
  juros numeric, multa numeric, desconto numeric, acrescimo numeric,
  diferenca_nao_discriminada numeric, composicao_status text
) LANGUAGE sql STABLE AS $$
  SELECT 0::numeric, 0::numeric, 19.90::numeric, 0::numeric,
    NULL::numeric, 'CONCILIADO_POR_CONFERENCIA_PROESC'::text;
$$;
