-- Exact inspected ledger/event columns, defaults and checks. Synthetic local use only.
-- Existing seed supplies the COMPLETED settlement. Fill its missing history before constraints.
alter table public.receivable_manual_settlements drop column status;
alter table public.receivable_manual_settlements add column if not exists "id" uuid default gen_random_uuid();
alter table public.receivable_manual_settlements add column if not exists "idempotency_key" uuid;
alter table public.receivable_manual_settlements add column if not exists "request_fingerprint" text;
alter table public.receivable_manual_settlements add column if not exists "receivable_id" uuid;
alter table public.receivable_manual_settlements add column if not exists "actor_id" uuid;
alter table public.receivable_manual_settlements add column if not exists "polo_id" uuid;
alter table public.receivable_manual_settlements add column if not exists "account_id" uuid;
alter table public.receivable_manual_settlements add column if not exists "payment_date" date;
alter table public.receivable_manual_settlements add column if not exists "payment_method" text;
alter table public.receivable_manual_settlements add column if not exists "principal_cents" bigint;
alter table public.receivable_manual_settlements add column if not exists "interest_cents" bigint default 0;
alter table public.receivable_manual_settlements add column if not exists "penalty_cents" bigint default 0;
alter table public.receivable_manual_settlements add column if not exists "addition_cents" bigint default 0;
alter table public.receivable_manual_settlements add column if not exists "discount_cents" bigint default 0;
alter table public.receivable_manual_settlements add column if not exists "received_cents" bigint;
alter table public.receivable_manual_settlements add column if not exists "provider_code" text;
alter table public.receivable_manual_settlements add column if not exists "environment" text;
alter table public.receivable_manual_settlements add column if not exists "remote_payment_id" text;
alter table public.receivable_manual_settlements add column if not exists "remote_payment_link_id" text;
alter table public.receivable_manual_settlements add column if not exists "requires_remote_cancellation" boolean default false;
alter table public.receivable_manual_settlements add column if not exists "remote_canceled_at" timestamp with time zone;
alter table public.receivable_manual_settlements add column if not exists "receivable_snapshot" jsonb default '{}'::jsonb;
alter table public.receivable_manual_settlements add column if not exists "state" text default 'STARTED'::text;
alter table public.receivable_manual_settlements add column if not exists "lease_token" uuid;
alter table public.receivable_manual_settlements add column if not exists "lease_expires_at" timestamp with time zone;
alter table public.receivable_manual_settlements add column if not exists "review_required_at" timestamp with time zone;
alter table public.receivable_manual_settlements add column if not exists "completed_at" timestamp with time zone;
alter table public.receivable_manual_settlements add column if not exists "reversed_at" timestamp with time zone;
alter table public.receivable_manual_settlements add column if not exists "last_error" text;
alter table public.receivable_manual_settlements add column if not exists "result" jsonb default '{}'::jsonb;
alter table public.receivable_manual_settlements add column if not exists "created_at" timestamp with time zone default now();
alter table public.receivable_manual_settlements add column if not exists "updated_at" timestamp with time zone default now();
update public.receivable_manual_settlements s set actor_id='10000000-0000-4000-8000-000000000003',
 idempotency_key='10000000-0000-4000-8000-000000009003',request_fingerprint=repeat('d',64),
 completed_at='2026-10-01T00:00:00Z',created_at='2026-10-01T00:00:00Z',
 updated_at='2026-10-01T00:00:00Z',
 receivable_snapshot=to_jsonb(r)||jsonb_build_object('status','PENDENTE','valor_pago',null,
   'data_pagamento',null,'manual_settlement_id',null),
 result=jsonb_build_object('operation','LOCAL_ENROLLMENT_SETTLEMENT','synthetic',true)
 from public.contas_receber r where r.id=s.receivable_id;
