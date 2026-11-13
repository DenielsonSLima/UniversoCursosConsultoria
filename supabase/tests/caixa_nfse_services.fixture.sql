-- Synthetic, in-memory only. Never apply this fixture to a remote database.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE SCHEMA internal_contas;
CREATE SCHEMA internal_financial_payments;
CREATE SCHEMA test_caixa;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT coalesce(current_setting('test.role',true),'authenticated')$$;
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY,polo_id uuid,cliente_id uuid,descricao text,categoria text,
  status text,valor numeric,valor_pago numeric,data_pagamento date,data_vencimento date,
  matricula_id uuid,turma_id uuid,parcela_numero integer,gateway_installments integer,
  conta_bancaria_id uuid,forma_pagamento text,gateway_settlement_channel text,gateway_payment_method text,
  gateway_financial_terms jsonb,manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
  manual_settlement_principal_cents bigint,manual_settlement_interest_cents bigint,
  manual_settlement_penalty_cents bigint,manual_settlement_addition_cents bigint,
  manual_settlement_discount_cents bigint,manual_settlement_received_cents bigint,
  gateway_fee_value numeric,gateway_net_value numeric,asaas_fee_value numeric,asaas_net_value numeric
);
CREATE TABLE public.financial_payment_events(id uuid PRIMARY KEY,source_kind text,source_id uuid,reversed_at timestamptz);
CREATE TABLE private.nfse_service_receivables(receivable_id uuid PRIMARY KEY,fiscal_number text,fiscal_description text,installment_count integer);
CREATE TABLE test_caixa.components (
  id uuid PRIMARY KEY,event_id uuid,source_kind text,source_id uuid,
  principal_cents bigint,discount_cents bigint,interest_cents bigint,penalty_cents bigint,addition_cents bigint,
  amount_cents bigint,payment_date date,account_id uuid,method text
);
CREATE FUNCTION internal_financial_payments.cash_components() RETURNS SETOF test_caixa.components LANGUAGE sql AS $$
  SELECT c.* FROM test_caixa.components c JOIN public.financial_payment_events e ON e.id=c.event_id WHERE e.reversed_at IS NULL
$$;
CREATE FUNCTION internal_financial_payments.cash_remaining(text,uuid,numeric) RETURNS numeric LANGUAGE sql AS $$
  SELECT $3-coalesce(sum(p.principal_cents+p.discount_cents)::numeric/100,0)
  FROM internal_financial_payments.cash_components() p WHERE p.source_kind=$1 AND p.source_id=$2
$$;
CREATE TABLE public.contas_pagar(id uuid PRIMARY KEY,polo_id uuid,status text,valor numeric,valor_pago numeric,data_pagamento date,emprestimo_parcela_id uuid);
CREATE FUNCTION internal_financial_payments.cash_payables() RETURNS SETOF public.contas_pagar LANGUAGE sql AS $$SELECT * FROM public.contas_pagar$$;
CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid,polo_matriz_id uuid);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text);
CREATE TABLE public.polos(id uuid PRIMARY KEY,nome text,cidade text,estado text);
CREATE TABLE public.cursos(id uuid PRIMARY KEY,nome text,modalidade text);
CREATE TABLE public.turmas(id uuid PRIMARY KEY,curso_id uuid,codigo text,nome text,qtd_parcelas integer);
CREATE TABLE public.matriculas(id uuid PRIMARY KEY,aluno_id uuid,turma_id uuid);
CREATE TABLE public.contas_bancarias(id uuid PRIMARY KEY,banco text,agencia text,conta text);
CREATE FUNCTION public.resolve_integrated_receivable_financial_composition(
  uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint
) RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
  diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
LANGUAGE sql AS $$SELECT $2,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,'COMPOSICAO_EXPLICITA'::text,coalesce($3,$2)$$;
CREATE FUNCTION internal_contas.caixa_monthly_delinquency(uuid,date,date) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"receber_vencido":0,"inadimplencia_mensal":{"completo":true}}'::jsonb$$;
CREATE FUNCTION internal_contas.caixa_monthly_chart_series(jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT $1$$;
CREATE FUNCTION internal_contas.caixa_open_receivables(uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"a_receber":70}'::jsonb$$;
CREATE FUNCTION public.get_caixa_prestacao_mensal_secure_raw(p_polo_id uuid,p_competencia date,p_history integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE total numeric;quantity integer;categories jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_setting('test.denied',true)='true'
    OR (p_polo_id IS NULL AND current_setting('test.global',true) IS DISTINCT FROM 'true')
    OR (p_polo_id IS NOT NULL AND p_polo_id::text IS DISTINCT FROM current_setting('test.polo',true)) THEN
    RAISE EXCEPTION 'Scope denied' USING ERRCODE='42501'; END IF;
  SELECT coalesce(sum(coalesce(valor_pago,valor)),0),count(*)::integer INTO total,quantity
  FROM internal_financial_payments.cash_receivables() WHERE status='PAGO'
    AND data_pagamento>=date_trunc('month',p_competencia)::date
    AND data_pagamento<(date_trunc('month',p_competencia)+interval '1 month')::date
    AND (p_polo_id IS NULL OR polo_id=p_polo_id);
  categories:=jsonb_build_array(jsonb_build_object('codigo','TECNICO','rotulo','Técnico','valor',0,'quantidade',0),
    jsonb_build_object('codigo','OUTROS_CREDITOS','rotulo','Outros créditos',
      'valor',CASE WHEN current_setting('test.drift',true)='true' THEN 0 ELSE total END,'quantidade',quantity));
  RETURN jsonb_build_object('opaque_snapshot','preserved','resumo_competencia',jsonb_build_object(
    'entradas_recebidas_brutas',total,'saidas_pagas',0,'quantidade_recebimentos',quantity,'quantidade_pagamentos',0),
    'receitas_por_modalidade',categories,'despesas_por_categoria','[]'::jsonb,
    'serie_mensal',jsonb_build_array(jsonb_build_object('competencia',date_trunc('month',p_competencia)::date,
      'entradas',total,'saidas',0)));
END;
$$;
CREATE FUNCTION public.get_caixa_prestacao_mensal_secure(p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE,p_meses_historico integer DEFAULT 6)
RETURNS jsonb LANGUAGE sql AS $$SELECT NULL::jsonb$$;
REVOKE ALL ON FUNCTION public.get_caixa_prestacao_mensal_secure(uuid,date,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_prestacao_mensal_secure(uuid,date,integer) TO authenticated,service_role;
