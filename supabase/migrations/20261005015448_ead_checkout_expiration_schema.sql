begin;

create function internal_contas.ead_expiration_today(p_instant timestamptz default now())
returns date language sql stable set search_path='' as $$
  select (p_instant at time zone 'America/Maceio')::date;
$$;
revoke all on function internal_contas.ead_expiration_today(timestamptz) from public,anon,authenticated,service_role;

-- Activation and local-calendar verification are explicit operational steps.
create table public.banese_ead_checkout_expiration_config (
  environment text primary key check (environment in ('sandbox', 'production')),
  enabled boolean not null default false,
  verified_local_holidays date[],
  verified_polo_ids uuid[],
  updated_at timestamptz not null default now()
);
insert into public.banese_ead_checkout_expiration_config(environment)
values ('sandbox'), ('production');
alter table public.banese_ead_checkout_expiration_config enable row level security;
revoke all on public.banese_ead_checkout_expiration_config from public, anon, authenticated;
grant select, update on public.banese_ead_checkout_expiration_config to service_role;

create or replace function internal_contas.ead_expiration_first_day(
  p_due_date date, p_verified_local_holidays date[]
)
returns date language plpgsql stable security definer set search_path = '' as $$
declare
  v_day date := p_due_date;
  v_effective date;
  v_count integer := 0;
  v_step integer;
begin
  if p_due_date is null or p_verified_local_holidays is null
    or exists (select 1 from unnest(p_verified_local_holidays) d
      where d is null or extract(year from d) <> 2026) then return null; end if;
  for v_step in 1..40 loop
    v_day := public.banese_next_national_banking_day(v_day);
    if v_day is null then return null; end if;
    if not (v_day = any(p_verified_local_holidays)) then
      if v_effective is null then v_effective := v_day;
      else v_count := v_count + 1; end if;
      -- Three complete banking days after the inclusive effective due day.
      if v_count = 3 then
        if extract(year from v_day+1)<>2026 then return null; end if;
        return v_day + 1;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return null;
end;
$$;
revoke all on function internal_contas.ead_expiration_first_day(date,date[])
  from public, anon, authenticated, service_role;

create table public.banese_ead_checkout_expiration_jobs (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null unique references public.contas_receber(id) on delete restrict,
  matricula_id uuid not null references public.matriculas(id) on delete restrict,
  inscription_id uuid not null references public.inscricoes_online(id) on delete restrict,
  transaction_id uuid not null references public.payment_gateway_transactions(id) on delete restrict,
  environment text not null check (environment in ('sandbox', 'production')),
  state text not null default 'RETRY' check (state in (
    'RETRY', 'PROCESSING', 'REVIEW_REQUIRED', 'DONE', 'PAID'
  )),
  processing_mode text not null default 'CANCEL' check (processing_mode in (
    'CANCEL', 'VERIFY', 'OBSERVE'
  )),
  snapshot jsonb not null,
  expected_receivable_updated_at timestamptz not null,
  expected_transaction_updated_at timestamptz not null,
  expected_inscription_updated_at timestamptz not null,
  first_expiration_day date not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  remote_mutation_started_at timestamptz,
  processing_payment_detected_at timestamptz,
  canceled_at timestamptz,
  observe_until timestamptz,
  remote_status text,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ead_checkout_expiration_lease check (
    (state = 'PROCESSING' and lease_token is not null and lease_until is not null)
    or (state <> 'PROCESSING' and lease_token is null and lease_until is null)
  )
);
create index ead_checkout_expiration_claim_idx
  on public.banese_ead_checkout_expiration_jobs(next_attempt_at,created_at)
  where state in ('RETRY','DONE','PROCESSING');
alter table public.banese_ead_checkout_expiration_jobs enable row level security;
revoke all on public.banese_ead_checkout_expiration_jobs from public, anon, authenticated;
grant select, insert, update on public.banese_ead_checkout_expiration_jobs to service_role;

create table public.banese_ead_checkout_expiration_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.banese_ead_checkout_expiration_jobs(id) on delete restrict,
  event text not null check (event in (
    'CLAIMED', 'REMOTE_INTENT', 'CANCEL_CONFIRMED', 'PAYMENT_CONFIRMED',
    'RETRY', 'REVIEW_REQUIRED', 'OBSERVED_UNPAID'
  )),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.banese_ead_checkout_expiration_events enable row level security;
revoke all on public.banese_ead_checkout_expiration_events from public, anon, authenticated;
grant select, insert on public.banese_ead_checkout_expiration_events to service_role;

alter table public.banese_reconciliation_queue
  drop constraint banese_reconciliation_queue_state_check;
alter table public.banese_reconciliation_queue
  add constraint banese_reconciliation_queue_state_check check (state in (
    'READY','LEASED','DONE','QUARANTINED','REPLACEMENT_FENCED','EXPIRATION_FENCED'
  ));

commit;