alter table public.receivable_manual_settlements alter column "id" set not null;
alter table public.receivable_manual_settlements alter column "id" set default gen_random_uuid();
alter table public.receivable_manual_settlements alter column "idempotency_key" set not null;
alter table public.receivable_manual_settlements alter column "request_fingerprint" set not null;
alter table public.receivable_manual_settlements alter column "receivable_id" set not null;
alter table public.receivable_manual_settlements alter column "actor_id" set not null;
alter table public.receivable_manual_settlements alter column "account_id" set not null;
alter table public.receivable_manual_settlements alter column "payment_date" set not null;
alter table public.receivable_manual_settlements alter column "payment_method" set not null;
alter table public.receivable_manual_settlements alter column "principal_cents" set not null;
alter table public.receivable_manual_settlements alter column "interest_cents" set not null;
alter table public.receivable_manual_settlements alter column "interest_cents" set default 0;
alter table public.receivable_manual_settlements alter column "penalty_cents" set not null;
alter table public.receivable_manual_settlements alter column "penalty_cents" set default 0;
alter table public.receivable_manual_settlements alter column "addition_cents" set not null;
alter table public.receivable_manual_settlements alter column "addition_cents" set default 0;
alter table public.receivable_manual_settlements alter column "discount_cents" set not null;
alter table public.receivable_manual_settlements alter column "discount_cents" set default 0;
alter table public.receivable_manual_settlements alter column "received_cents" set not null;
alter table public.receivable_manual_settlements alter column "requires_remote_cancellation" set not null;
alter table public.receivable_manual_settlements alter column "requires_remote_cancellation" set default false;
alter table public.receivable_manual_settlements alter column "receivable_snapshot" set not null;
alter table public.receivable_manual_settlements alter column "receivable_snapshot" set default '{}'::jsonb;
alter table public.receivable_manual_settlements alter column "state" set not null;
alter table public.receivable_manual_settlements alter column "state" set default 'STARTED'::text;
alter table public.receivable_manual_settlements alter column "result" set not null;
alter table public.receivable_manual_settlements alter column "result" set default '{}'::jsonb;
alter table public.receivable_manual_settlements alter column "created_at" set not null;
alter table public.receivable_manual_settlements alter column "created_at" set default now();
alter table public.receivable_manual_settlements alter column "updated_at" set not null;
alter table public.receivable_manual_settlements alter column "updated_at" set default now();
alter table public.usuarios_sistema add constraint fee_fixture_user_id_key unique(id);
create table public.contas_bancarias(id uuid primary key);
insert into public.contas_bancarias values('10000000-0000-4000-8000-000000009002');
create table public.payment_gateway_providers(code text primary key);
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_account_id_fkey" FOREIGN KEY (account_id) REFERENCES contas_bancarias(id) ON DELETE RESTRICT;
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES usuarios_sistema(id) ON DELETE RESTRICT;
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_amount_equation_check" CHECK (((received_cents = ((((principal_cents + interest_cents) + penalty_cents) + addition_cents) - discount_cents)) AND (discount_cents < (((principal_cents + interest_cents) + penalty_cents) + addition_cents))));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_amounts_nonnegative_check" CHECK (((principal_cents > 0) AND (interest_cents >= 0) AND (penalty_cents >= 0) AND (addition_cents >= 0) AND (discount_cents >= 0) AND (received_cents > 0) AND (principal_cents <= '9000000000000000'::bigint) AND (interest_cents <= '9000000000000000'::bigint) AND (penalty_cents <= '9000000000000000'::bigint) AND (addition_cents <= '9000000000000000'::bigint) AND (discount_cents <= '9000000000000000'::bigint) AND (received_cents <= '9000000000000000'::bigint)));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_environment_check" CHECK (((environment IS NULL) OR (environment = ANY (ARRAY['sandbox'::text, 'production'::text]))));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_fingerprint_check" CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_idempotency_key_key" UNIQUE (idempotency_key);
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_method_check" CHECK ((payment_method = ANY (ARRAY['BOLETO'::text, 'PIX'::text, 'CARTAO'::text, 'DINHEIRO'::text])));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_polo_id_fkey" FOREIGN KEY (polo_id) REFERENCES polos(id) ON DELETE RESTRICT;
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_provider_code_fkey" FOREIGN KEY (provider_code) REFERENCES payment_gateway_providers(code) ON UPDATE RESTRICT ON DELETE RESTRICT;
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_receivable_id_fkey" FOREIGN KEY (receivable_id) REFERENCES contas_receber(id) ON DELETE RESTRICT;
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_result_object_check" CHECK ((jsonb_typeof(result) = 'object'::text));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_snapshot_object_check" CHECK ((jsonb_typeof(receivable_snapshot) = 'object'::text));
alter table public.receivable_manual_settlements add constraint "receivable_manual_settlements_state_check" CHECK ((state = ANY (ARRAY['STARTED'::text, 'REMOTE_CANCELED_LOCAL_PENDING'::text, 'FAILED_SAFE'::text, 'REVIEW_REQUIRED'::text, 'COMPLETED'::text, 'REVERSED'::text, 'CANCELED_AFTER_REVIEW'::text])));
create table public.receivable_manual_settlement_events (
 "id" uuid not null default gen_random_uuid(),
 "settlement_id" uuid not null,
 "actor_id" uuid not null,
 "event_type" text not null,
 "details" jsonb not null default '{}'::jsonb,
 "created_at" timestamp with time zone not null default now()
);
alter table public.receivable_manual_settlement_events add constraint "receivable_manual_settlement_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES usuarios_sistema(id) ON DELETE RESTRICT;
alter table public.receivable_manual_settlement_events add constraint "receivable_manual_settlement_events_details_object_check" CHECK ((jsonb_typeof(details) = 'object'::text));
alter table public.receivable_manual_settlement_events add constraint "receivable_manual_settlement_events_pkey" PRIMARY KEY (id);
alter table public.receivable_manual_settlement_events add constraint "receivable_manual_settlement_events_settlement_id_fkey" FOREIGN KEY (settlement_id) REFERENCES receivable_manual_settlements(id) ON DELETE RESTRICT;
alter table public.receivable_manual_settlement_events add constraint "receivable_manual_settlement_events_type_check" CHECK ((event_type = ANY (ARRAY['STARTED'::text, 'REMOTE_CANCELED'::text, 'REMOTE_CANCELLATION_FAILED'::text, 'REMOTE_CANCELLATION_PREFLIGHT_FAILED'::text, 'LOCAL_SETTLEMENT_FAILED'::text, 'LOCAL_SETTLEMENT_COMPLETED'::text, 'LOCAL_SETTLEMENT_REPLAYED'::text, 'LOCAL_SETTLEMENT_REVERSED'::text, 'REVIEW_CANCELED'::text])));
insert into public.receivable_manual_settlement_events(id,settlement_id,event_type,actor_id,details,created_at)
values ('10000000-0000-4000-8000-000000009004','10000000-0000-4000-8000-000000009001',
'LOCAL_SETTLEMENT_COMPLETED','10000000-0000-4000-8000-000000000003',
'{"operation":"LOCAL_ENROLLMENT_SETTLEMENT","synthetic":true}','2026-10-01T00:00:00Z');
-- External permission boundary: exact synthetic actor identity, enabled account and module.
-- Canonical reversal functions are not substituted.
create function public.gestor_has_module(p_module text) returns boolean language sql stable as $$
 select exists(select 1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()
 and public.is_active_status(u.status) and lower(btrim(u.perfil)) in ('gestor','financeiro')
 and u.permissoes->'modules' ? p_module);
$$;
alter table public.receivable_manual_settlements enable row level security;
alter table public.receivable_manual_settlement_events enable row level security;
revoke all on public.receivable_manual_settlements,public.receivable_manual_settlement_events from public,anon,authenticated,service_role;
