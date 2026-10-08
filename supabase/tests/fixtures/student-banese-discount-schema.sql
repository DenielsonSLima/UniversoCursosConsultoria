-- Isolated, synthetic PostgreSQL fixture. Never execute against production.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA portal_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.auth_id', true), '')::uuid;
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT 'authenticated'::text;
$$;
CREATE FUNCTION public.current_aluno_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.student_id', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), public.current_aluno_id()
  TO authenticated;

CREATE TABLE public.cursos (id uuid PRIMARY KEY, nome text, modalidade text);
CREATE TABLE public.parceiros (id uuid PRIMARY KEY, nome text, cpf_cnpj text);
CREATE TABLE public.matriculas (
  id uuid PRIMARY KEY, desconto_pontualidade_individual numeric,
  juros_atraso_individual numeric, multa_atraso_individual numeric
);
CREATE TABLE public.turmas (
  id uuid PRIMARY KEY, curso_id uuid, nome text, valor_parcela numeric,
  qtd_parcelas integer, desconto_pontualidade numeric,
  juros_atraso numeric, multa_atraso numeric,
  aplicar_desconto_matricula boolean, aplicar_multa_juros_matricula boolean,
  aplicar_desconto_mensalidade boolean, aplicar_multa_juros_mensalidade boolean,
  aplicar_desconto_rematricula boolean, aplicar_multa_juros_rematricula boolean
);
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY, cliente_id uuid, matricula_id uuid, turma_id uuid,
  descricao text, categoria text, tipo_lancamento text, parcela_numero integer,
  valor numeric, valor_pago numeric, data_vencimento date, data_pagamento date,
  status text, forma_pagamento text, origem_pagamento text,
  asaas_invoice_url text, asaas_status text, asaas_transaction_receipt_url text,
  gateway_provider text, gateway_environment text, gateway_payment_method text,
  gateway_payment_id text, gateway_status text, gateway_bank_slip_url text,
  gateway_invoice_url text, gateway_boleto_linha_digitavel text,
  gateway_boleto_codigo_barras text, gateway_boleto_nosso_numero text,
  gateway_financial_terms jsonb, gateway_financial_terms_confirmed_at timestamptz,
  gateway_last_error text, regra_financeira_tecnica_snapshot jsonb,
  regra_financeira_plano_unico_snapshot jsonb,
  regra_financeira_dependencia_snapshot jsonb
);

INSERT INTO public.cursos VALUES (
  '00000000-0000-0000-0000-000000000101', 'Curso sintético', 'TECNICO'
);
INSERT INTO public.turmas (
  id, curso_id, nome, valor_parcela, qtd_parcelas, desconto_pontualidade,
  juros_atraso, multa_atraso, aplicar_desconto_mensalidade,
  aplicar_multa_juros_mensalidade
) VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101', 'Turma sintética',
  279.90, 12, 99, 1, 5.60, true, true
);
SELECT set_config('test.auth_id', '00000000-0000-0000-0000-000000000201', false);
SELECT set_config('test.student_id', '00000000-0000-0000-0000-000000000001', false);
