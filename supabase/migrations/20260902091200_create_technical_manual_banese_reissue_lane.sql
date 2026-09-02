begin;
set local lock_timeout = '5s';

create table internal_academic.technical_manual_banese_reissue_jobs (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.contas_receber(id) on delete restrict,
  matricula_id uuid not null,
  turma_id uuid not null,
  cycle_number smallint not null check (cycle_number in (1, 2)),
  cycle_request_id uuid not null,
  expected_item_count integer not null check (expected_item_count > 0),
  recovery_request_id uuid not null,
  original_actor_id uuid not null references auth.users(id) on delete restrict,
  canceled_nosso_numero text not null check (
    canceled_nosso_numero ~ '^[0-9]{9}$'
  ),
  convenio text not null check (convenio ~ '^[0-9]+$'),
  agency text not null check (agency ~ '^[0-9]{3}$' and agency <> '000'),
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  expected_due_date date not null,
  receivable_fingerprint text not null check (
    receivable_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  expected_receivable_updated_at timestamptz not null,
  lease_token uuid not null default gen_random_uuid(),
  lease_valid_until timestamptz not null,
  status text not null default 'FENCED' check (
    status in (
      'FENCED', 'CANCEL_INTENT', 'CANCEL_CONFIRMED',
      'RECOVERED_PIX', 'RESET_COMPLETE'
    )
  ),
  cancel_mutation_intent_at timestamptz,
  cancel_mutation_intent_count integer not null default 0
    check (cancel_mutation_intent_count between 0 and 3),
  reset_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receivable_id, canceled_nosso_numero),
  foreign key (matricula_id, cycle_number)
    references internal_academic.technical_manual_cycle_runs(
      matricula_id, cycle_number
    ) on delete restrict
);

create unique index technical_manual_banese_reissue_active_uidx
  on internal_academic.technical_manual_banese_reissue_jobs(receivable_id)
  where status in ('FENCED', 'CANCEL_INTENT', 'CANCEL_CONFIRMED');

