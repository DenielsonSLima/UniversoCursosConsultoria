CREATE SCHEMA extensions;
CREATE FUNCTION extensions.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN
  PERFORM private.authorize_nfse_configuration_scope($1,$2,$3,$4);END$$;
ALTER TABLE public.parceiros ADD COLUMN nome_fantasia text;
ALTER TABLE public.contas_receber ADD COLUMN polo_id uuid,ADD COLUMN cliente_id uuid,ADD COLUMN descricao text,
  ADD COLUMN data_vencimento date,ADD COLUMN categoria text,ADD COLUMN categoria_financeira_id uuid,
  ADD COLUMN tipo_lancamento text,ADD COLUMN origem_pagamento text;
CREATE TABLE public.financial_payment_events(id uuid PRIMARY KEY,source_kind text,source_id uuid);
CREATE TABLE public.nfse_queue_change_events(id uuid DEFAULT gen_random_uuid(),polo_id uuid,environment text,month text);
CREATE TABLE private.nfse_partner_services(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,environment text,partner_id uuid,
  model_id uuid,service_date date,service_description text CHECK(length(service_description) BETWEEN 1 AND 1000),amount numeric(14,2),
  partner_snapshot jsonb,model_snapshot jsonb,receivable_id uuid,receivable_action text,status text DEFAULT 'PREPARADO',
  created_by uuid,created_at timestamptz DEFAULT now());
CREATE TABLE private.nfse_partner_service_requests(actor_id uuid,request_id uuid,payload jsonb,response jsonb,PRIMARY KEY(actor_id,request_id));
CREATE VIEW private.nfse_partner_linkable_receivables AS SELECT * FROM public.contas_receber WHERE false;
CREATE TABLE private.nfse_queue_documents(id uuid PRIMARY KEY,batch_id uuid,polo_id uuid,environment text,queue_month text,payment_month text,
  candidate_id text,student_id uuid,class_id uuid,model_id uuid,model_version integer,amount numeric(30,2),receipt_count integer,
  status text DEFAULT 'PREPARADO',snapshot jsonb,created_by uuid,created_at timestamptz DEFAULT now());
CREATE TABLE private.nfse_receipt_reservations(environment text,receipt_id uuid,source_receivable_id uuid,document_id uuid,amount numeric(30,2),
  PRIMARY KEY(environment,receipt_id,document_id));
CREATE TABLE private.nfse_queue_removals(document_id uuid PRIMARY KEY);
CREATE TABLE private.nfse_fiscal_review_revisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid,revision integer,
  model_id uuid,model_version integer,basis_fingerprint text,definition jsonb);
CREATE TABLE private.test_review_facts(document_id uuid PRIMARY KEY,facts jsonb);
CREATE FUNCTION private.nfse_fiscal_review_basis(uuid,uuid) RETURNS jsonb LANGUAGE sql STABLE AS
  $$SELECT facts FROM private.test_review_facts WHERE document_id=$1$$;
CREATE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger LANGUAGE plpgsql AS
  $$BEGIN RAISE EXCEPTION 'immutable' USING ERRCODE='55000';END$$;
CREATE SCHEMA internal_finance;
CREATE FUNCTION internal_finance.authorize_other_credit_plan(uuid,boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION internal_finance.validate_other_credit_plan_references(uuid,jsonb) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
