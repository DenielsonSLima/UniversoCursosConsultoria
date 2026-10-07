-- Synthetic source schema; canonical reviewed and expected-terms function bodies
-- loaded separately. No real identities or real bank calls.
alter table public.contas_receber add column tipo_lancamento text;
alter table public.contas_receber add column parcela_numero integer;
alter table public.contas_receber add column origem_cronograma_id text;
alter table public.contas_receber add column regra_financeira_tecnica_snapshot jsonb;
create table internal_academic.technical_manual_cycle_runs(
  matricula_id uuid,turma_id uuid,cycle_number integer,request_id uuid,
  item_count integer,receivable_ids uuid[],state text,reviewed_items jsonb,
  rule_fingerprint text,policy_fingerprint text,schedule_fingerprint text,
  primary key(matricula_id,cycle_number));
create table internal_academic.technical_manual_receivable_issuance_authorizations(
  receivable_id uuid primary key,matricula_id uuid,turma_id uuid,cycle_number integer,
  request_id uuid unique,receivable_fingerprint text,authorized_by uuid,authorized_at timestamptz,
  first_claimed_at timestamptz,last_claimed_at timestamptz,claim_count integer);
create table internal_academic.technical_manual_banese_due_date_overlay(
  receivable_id uuid,matricula_id uuid,turma_id uuid,cycle_number integer,cycle_request_id uuid,
  expected_item_count integer,reviewed_item_key text,original_due_date date,corrected_due_date date);
create function internal_academic.manual_cycle_has_local_intent(r public.contas_receber)
returns boolean language sql as $$select r.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL';$$;
create function internal_academic.manual_cycle_has_bank_fields(r public.contas_receber)
returns boolean language sql as $$select r.gateway_payment_id is not null or r.gateway_boleto_nosso_numero is not null;$$;
create function internal_academic.manual_cycle_local_receivable_complete(r public.contas_receber)
returns boolean language sql as $$select internal_academic.manual_cycle_has_local_intent(r)
  and not internal_academic.manual_cycle_has_bank_fields(r);$$;
create table public.fixture_audit(matricula_id uuid,event text,details jsonb,reason text);
create function public.registrar_turma_financeiro_auditoria(matricula uuid,event text,details jsonb,reason text)
returns void language sql as $$insert into public.fixture_audit values(matricula,event,details,reason);$$;

alter table public.contas_receber add column descricao text;
alter table public.contas_receber add column forma_pagamento text;
alter table public.contas_receber add column gateway_issuer_polo_id uuid;
alter table public.contas_receber add column gateway_pix_encoded_image text;
alter table public.payment_gateway_transactions add column origin_polo_id uuid;
alter table public.payment_gateway_transactions add column issuer_polo_id uuid;
alter table public.payment_gateway_transactions add column pix_payload text;
alter table public.payment_gateway_transactions add column pix_encoded_image text;
alter table public.payment_gateway_transactions add column raw_payload jsonb;
alter table internal_academic.technical_manual_cycle_runs add column created_by uuid;

alter table public.contas_receber add column origem_pagamento text;
alter table public.contas_receber add column conta_bancaria_id uuid;
