begin;

create table public.banese_ead_title_replacement_jobs (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.contas_receber(id) on delete restrict,
  provider_code text not null default 'banese_card'
    check (provider_code = 'banese_card'),
  environment text not null check (environment in ('sandbox', 'production')),
  convenio text not null check (convenio ~ '^[0-9]{1,20}$'),
  agency text not null check (agency ~ '^[0-9]{3}$' and agency <> '000'),
  canceled_nosso_numero text not null check (canceled_nosso_numero ~ '^[0-9]{9}$'),
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  expected_due_date date not null,
  expected_receivable_updated_at timestamptz not null,
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING',
    'RECOVERED_EXISTING_PIX', 'COMPLETED', 'REISSUED_PIX_PENDING',
    'STOPPED_PAID', 'REISSUED_PAID', 'REVIEW_REQUIRED', 'REVIEW_FENCED'
  )),
  replacement_nosso_numero text check (
    replacement_nosso_numero is null or replacement_nosso_numero ~ '^[0-9]{9}$'
  ),
  authorized_reason text not null
    check (length(btrim(authorized_reason)) between 12 and 200),
  requested_by uuid,
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'
  ),
  cancel_mutation_intent_at timestamptz,
  cancel_mutation_intent_count integer not null default 0
    check (cancel_mutation_intent_count between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (receivable_id, canceled_nosso_numero),
  check (
    (status in ('PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING')
      and lease_token is not null and lease_until is not null)
    or
    (status not in ('PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING')
      and lease_token is null and lease_until is null)
  )
);

create unique index banese_ead_title_replacement_active_uidx
  on public.banese_ead_title_replacement_jobs (receivable_id)
  where status in (
    'QUEUED', 'PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED',
    'REISSUING', 'REVIEW_FENCED'
  );

create table public.banese_ead_title_replacement_archive (
  job_id uuid primary key references public.banese_ead_title_replacement_jobs(id)
    on delete restrict,
  receivable_id uuid not null references public.contas_receber(id) on delete restrict,
  source_transaction_id uuid not null unique
    references public.payment_gateway_transactions(id) on delete restrict,
  source_inscription_id uuid
    references public.inscricoes_online(id) on delete restrict,
  provider_code text not null default 'banese_card'
    check (provider_code = 'banese_card'),
  environment text not null check (environment in ('sandbox', 'production')),
  convenio text not null check (convenio ~ '^[0-9]{1,20}$'),
  agency text not null check (agency ~ '^[0-9]{3}$' and agency <> '000'),
  canceled_nosso_numero text not null check (canceled_nosso_numero ~ '^[0-9]{9}$'),
  remote_cancel_situation_code integer not null check (remote_cancel_situation_code = 5),
  remote_cancel_confirmed_at timestamptz not null,
  remote_cancel_fingerprint text not null
    check (remote_cancel_fingerprint ~ '^[0-9a-f]{64}$'),
  remote_cancel_observed_pre_canceled boolean not null,
  remote_cancel_put_attempted_in_confirmation boolean not null,
  remote_cancel_mutation_intent_at timestamptz,
  receivable_pre_snapshot jsonb not null
    check (jsonb_typeof(receivable_pre_snapshot) = 'object'),
  transaction_pre_snapshot jsonb not null
    check (jsonb_typeof(transaction_pre_snapshot) = 'object'),
  inscription_pre_snapshot jsonb
    check (inscription_pre_snapshot is null
      or jsonb_typeof(inscription_pre_snapshot) = 'object'),
  transaction_canceled_snapshot jsonb not null
    check (jsonb_typeof(transaction_canceled_snapshot) = 'object'),
  inscription_reset_snapshot jsonb
    check (inscription_reset_snapshot is null
      or jsonb_typeof(inscription_reset_snapshot) = 'object'),
  archived_at timestamptz not null default now(),
  unique (environment, convenio, canceled_nosso_numero),
  check (
    (source_inscription_id is null and inscription_pre_snapshot is null
      and inscription_reset_snapshot is null)
    or
    (source_inscription_id is not null and inscription_pre_snapshot is not null
      and inscription_reset_snapshot is not null)
  )
);

create or replace function public.prevent_banese_ead_replacement_archive_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'O arquivo de substituicao BolePix EAD e imutavel.'
    using errcode = '55000';
end;
$function$;

create trigger prevent_banese_ead_replacement_archive_mutation
before update or delete on public.banese_ead_title_replacement_archive
for each row execute function public.prevent_banese_ead_replacement_archive_mutation();

alter table public.banese_ead_title_replacement_jobs enable row level security;
alter table public.banese_ead_title_replacement_archive enable row level security;
revoke all on public.banese_ead_title_replacement_jobs
  from public, anon, authenticated;
revoke all on public.banese_ead_title_replacement_archive
  from public, anon, authenticated;
grant select on public.banese_ead_title_replacement_jobs to service_role;
grant select on public.banese_ead_title_replacement_archive to service_role;
revoke all on function public.prevent_banese_ead_replacement_archive_mutation()
  from public, anon, authenticated;

commit;