create table internal_academic.technical_manual_banese_reissue_archive (
  job_id uuid primary key references
    internal_academic.technical_manual_banese_reissue_jobs(id) on delete restrict,
  receivable_id uuid not null references public.contas_receber(id) on delete restrict,
  matricula_id uuid not null,
  turma_id uuid not null,
  cycle_number smallint not null,
  cycle_request_id uuid not null,
  recovery_request_id uuid not null,
  original_actor_id uuid not null,
  canceled_nosso_numero text not null check (
    canceled_nosso_numero ~ '^[0-9]{9}$'
  ),
  environment text not null check (environment = 'production'),
  convenio text not null check (convenio ~ '^[0-9]+$'),
  agency text not null check (agency ~ '^[0-9]{3}$' and agency <> '000'),
  expected_amount numeric(14,2) not null,
  expected_due_date date not null,
  receivable_fingerprint text not null check (
    receivable_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  remote_cancel_status text not null check (
    remote_cancel_status in ('CANCELED', 'CANCELLED')
  ),
  remote_cancel_situation_code integer not null check (
    remote_cancel_situation_code = 5
  ),
  remote_cancel_confirmed_at timestamptz not null,
  remote_cancel_fingerprint text not null check (
    remote_cancel_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  remote_cancel_observed_pre_canceled boolean not null,
  remote_cancel_put_attempted boolean not null,
  cancel_mutation_intent_at timestamptz,
  gateway_pre_snapshot jsonb not null check (
    jsonb_typeof(gateway_pre_snapshot) = 'object'
  ),
  financial_terms_snapshot jsonb not null check (
    jsonb_typeof(financial_terms_snapshot) = 'object'
  ),
  archived_at timestamptz not null default now(),
  check (
    (
      remote_cancel_observed_pre_canceled
      and not remote_cancel_put_attempted
      and cancel_mutation_intent_at is null
    ) or (
      not remote_cancel_observed_pre_canceled
      and remote_cancel_put_attempted
      and cancel_mutation_intent_at is not null
    )
  ),
  unique (environment, convenio, canceled_nosso_numero)
);

alter table internal_academic.technical_manual_banese_reissue_jobs
  enable row level security;
alter table internal_academic.technical_manual_banese_reissue_archive
  enable row level security;
revoke all on table
  internal_academic.technical_manual_banese_reissue_jobs,
  internal_academic.technical_manual_banese_reissue_archive
  from public, anon, authenticated, service_role;

create or replace function
internal_academic.prevent_technical_manual_banese_reissue_archive_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'O arquivo da reemissão técnica Banese é imutável.'
    using errcode = '55000';
end;
$function$;

revoke all on function
  internal_academic.prevent_technical_manual_banese_reissue_archive_mutation()
  from public, anon, authenticated, service_role;
create trigger prevent_technical_manual_banese_reissue_archive_mutation
before update or delete
on internal_academic.technical_manual_banese_reissue_archive
for each row execute function
  internal_academic.prevent_technical_manual_banese_reissue_archive_mutation();

create or replace function
internal_academic.guard_banese_canceled_number_archive_global()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banese-canceled-number:' || new.environment || ':' || new.convenio || ':' ||
      new.canceled_nosso_numero, 0));
  if tg_table_schema = 'internal_academic' and exists (
    select 1 from public.banese_ead_title_replacement_archive as archive
    where archive.environment = new.environment
      and archive.convenio = new.convenio
      and archive.canceled_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese já arquivado no fluxo EAD.'
      using errcode = '23505';
  elsif tg_table_schema = 'public' and exists (
    select 1
    from internal_academic.technical_manual_banese_reissue_archive as archive
    where archive.environment = new.environment
      and archive.convenio = new.convenio
      and archive.canceled_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese já arquivado no fluxo técnico.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_banese_canceled_number_archive_global()
  from public, anon, authenticated, service_role;
create trigger guard_technical_banese_canceled_number_archive_global
before insert on internal_academic.technical_manual_banese_reissue_archive
for each row execute function
  internal_academic.guard_banese_canceled_number_archive_global();
create trigger guard_ead_banese_canceled_number_archive_global
before insert on public.banese_ead_title_replacement_archive
for each row execute function
  internal_academic.guard_banese_canceled_number_archive_global();

create or replace function
internal_academic.technical_manual_banese_reissue_bypass_valid(
  p_receivable_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (
    coalesce(auth.role(), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin', 'service_role')
  ) and exists (
    select 1
    from internal_academic.technical_manual_banese_reissue_jobs as job
    join internal_academic.technical_manual_banese_reissue_archive as archive
      on archive.job_id = job.id
      and archive.receivable_id = job.receivable_id
      and archive.canceled_nosso_numero = job.canceled_nosso_numero
    join public.contas_receber as receivable
      on receivable.id = job.receivable_id
    where job.id::text = current_setting(
        'app.technical_manual_banese_reissue_job_id', true
      )
      and job.recovery_request_id::text = current_setting(
        'app.technical_manual_banese_reissue_request_id', true
      )
      and job.receivable_id = p_receivable_id
      and job.status = 'CANCEL_CONFIRMED'
      and job.lease_token::text = current_setting(
        'app.technical_manual_banese_reissue_lease_token', true
      )
      and job.lease_valid_until > pg_catalog.clock_timestamp()
      and archive.remote_cancel_situation_code = 5
      and receivable.updated_at = job.expected_receivable_updated_at
      and receivable.gateway_provider = 'banese_card'
      and receivable.gateway_environment = 'production'
      and receivable.gateway_payment_method = 'BOLETO'
      and receivable.gateway_submission_channel = 'API'
      and receivable.gateway_submission_status = 'API_REVIEW'
      and receivable.gateway_status = 'CREATING'
      and receivable.gateway_creation_token = job.recovery_request_id
      and receivable.gateway_boleto_nosso_numero = job.canceled_nosso_numero
      and receivable.gateway_payment_id is null
      and receivable.gateway_payment_link_id is null
      and receivable.gateway_boleto_linha_digitavel is null
      and receivable.gateway_boleto_codigo_barras is null
      and receivable.gateway_boleto_issued_at is null
      and receivable.gateway_pix_payload is null
      and receivable.gateway_pix_encoded_image is null
      and not internal_academic.technical_manual_banese_has_settlement_evidence(
        receivable)
      and not exists (select 1
        from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = receivable.id)
      and job.receivable_fingerprint =
        internal_academic.technical_manual_receivable_issuance_fingerprint(
          receivable)
  );
$function$;

revoke all on function
  internal_academic.technical_manual_banese_reissue_bypass_valid(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.enforce_receivable_gateway_submission_fence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reset_fields text[] := array[
    'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
    'gateway_installment_id', 'gateway_status', 'gateway_invoice_url',
    'gateway_bank_slip_url', 'gateway_pix_payload',
    'gateway_pix_encoded_image', 'gateway_transaction_receipt_url',
    'gateway_fee_value', 'gateway_net_value', 'gateway_synced_at',
    'gateway_last_error', 'gateway_boleto_linha_digitavel',
    'gateway_boleto_codigo_barras', 'gateway_boleto_nosso_numero',
    'gateway_boleto_issued_at', 'gateway_financial_terms_confirmed_at',
    'gateway_creation_token', 'gateway_submission_channel',
    'gateway_submission_status', 'gateway_cnab_file_id'
  ];
begin
  if internal_academic.technical_manual_banese_reissue_bypass_valid(old.id)
    and old.gateway_submission_channel = 'API'
    and old.gateway_submission_status = 'API_REVIEW'
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_creation_token is null
    and new.gateway_status is null
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_installment_id is null
    and new.gateway_invoice_url is null
    and new.gateway_bank_slip_url is null
    and new.gateway_transaction_receipt_url is null
    and new.gateway_fee_value is null
    and new.gateway_net_value is null
    and new.gateway_synced_at is null
    and new.gateway_last_error is null
    and new.gateway_boleto_nosso_numero is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_pix_payload is null
    and new.gateway_pix_encoded_image is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_financial_terms is not distinct from old.gateway_financial_terms
    and new.updated_at > old.updated_at
    and to_jsonb(new) - (v_reset_fields || array['updated_at'])
      is not distinct from
      to_jsonb(old) - (v_reset_fields || array['updated_at'])
  then
    return new;
  end if;
  if public.banese_ead_replacement_bypass_valid(old.id)
    and new.gateway_payment_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_financial_terms is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_invoice_url is null and new.gateway_bank_slip_url is null
  then
    return new;
  end if;
  if old.gateway_submission_channel is null
    and new.gateway_submission_channel is null
    and old.gateway_submission_status is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_provider = 'banese_card'
    and (new.gateway_boleto_issued_at is not null
      or new.gateway_payment_id is not null
      or new.gateway_payment_link_id is not null
      or new.gateway_boleto_linha_digitavel is not null
      or new.gateway_boleto_codigo_barras is not null
      or new.gateway_invoice_url is not null
      or new.gateway_bank_slip_url is not null)
  then
    new.gateway_submission_channel := 'API';
    new.gateway_submission_status := 'API_REGISTERED';
  end if;
  if old.gateway_submission_channel is not null
    and new.gateway_submission_channel is distinct from
      old.gateway_submission_channel
  then
    raise exception
      'O canal de registro externo do titulo nao pode ser trocado depois do claim.'
      using errcode = '23514';
  end if;
  if old.gateway_cnab_file_id is not null
    and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id
  then
    raise exception 'A remessa CNAB vinculada ao titulo e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_channel = 'CNAB' and (
    new.gateway_financial_terms is distinct from old.gateway_financial_terms
    or new.gateway_financial_terms_confirmed_at is distinct from
      old.gateway_financial_terms_confirmed_at
  ) then
    raise exception 'O snapshot financeiro da remessa CNAB e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_status is not null
    and new.gateway_submission_status is distinct from
      old.gateway_submission_status
    and not coalesce(case old.gateway_submission_status
      when 'API_AMBIGUOUS' then new.gateway_submission_status in
        ('API_REGISTERED', 'API_REVIEW')
      when 'API_REGISTERED' then false
      when 'API_REVIEW' then
        (
          coalesce(auth.role(), '') = 'service_role'
          or session_user in ('postgres', 'supabase_admin', 'service_role')
        )
        and new.gateway_submission_status = 'API_AMBIGUOUS'
        and current_setting(
          'app.technical_manual_cycle_review_reopen_receivable_id', true
        ) = old.id::text
        and old.gateway_submission_channel = 'API'
        and new.gateway_submission_channel = 'API'
        and new.gateway_creation_token is not distinct from
          old.gateway_creation_token
        and new.gateway_boleto_nosso_numero is not distinct from
          old.gateway_boleto_nosso_numero
      when 'CNAB_GENERATED' then new.gateway_submission_status in
        ('CNAB_SENT', 'CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_SENT' then new.gateway_submission_status in
        ('CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_REGISTERED' then new.gateway_submission_status =
        'CNAB_REJECTED'
      when 'CNAB_REJECTED' then new.gateway_submission_status =
        'CNAB_REGISTERED'
      else false end, false)
  then
    raise exception
      'Transicao invalida no fencing de registro externo do titulo.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_receivable_gateway_submission_fence()
  from public, anon, authenticated;
grant execute on function public.enforce_receivable_gateway_submission_fence()
  to service_role;

create or replace function
internal_academic.guard_technical_manual_banese_canceled_number_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.gateway_boleto_nosso_numero is null
    or new.gateway_provider is distinct from 'banese_card'
    or new.gateway_payment_method is distinct from 'BOLETO'
  then
    return new;
  end if;
  if new.gateway_environment is null
    or new.gateway_boleto_convenio is null
  then
    raise exception 'Ambiente e convênio Banese são obrigatórios.'
      using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banese-canceled-number:' || new.gateway_environment || ':' ||
      new.gateway_boleto_convenio || ':' ||
      new.gateway_boleto_nosso_numero, 0));
  if exists (
      select 1
      from internal_academic.technical_manual_banese_reissue_archive as archive
      where archive.environment = new.gateway_environment
        and archive.convenio = new.gateway_boleto_convenio
        and archive.canceled_nosso_numero = new.gateway_boleto_nosso_numero
      union all
      select 1
      from public.banese_ead_title_replacement_archive as archive
      where archive.environment = new.gateway_environment
        and archive.convenio = new.gateway_boleto_convenio
        and archive.canceled_nosso_numero = new.gateway_boleto_nosso_numero
    )
  then
    raise exception 'Nosso Número Banese cancelado não pode ser reutilizado.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_technical_manual_banese_canceled_number_reuse()
  from public, anon, authenticated, service_role;
create trigger guard_technical_manual_banese_canceled_number_reuse
before insert or update of gateway_boleto_nosso_numero,
  gateway_environment, gateway_boleto_convenio,
  gateway_provider, gateway_payment_method on public.contas_receber
for each row execute function
  internal_academic.guard_technical_manual_banese_canceled_number_reuse();

create or replace function
internal_academic.finish_technical_manual_banese_reissue_on_recovered_pix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (
      coalesce(auth.role(), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin', 'service_role')
    )
    and old.gateway_submission_status = 'API_AMBIGUOUS'
    and new.gateway_submission_status = 'API_REGISTERED'
    and current_setting(
      'app.technical_manual_cycle_review_reopen_receivable_id', true
    ) = new.id::text
    and old.gateway_creation_token is not null
    and new.gateway_creation_token is null
    and nullif(btrim(coalesce(new.gateway_pix_payload, '')), '') is not null
    and nullif(btrim(coalesce(new.gateway_pix_encoded_image, '')), '') is not null
  then
    update internal_academic.technical_manual_banese_reissue_jobs as job
    set status = 'RECOVERED_PIX', reset_completed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where job.receivable_id = new.id
      and job.recovery_request_id = old.gateway_creation_token
      and job.status = 'FENCED';
  end if;
  return new;
end;
$function$;

revoke all on function
  internal_academic.finish_technical_manual_banese_reissue_on_recovered_pix()
  from public, anon, authenticated, service_role;
create trigger finish_technical_manual_banese_reissue_on_recovered_pix
after update of gateway_submission_status on public.contas_receber
for each row execute function
  internal_academic.finish_technical_manual_banese_reissue_on_recovered_pix();

comment on table
  internal_academic.technical_manual_banese_reissue_archive is
  'Evidência imutável da baixa Banese confirmada antes de reemitir um item técnico.';

commit;
