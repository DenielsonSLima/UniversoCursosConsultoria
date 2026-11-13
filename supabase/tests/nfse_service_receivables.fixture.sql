CREATE SCHEMA internal_financial_payments;
CREATE SCHEMA internal_other_credit_cancellation;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$SELECT coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
CREATE OR REPLACE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT CASE WHEN $1='receber' THEN current_setting('test.receber',true)='true'
    ELSE $1='outros-creditos' AND current_setting('test.finance',true)='true' END$$;
CREATE FUNCTION public.is_financeiro_global() RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT auth.uid() IS NOT NULL AND current_setting('test.global',true)='true'$$;
CREATE FUNCTION public.financeiro_normalize_search_text(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT lower($1)$$;
CREATE FUNCTION private.nfse_review_valid_document(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT length($1) IN (11,14)$$;
CREATE FUNCTION private.nfse_model_visible_to_polo(uuid,uuid,jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1=$2$$;
ALTER TABLE public.categorias_financeiras ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.polos ADD COLUMN nome text,ADD COLUMN cnpj text,ADD COLUMN cidade text,ADD COLUMN estado text;
ALTER TABLE public.parceiros ADD COLUMN telefone text;
ALTER TABLE public.contas_receber ADD COLUMN payment_summary jsonb,ADD COLUMN gateway_boleto_issued_at timestamptz,
  ADD COLUMN gateway_settlement_channel text,ADD COLUMN gateway_settlement_source text,
  ADD COLUMN conta_bancaria_id uuid,ADD COLUMN nosso_numero_asaas text,
  ADD COLUMN asaas_payment_id text,ADD COLUMN gateway_payment_link_id text,ADD COLUMN asaas_payment_link_id text,
  ADD COLUMN gateway_invoice_url text,ADD COLUMN asaas_invoice_url text,
  ADD COLUMN gateway_bank_slip_url text,ADD COLUMN asaas_bank_slip_url text,
  ADD COLUMN gateway_installment_id text,ADD COLUMN asaas_installment_id text,
  ADD COLUMN asaas_transaction_receipt_url text,ADD COLUMN asaas_status text,ADD COLUMN gateway_status text,
  ADD COLUMN asaas_last_error text,ADD COLUMN asaas_fee_value numeric,ADD COLUMN gateway_fee_value numeric,
  ADD COLUMN asaas_net_value numeric,ADD COLUMN gateway_net_value numeric,
  ADD COLUMN outros_creditos_plano_id uuid,ADD COLUMN outros_creditos_papel text,
  ADD COLUMN regra_financeira_outros_creditos_snapshot jsonb;
ALTER TABLE public.contas_receber ADD COLUMN parcela_numero integer,ADD COLUMN gateway_financial_terms jsonb,
  ADD COLUMN gateway_financial_terms_confirmed_at timestamptz;
CREATE TABLE public.finance_realtime_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text,event_type text,entity_id uuid,polo_id uuid,aluno_id uuid,turma_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.despesas_lancamentos(id uuid PRIMARY KEY,polo_id uuid,tipo text);
CREATE TABLE public.contas_pagar(id uuid PRIMARY KEY,polo_id uuid);
CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,polo_id uuid,environment text,
  state text CHECK(state IN ('PREVIEWED','PROCESSING','AUTHORIZED','REJECTED','AWAITING_CONFIRMATION','BLOCKED')),
  snapshot jsonb,result jsonb,authorized_xml text,updated_at timestamptz DEFAULT now());
CREATE TABLE private.nfse_individual_cancellations(id uuid PRIMARY KEY,operation_id uuid,
  state text,updated_at timestamptz DEFAULT now());
CREATE TABLE private.nfse_queue_operation_links(source_kind text,source_id uuid,operation_id uuid);
CREATE FUNCTION internal_financial_payments.actor_allowed(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT $1=auth.uid() AND public.is_financeiro_for_polo($2) AND public.gestor_has_effective_financeiro_tab($3)$$;
CREATE FUNCTION internal_other_credit_cancellation.eligible(public.contas_receber) RETURNS boolean
LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public.listar_outros_creditos_sem_convenios_core(uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.gestor_has_effective_financeiro_tab('outros-creditos') THEN
    RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.contas_receber c
    WHERE c.categoria='OUTROS_CREDITOS' AND ($1 IS NULL OR c.polo_id=$1)),'[]');
END$$;
CREATE FUNCTION public.listar_outros_creditos_secure(uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql AS $$SELECT public.listar_outros_creditos_sem_convenios_core($1)$$;
