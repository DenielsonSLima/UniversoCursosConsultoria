-- ISOLATED SYNTHETIC TEST DATABASE ONLY. Never apply this fixture remotely.
-- Auth and external project tables below are minimal test doubles. Draft
-- correction functions themselves are loaded unchanged from draft-migrations.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions; create schema internal_proesc;
create schema internal_academic;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql as $$
  select jsonb_build_object('role',current_setting('test.jwt.role',true));
$$;
create function extensions.digest(bytes bytea, algorithm text) returns bytea language sql as $$
  select case when algorithm='sha256' then sha256(bytes) end;
$$;
create table public.polos(id uuid primary key,status text);
create function public.is_active_status(status text) returns boolean language sql immutable
as $$select lower(btrim(status)) in ('ativo','active');$$;
create table public.perfis_acesso(id uuid primary key,permissoes jsonb,restricao_horario jsonb);
create table public.usuarios_sistema(id uuid primary key,auth_user_id uuid,perfil text,status text,
  perfil_acesso_id uuid,personalizar_permissoes boolean,permissoes jsonb,polo_ids uuid[],context text,restricao_horario jsonb);
create function public.portal_identidade_institucional_acesso_liberado(actor uuid, perfil text)
returns boolean language sql as $$select exists(select 1 from auth.users where id=actor);$$;
create table public.parceiros(id uuid primary key,cpf_cnpj text);
create table public.turmas(id uuid primary key,polo_id uuid);
create table public.matriculas(id uuid primary key,turma_id uuid,aluno_id uuid,status text);
create table public.contas_receber(
  id uuid primary key,polo_id uuid,cliente_id uuid,matricula_id uuid,turma_id uuid,
  status text,valor numeric,valor_pago numeric,data_pagamento date,data_vencimento date,
  manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
  manual_settlement_received_cents bigint,manual_settlement_principal_cents bigint,
  manual_settlement_interest_cents bigint,manual_settlement_penalty_cents bigint,
  manual_settlement_addition_cents bigint,manual_settlement_discount_cents bigint,
  gateway_settlement_recorded_at timestamptz,gateway_settlement_evidence jsonb,
  gateway_settlement_source text,gateway_settlement_channel text,gateway_transaction_receipt_url text,
  gateway_provider text,gateway_payment_method text,gateway_submission_channel text,
  gateway_submission_status text,gateway_cnab_file_id uuid,gateway_creation_token uuid,
  renegotiation_agreement_id uuid,gateway_environment text,gateway_financial_terms_confirmed_at timestamptz,
  gateway_financial_terms jsonb,gateway_status text,gateway_payment_id text,gateway_last_error text,
  gateway_boleto_nosso_numero text,gateway_boleto_convenio text,gateway_boleto_agencia text,
  gateway_boleto_linha_digitavel text,gateway_boleto_codigo_barras text,
  gateway_synced_at timestamptz,updated_at timestamptz, gateway_pix_payload text,
  gateway_boleto_issued_at timestamptz,created_at timestamptz default now()
);
create table public.payment_gateway_transactions(
  id uuid primary key,receivable_id uuid,provider_code text,environment text,payment_method text,
  amount numeric,remote_payment_id text,bank_slip_our_number text,bank_slip_digitable_line text,
  bank_slip_barcode text,transaction_receipt_url text,remote_status text,last_error text,
  synced_at timestamptz,updated_at timestamptz
);
create table public.receivable_manual_settlements(id uuid primary key,receivable_id uuid,status text,
 state text,requires_remote_cancellation boolean,provider_code text,remote_payment_id text,remote_payment_link_id text,
 polo_id uuid,account_id uuid,payment_method text,payment_date date,principal_cents bigint,received_cents bigint,
 interest_cents bigint,penalty_cents bigint,addition_cents bigint,discount_cents bigint);
create table internal_proesc.obligation_links(receivable_id uuid);
create table public.receivable_renegotiation_source_items(receivable_id uuid,released_at timestamptz);
create table public.banese_cancellation_outbox(receivable_id uuid,state text);
create table internal_academic.technical_manual_banese_reissue_jobs(receivable_id uuid,status text);
create table public.banese_reconciliation_queue(receivable_id uuid primary key,state text,lease_run_id uuid,
  lease_until timestamptz,next_check_at timestamptz,last_result text,updated_at timestamptz,
  last_checked_at timestamptz,last_error_class text,environment text,modality text,priority integer,issued_at timestamptz);
create function public.banese_reconciliation_resolve_modality(id uuid,turma uuid,matricula uuid)
returns text language sql as $$select 'TECNICO'::text;$$;
insert into auth.users values('10000000-0000-4000-8000-000000000001');
insert into public.polos values('10000000-0000-4000-8000-000000000002','ATIVO');
insert into public.usuarios_sistema(id,auth_user_id,perfil,status,personalizar_permissoes,permissoes,polo_ids)
values('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  'gestor','ATIVO',true,'{"modules":["financeiro"],"tabs":{"financeiro":["receber"]}}',
  array['10000000-0000-4000-8000-000000000002'::uuid]);
insert into public.parceiros values('10000000-0000-4000-8000-000000000004','00000000000');
insert into public.turmas values('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002');
insert into public.matriculas values('10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','ATIVO');
