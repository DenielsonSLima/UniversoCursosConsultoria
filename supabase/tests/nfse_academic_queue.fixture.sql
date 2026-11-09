-- Synthetic identity, source and payment projection for an isolated database.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA internal_financial_payments;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_context(id uuid PRIMARY KEY,actor uuid,allowed boolean,all_polos boolean,polos uuid[]);
CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
  LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT lower($1)='ativo'$$;
CREATE FUNCTION public.financeiro_normalize_search_text(text) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$SELECT lower(coalesce($1,''))$$;
CREATE TABLE public.empresas(id uuid PRIMARY KEY,razao_social text,cnpj text);
CREATE TABLE public.polos(id uuid PRIMARY KEY,status text,company_id uuid,nome text,cnpj text,endereco text,
  numero text,complemento text,bairro text,cidade text,estado text,cep text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,tipo text,cpf_cnpj text,email text,
  endereco text,numero text,complemento text,bairro text,cidade text,uf text,cep text);
CREATE TABLE public.cursos(id uuid PRIMARY KEY,nome text,modalidade text);
CREATE TABLE public.turmas(id uuid PRIMARY KEY,polo_id uuid,curso_id uuid,codigo text,nome text);
CREATE TABLE public.matriculas(id uuid PRIMARY KEY,aluno_id uuid,turma_id uuid);
CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,polo_id uuid,matricula_id uuid,turma_id uuid,
  status text,data_pagamento date,data_vencimento date,valor numeric,valor_pago numeric,
  descricao text,origem_pagamento text,forma_pagamento text,gateway_financial_terms jsonb,
  manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
  manual_settlement_principal_cents bigint,manual_settlement_interest_cents bigint,
  manual_settlement_penalty_cents bigint,manual_settlement_addition_cents bigint,
  manual_settlement_discount_cents bigint,manual_settlement_received_cents bigint);
CREATE TABLE public.financial_payment_events(id uuid PRIMARY KEY,source_kind text,source_id uuid,
  polo_id uuid,payment_date date,reversed_at timestamptz);
CREATE TABLE public.financial_payment_components(id uuid PRIMARY KEY,event_id uuid REFERENCES public.financial_payment_events(id),
  amount_cents bigint);
CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid PRIMARY KEY);
CREATE FUNCTION public.resolve_integrated_receivable_financial_composition(
  uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)
RETURNS TABLE(valor_recebido numeric) LANGUAGE sql STABLE AS $$SELECT $3$$;
CREATE FUNCTION internal_financial_payments.cash_receivables() RETURNS SETOF public.contas_receber
LANGUAGE plpgsql STABLE AS $$BEGIN
  IF current_setting('test.source_blocked',true)='true' THEN RAISE EXCEPTION 'SOURCE_READ'; END IF;
  -- Physical titles are not themselves paid receipts while event components exist.
  RETURN QUERY SELECT r.* FROM public.contas_receber r WHERE NOT EXISTS (
    SELECT 1 FROM public.financial_payment_events e WHERE e.source_kind='RECEIVABLE'
      AND e.source_id=r.id AND e.reversed_at IS NULL)
  UNION ALL
  SELECT (jsonb_populate_record(r,jsonb_build_object('id',c.id,'status','PAGO',
    'valor_pago',c.amount_cents::numeric/100,'data_pagamento',e.payment_date,
    'manual_settlement_id',e.id,'manual_settlement_reversed_at',NULL,
    'manual_settlement_received_cents',c.amount_cents))).*
    FROM public.contas_receber r JOIN public.financial_payment_events e ON e.source_id=r.id
      AND e.source_kind='RECEIVABLE' AND e.reversed_at IS NULL
    JOIN public.financial_payment_components c ON c.event_id=e.id;
END; $$;
