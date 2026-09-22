-- LOCAL ONLY: loaded by the PGlite in-memory harness, never into Supabase.
-- All identities and financial examples below are invented test data.
CREATE SCHEMA auth;
CREATE SCHEMA internal_contas;
CREATE SCHEMA test_caixa;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE test_caixa.access_state (
  global_allowed boolean, scoped_allowed boolean, role_name text
);
INSERT INTO test_caixa.access_state VALUES (true, true, 'authenticated');
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT role_name FROM test_caixa.access_state $$;
CREATE FUNCTION public.gestor_has_any_global_module(text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT global_allowed FROM test_caixa.access_state $$;
CREATE FUNCTION public.gestor_has_any_module_for_polo(text[], uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT scoped_allowed FROM test_caixa.access_state $$;

CREATE TABLE public.polos (id uuid PRIMARY KEY, nome text, cidade text, estado text);
CREATE TABLE public.cursos (id uuid PRIMARY KEY, modalidade text);
CREATE TABLE public.turmas (id uuid PRIMARY KEY, curso_id uuid);
CREATE TABLE public.matriculas (id uuid PRIMARY KEY, turma_id uuid);
CREATE TABLE public.contas_bancarias (id uuid PRIMARY KEY);
CREATE TABLE public.contas_bancarias_polos (conta_bancaria_id uuid, polo_id uuid);
CREATE TABLE public.categorias_financeiras (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY, polo_id uuid, conta_bancaria_id uuid, status text,
  data_pagamento date, data_vencimento date, updated_at timestamptz,
  valor_pago numeric, valor numeric, manual_settlement_id uuid,
  manual_settlement_reversed_at timestamptz, manual_settlement_received_cents bigint,
  matricula_id uuid, turma_id uuid, categoria text, gateway_settlement_recorded_at timestamptz
);
CREATE TABLE public.contas_pagar (
  id uuid PRIMARY KEY, polo_id uuid, conta_bancaria_id uuid, status text,
  data_pagamento date, data_vencimento date, updated_at timestamptz,
  valor_pago numeric, valor numeric, categoria text, fornecedor_id uuid,
  despesa_lancamento_id uuid, emprestimo_parcela_id uuid
);
CREATE TABLE public.despesas_lancamentos (
  id uuid PRIMARY KEY, polo_id uuid, conta_bancaria_id uuid, status text,
  data_pagamento date, data_vencimento date, updated_at timestamptz,
  valor_pago numeric, valor numeric, categoria_financeira_id uuid, tipo text
);
CREATE TABLE public.emprestimos_financeiros (conta_receber_id uuid, polo_matriz_id uuid);

CREATE TABLE test_caixa.positions (conta_bancaria_id uuid, polo_id uuid, saldo_gerencial numeric);
CREATE TABLE test_caixa.balances (
  id uuid, polo_id uuid, polos_uso uuid[], saldo_atual numeric, ativo boolean,
  banco text, agencia text, conta text, titular text, polo_cidade text, polo_uf text,
  natureza text, codigo_interno text
);
CREATE SEQUENCE test_caixa.position_calls MINVALUE 0 START 0;
CREATE SEQUENCE test_caixa.evidence_calls MINVALUE 0 START 0;
CREATE FUNCTION public.get_contas_bancarias_posicoes_polos_secure()
RETURNS SETOF test_caixa.positions LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM nextval('test_caixa.position_calls');
  RETURN QUERY SELECT * FROM test_caixa.positions;
END;
$$;
CREATE FUNCTION public.get_contas_bancarias_saldos()
RETURNS SETOF test_caixa.balances LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT * FROM test_caixa.balances $$;
CREATE FUNCTION public.get_caixa_prestacao_mensal_secure_raw(uuid, date, integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  RETURN public.get_caixa_prestacao_mensal_v2_core($1, $2, $3);
END;
$$;
-- The proof helper is unchanged by the migrations under test. The stub retains
-- complete, month-dependent evidence so lossy chart reuse fails equality tests.
CREATE FUNCTION internal_contas.caixa_monthly_delinquency(uuid, date, date)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_month integer := extract(month FROM $2)::integer;
BEGIN
  PERFORM nextval('test_caixa.evidence_calls');
  RETURN jsonb_build_object(
    'receber_vencido', v_month * 2,
    'margem_inadimplencia', v_month,
    'inadimplencia_mensal', jsonb_build_object(
      'base_elegivel', 100 + v_month,
      'quantidade_em_conferencia', 2,
      'valor_nominal_em_conferencia', 3,
      'completo', false,
      'competencia', date_trunc('month', $2)::date,
      'data_corte', $3,
      'polo', $1
    )
  );
END;
$$;
CREATE FUNCTION internal_contas.caixa_open_receivables(uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('a_receber', 123,
    'receitas_futuras', jsonb_build_object('completo', false, 'quantidade_em_conferencia', 1))
$$;

INSERT INTO public.polos VALUES
  ('00000000-0000-0000-0000-000000000001', 'Polo fictício A', 'Cidade A', 'AA'),
  ('00000000-0000-0000-0000-000000000002', 'Polo fictício B', 'Cidade B', 'BB'),
  ('00000000-0000-0000-0000-000000000003', 'Polo fictício vazio', 'Cidade C', 'CC');
INSERT INTO public.cursos VALUES
  ('00000000-0000-0000-0000-000000000011', 'TECNICO'),
  ('00000000-0000-0000-0000-000000000012', 'EAD');
INSERT INTO public.turmas SELECT
  ('00000000-0000-0000-0000-' || lpad((20 + n)::text, 12, '0'))::uuid,
  ('00000000-0000-0000-0000-' || lpad((10 + n)::text, 12, '0'))::uuid
FROM generate_series(1, 2) n;
INSERT INTO public.matriculas VALUES
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021');
INSERT INTO public.contas_bancarias VALUES
  ('00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000042');
INSERT INTO public.contas_bancarias_polos VALUES
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000002');
INSERT INTO test_caixa.positions VALUES
  ('00000000-0000-0000-0000-000000000041', null, 30),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', 70),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000002', 100),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000002', -40);
INSERT INTO test_caixa.balances VALUES
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001',
   ARRAY['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']::uuid[],
   200, true, 'Banco teste', 'Agência teste', 'Conta A', 'Teste', 'Cidade A', 'AA', 'BANCARIA', 'TEST-A'),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000002',
   ARRAY['00000000-0000-0000-0000-000000000002']::uuid[],
   -40, false, 'Caixa teste', '', 'Conta B', 'Teste', 'Cidade B', 'BB', 'CAIXA_INTERNO', 'TEST-B');

-- Boundary dates, scope NULL, manual receipt, reversal, fallback classification,
-- unpaid/cancelled and absent payment date must retain exactly their old meaning.
INSERT INTO public.contas_receber (
  id, polo_id, status, data_pagamento, data_vencimento, valor, valor_pago,
  manual_settlement_id, manual_settlement_received_cents, manual_settlement_reversed_at,
  matricula_id, turma_id, categoria, updated_at
)
SELECT ('00000000-0000-0000-0000-' || lpad((100 + n)::text, 12, '0'))::uuid,
  CASE WHEN n = 5 THEN null WHEN n = 6 THEN '00000000-0000-0000-0000-000000000002'::uuid
    ELSE '00000000-0000-0000-0000-000000000001'::uuid END,
  CASE n WHEN 8 THEN 'PENDENTE' WHEN 9 THEN 'CANCELADO' ELSE 'PAGO' END,
  CASE n WHEN 1 THEN DATE '2026-08-31' WHEN 2 THEN DATE '2026-09-01'
    WHEN 3 THEN DATE '2026-09-30' WHEN 4 THEN DATE '2026-10-01'
    WHEN 10 THEN null ELSE DATE '2026-09-15' END,
  DATE '2026-09-10', 100, CASE WHEN n = 5 THEN null ELSE 90 END,
  CASE WHEN n IN (2, 3) THEN '00000000-0000-0000-0000-000000000051'::uuid END,
  CASE WHEN n IN (2, 3) THEN 7500 END,
  CASE WHEN n = 3 THEN TIMESTAMPTZ '2026-09-20 12:00:00Z' END,
  CASE WHEN n IN (2, 3) THEN '00000000-0000-0000-0000-000000000031'::uuid END,
  CASE WHEN n = 6 THEN '00000000-0000-0000-0000-000000000022'::uuid END,
  CASE WHEN n = 7 THEN 'OUTROS_CREDITOS' END,
  TIMESTAMPTZ '2026-09-21 12:00:00Z'
FROM generate_series(1, 10) n;
INSERT INTO public.emprestimos_financeiros VALUES
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.contas_pagar (
  id, polo_id, status, data_pagamento, data_vencimento, valor, valor_pago,
  categoria, despesa_lancamento_id, emprestimo_parcela_id, updated_at
)
SELECT ('00000000-0000-0000-0000-' || lpad((200 + n)::text, 12, '0'))::uuid,
  CASE WHEN n = 5 THEN null ELSE '00000000-0000-0000-0000-000000000001'::uuid END,
  CASE WHEN n = 4 THEN 'PENDENTE' ELSE 'PAGO' END,
  CASE WHEN n = 2 THEN DATE '2026-10-01' ELSE DATE '2026-09-10' END,
  DATE '2026-09-10', 20, 15, 'DESPESA_ADMINISTRATIVA',
  CASE WHEN n = 3 THEN '00000000-0000-0000-0000-000000000301'::uuid END,
  CASE WHEN n = 6 THEN '00000000-0000-0000-0000-000000000061'::uuid END,
  TIMESTAMPTZ '2026-09-21 12:00:00Z'
FROM generate_series(1, 6) n;
INSERT INTO public.categorias_financeiras VALUES
  ('00000000-0000-0000-0000-000000000071', 'Tarifa bancária');
INSERT INTO public.despesas_lancamentos (
  id, polo_id, status, data_pagamento, data_vencimento, valor, categoria_financeira_id, tipo, updated_at
)
SELECT ('00000000-0000-0000-0000-' || lpad((300 + n)::text, 12, '0'))::uuid,
  CASE WHEN n = 4 THEN null ELSE '00000000-0000-0000-0000-000000000002'::uuid END,
  CASE WHEN n = 3 THEN 'VENCIDO' ELSE 'PAGO' END,
  CASE WHEN n = 2 THEN DATE '2026-08-31' ELSE DATE '2026-09-10' END,
  DATE '2026-09-10', 12,
  CASE WHEN n = 1 THEN '00000000-0000-0000-0000-000000000071'::uuid END,
  'DESPESA_VARIAVEL', TIMESTAMPTZ '2026-09-21 12:00:00Z'
FROM generate_series(1, 4) n;
