-- Depends on 20260722003000_add_gateway_checkout_creation_fencing.sql because
-- the API/CNAB claim validates and protects contas_receber.gateway_creation_token.
-- CNAB remittance is intentionally restricted to status PENDENTE; the Edge
-- policy must not advertise broader statuses without a separate business review.
begin;

create table if not exists public.payment_gateway_cnab_sequences (
  provider_code text not null references public.payment_gateway_providers(code) on update restrict on delete restrict,
  environment text not null,
  convenio text not null,
  last_nsa integer not null default 1,
  updated_by uuid null references public.usuarios_sistema(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_cnab_sequences_pkey primary key (provider_code, environment, convenio),
  constraint payment_gateway_cnab_sequences_environment_check check (environment in ('sandbox', 'production')),
  constraint payment_gateway_cnab_sequences_convenio_check check (convenio ~ '^[0-9]{1,20}$'),
  constraint payment_gateway_cnab_sequences_last_nsa_check check (last_nsa between 1 and 99999)
);

create index if not exists payment_gateway_cnab_sequences_updated_by_idx
  on public.payment_gateway_cnab_sequences (updated_by)
  where updated_by is not null;

create table if not exists public.payment_gateway_cnab_files (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null references public.payment_gateway_providers(code) on update restrict on delete restrict,
  environment text not null,
  convenio text not null,
  edi7_code text not null,
  direction text not null,
  file_name text not null,
  storage_path text not null unique,
  sha256 text not null,
  status text not null,
  nsa integer null,
  title_count integer not null default 0,
  record_count integer not null default 0,
  total_amount numeric(15, 2) not null default 0,
  created_by uuid null references public.usuarios_sistema(id) on delete set null,
  processed_by uuid null references public.usuarios_sistema(id) on delete set null,
  processing_token uuid null,
  generated_at timestamptz null,
  imported_at timestamptz null,
  processed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  processing_summary jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_cnab_files_environment_check check (environment in ('sandbox', 'production')),
  constraint payment_gateway_cnab_files_convenio_check check (convenio ~ '^[0-9]{1,20}$'),
  constraint payment_gateway_cnab_files_edi7_check check (edi7_code ~ '^[0-9]{6}$'),
  constraint payment_gateway_cnab_files_direction_check check (direction in ('REMESSA', 'RETORNO')),
  constraint payment_gateway_cnab_files_status_check check (
    status in (
      'CREATING',
      'IMPORTING',
      'GENERATED',
      'PREVIEWED',
      'PROCESSING',
      'PROCESSED',
      'PARTIAL',
      'REJECTED'
    )
  ),
  constraint payment_gateway_cnab_files_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint payment_gateway_cnab_files_nsa_check check (nsa is null or nsa between 1 and 99999),
  constraint payment_gateway_cnab_files_name_check check (
    length(btrim(file_name)) between 1 and 180
    and file_name !~ '[\\/]'
  ),
  constraint payment_gateway_cnab_files_storage_path_check check (
    length(btrim(storage_path)) between 1 and 500
    and storage_path !~ '(^|/)\.\.(/|$)'
  ),
  constraint payment_gateway_cnab_files_json_check check (
    jsonb_typeof(metadata) = 'object'
    and jsonb_typeof(processing_summary) = 'object'
  ),
  constraint payment_gateway_cnab_files_version_check check (version > 0),
  constraint payment_gateway_cnab_files_counts_check check (
    title_count >= 0
    and record_count >= 0
    and record_count >= title_count
  ),
  constraint payment_gateway_cnab_files_amount_check check (total_amount >= 0),
  constraint payment_gateway_cnab_files_direction_nsa_check check (
    (direction = 'REMESSA' and nsa is not null) or (direction = 'RETORNO' and nsa is null)
  ),
  constraint payment_gateway_cnab_files_direction_timestamp_check check (
    (
      direction = 'REMESSA'
      and generated_at is not null
      and imported_at is null
    )
    or (
      direction = 'RETORNO'
      and imported_at is not null
      and generated_at is null
    )
  ),
  constraint payment_gateway_cnab_files_direction_status_check check (
    (
      direction = 'REMESSA'
      and status in ('CREATING', 'GENERATED', 'PROCESSED', 'PARTIAL', 'REJECTED')
    )
    or
    (direction = 'RETORNO' and status in ('IMPORTING', 'PREVIEWED', 'PROCESSING', 'PROCESSED', 'PARTIAL', 'REJECTED'))
  ),
  constraint payment_gateway_cnab_files_processing_lease_check check (
    (direction = 'RETORNO' and status = 'PROCESSING' and processing_token is not null)
    or (status <> 'PROCESSING' and processing_token is null)
  ),
  constraint payment_gateway_cnab_files_generated_claim_check check (
    case
      when direction = 'REMESSA' and status = 'GENERATED' then
        title_count > 0
        and case
          when jsonb_typeof(processing_summary -> 'claimedReceivables') = 'number'
            then (processing_summary ->> 'claimedReceivables')::numeric = title_count
          else false
        end
      else true
    end
  ),
  constraint payment_gateway_cnab_files_scope_key
    unique (id, provider_code, environment, convenio, direction),
  constraint payment_gateway_cnab_files_receivable_scope_key
    unique (id, provider_code, environment, convenio)
);

create unique index if not exists payment_gateway_cnab_files_hash_uidx
  on public.payment_gateway_cnab_files (provider_code, environment, convenio, direction, sha256)
  where status <> 'REJECTED';

create unique index if not exists payment_gateway_cnab_files_remittance_nsa_uidx
  on public.payment_gateway_cnab_files (provider_code, environment, convenio, nsa)
  where direction = 'REMESSA';

create index if not exists payment_gateway_cnab_files_status_created_idx
  on public.payment_gateway_cnab_files (
    provider_code,
    environment,
    convenio,
    direction,
    status,
    created_at desc
  );

create index if not exists payment_gateway_cnab_files_created_by_idx
  on public.payment_gateway_cnab_files (created_by)
  where created_by is not null;

create index if not exists payment_gateway_cnab_files_processed_by_idx
  on public.payment_gateway_cnab_files (processed_by)
  where processed_by is not null;

create table if not exists public.payment_gateway_cnab_records (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null,
  provider_code text not null,
  environment text not null,
  convenio text not null,
  file_direction text not null,
  receivable_id uuid null references public.contas_receber(id) on delete restrict,
  record_type text not null,
  line_number integer not null,
  sequence_number integer null,
  nosso_numero text not null,
  event_fingerprint text null,
  movement_code text null,
  occurrence_codes text[] not null default '{}'::text[],
  nominal_amount numeric(15, 2) null,
  paid_amount numeric(15, 2) null,
  expected_min_amount numeric(15, 2) null,
  expected_max_amount numeric(15, 2) null,
  occurrence_date date null,
  liquidation_channel text null,
  expected_receivable_status text null,
  expected_receivable_updated_at timestamptz null,
  status text not null,
  message text null,
  raw_payload jsonb not null default '{}'::jsonb,
  applied_at timestamptz null,
  activation_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_gateway_cnab_records_file_scope_fkey
    foreign key (file_id, provider_code, environment, convenio, file_direction)
    references public.payment_gateway_cnab_files (
      id,
      provider_code,
      environment,
      convenio,
      direction
    )
    on update restrict
    on delete restrict,
  constraint payment_gateway_cnab_records_environment_check
    check (environment in ('sandbox', 'production')),
  constraint payment_gateway_cnab_records_convenio_check
    check (convenio ~ '^[0-9]{1,20}$'),
  constraint payment_gateway_cnab_records_direction_check
    check (file_direction in ('REMESSA', 'RETORNO')),
  constraint payment_gateway_cnab_records_type_check check (record_type in ('TITLE', 'RETURN_EVENT')),
  constraint payment_gateway_cnab_records_direction_type_check check (
    (file_direction = 'REMESSA' and record_type = 'TITLE')
    or (file_direction = 'RETORNO' and record_type = 'RETURN_EVENT')
  ),
  constraint payment_gateway_cnab_records_line_check check (line_number > 0),
  constraint payment_gateway_cnab_records_sequence_check check (
    sequence_number is null or sequence_number between 1 and 99999
  ),
  constraint payment_gateway_cnab_records_nosso_numero_check check (nosso_numero ~ '^[0-9]{9}$'),
  constraint payment_gateway_cnab_records_fingerprint_check check (
    (record_type = 'TITLE' and event_fingerprint is null)
    or (
      record_type = 'RETURN_EVENT'
      and event_fingerprint is not null
      and event_fingerprint ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint payment_gateway_cnab_records_movement_check check (movement_code is null or movement_code ~ '^[0-9]{2}$'),
  constraint payment_gateway_cnab_records_occurrence_codes_check check (
    cardinality(occurrence_codes) <= 20
    and array_position(occurrence_codes, null) is null
    and (
      cardinality(occurrence_codes) = 0
      or array_to_string(occurrence_codes, ',') ~ '^([0-9A-Z]{2})(,[0-9A-Z]{2})*$'
    )
  ),
  constraint payment_gateway_cnab_records_amounts_check check (
    (nominal_amount is null or nominal_amount >= 0)
    and (paid_amount is null or paid_amount >= 0)
    and (expected_min_amount is null or expected_min_amount >= 0)
    and (expected_max_amount is null or expected_max_amount >= 0)
    and (
      expected_min_amount is null
      or expected_max_amount is null
      or expected_min_amount <= expected_max_amount
    )
  ),
  constraint payment_gateway_cnab_records_channel_check check (
    liquidation_channel is null or liquidation_channel in ('PIX', 'BOLETO', 'NAO_IDENTIFICADO')
  ),
  constraint payment_gateway_cnab_records_status_check check (
    status in (
      'GENERATED',
      'MATCHED',
      'REVIEW_REQUIRED',
      'RECORDED',
      'ACTIVATION_PENDING',
      'ACTIVATED',
      'ERROR',
      'SKIPPED'
    )
  ),
  constraint payment_gateway_cnab_records_snapshot_check check (
    (receivable_id is null and expected_receivable_status is null and expected_receivable_updated_at is null)
    or
    (receivable_id is not null and expected_receivable_status is not null and expected_receivable_updated_at is not null)
  ),
  constraint payment_gateway_cnab_records_snapshot_status_check check (
    expected_receivable_status is null
    or expected_receivable_status in (
      'PENDENTE',
      'PAGO',
      'VENCIDO',
      'SUSPENSO',
      'ESTORNADO',
      'CANCELADO',
      'DEVOLVIDO'
    )
  ),
  constraint payment_gateway_cnab_records_payload_check check (
    jsonb_typeof(raw_payload) = 'object'
    and (
      record_type <> 'TITLE'
      or (
        raw_payload ? 'financialTerms'
        and jsonb_typeof(raw_payload -> 'financialTerms') = 'object'
        and (raw_payload -> 'financialTerms') ?& array[
          'nominalAmount',
          'dueDate',
          'discount',
          'penalty',
          'interest'
        ]::text[]
        and raw_payload ? 'documentNumber'
        and jsonb_typeof(raw_payload -> 'documentNumber') = 'string'
        and length(btrim(raw_payload ->> 'documentNumber')) between 1 and 15
        and (raw_payload ->> 'documentNumber') !~ '[\r\n]'
        and raw_payload - array['financialTerms', 'documentNumber']::text[] = '{}'::jsonb
        and (raw_payload -> 'financialTerms')
          - array['nominalAmount', 'dueDate', 'discount', 'penalty', 'interest']::text[]
          = '{}'::jsonb
      )
    )
  ),
  constraint payment_gateway_cnab_records_application_check check (
    (activation_completed_at is null or applied_at is not null)
    and (
      status not in ('RECORDED', 'ACTIVATION_PENDING', 'ACTIVATED')
      or applied_at is not null
    )
    and (status <> 'ACTIVATED' or activation_completed_at is not null)
  ),
  constraint payment_gateway_cnab_records_file_line_uidx unique (file_id, line_number),
  constraint payment_gateway_cnab_records_id_file_key unique (id, file_id)
);

create unique index if not exists payment_gateway_cnab_records_return_event_uidx
  on public.payment_gateway_cnab_records (
    provider_code,
    environment,
    convenio,
    event_fingerprint
  )
  where record_type = 'RETURN_EVENT' and applied_at is not null;

create unique index if not exists payment_gateway_cnab_records_remittance_receivable_uidx
  on public.payment_gateway_cnab_records (file_id, receivable_id)
  where record_type = 'TITLE' and receivable_id is not null;

create unique index if not exists payment_gateway_cnab_records_remittance_title_uidx
  on public.payment_gateway_cnab_records (file_id, nosso_numero)
  where record_type = 'TITLE';

create index if not exists payment_gateway_cnab_records_receivable_idx
  on public.payment_gateway_cnab_records (receivable_id)
  where receivable_id is not null;

create index if not exists payment_gateway_cnab_records_file_status_idx
  on public.payment_gateway_cnab_records (file_id, status);

create index if not exists payment_gateway_cnab_records_nosso_numero_idx
  on public.payment_gateway_cnab_records (
    provider_code,
    environment,
    convenio,
    nosso_numero,
    created_at desc
  );

create table if not exists public.payment_gateway_cnab_audit_events (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.payment_gateway_cnab_files(id) on delete restrict,
  record_id uuid null,
  actor_id uuid null references public.usuarios_sistema(id) on delete restrict,
  request_id text null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payment_gateway_cnab_audit_record_file_fkey
    foreign key (record_id, file_id)
    references public.payment_gateway_cnab_records (id, file_id)
    on delete restrict,
  constraint payment_gateway_cnab_audit_action_check check (
    action in (
      'REMESSA_GERADA',
      'REMESSA_VINCULADA',
      'REMESSA_BAIXADA',
      'RETORNO_PREVISUALIZADO',
      'RETORNO_REPETIDO',
      'RETORNO_REGISTRADO',
      'RETORNO_REVALIDADO',
      'RETORNO_REVISAO',
      'RETORNO_APLICADO',
      'PROCESSAMENTO_RETOMADO',
      'ATIVACAO_CONCLUIDA',
      'ATIVACAO_FALHOU',
      'ARQUIVO_REJEITADO'
    )
  ),
  constraint payment_gateway_cnab_audit_request_id_check check (
    request_id is null or length(request_id) between 1 and 120
  ),
  constraint payment_gateway_cnab_audit_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists payment_gateway_cnab_audit_file_created_idx
  on public.payment_gateway_cnab_audit_events (file_id, created_at desc);

create index if not exists payment_gateway_cnab_audit_record_idx
  on public.payment_gateway_cnab_audit_events (record_id)
  where record_id is not null;

create index if not exists payment_gateway_cnab_audit_actor_created_idx
  on public.payment_gateway_cnab_audit_events (actor_id, created_at desc)
  where actor_id is not null;

alter table public.contas_receber
  add column if not exists gateway_submission_channel text null,
  add column if not exists gateway_submission_status text null,
  add column if not exists gateway_cnab_file_id uuid null;

alter table public.contas_receber
  add constraint contas_receber_gateway_submission_channel_check
    check (
      gateway_submission_channel is null
      or gateway_submission_channel in ('API', 'CNAB')
    ) not valid,
  add constraint contas_receber_gateway_submission_status_check
    check (
      gateway_submission_status is null
      or gateway_submission_status in (
        'API_AMBIGUOUS',
        'API_REGISTERED',
        'CNAB_GENERATED',
        'CNAB_SENT',
        'CNAB_REGISTERED',
        'CNAB_REJECTED'
      )
    ) not valid,
  add constraint contas_receber_gateway_submission_state_check
    check (
      coalesce(
        (
          gateway_submission_channel is null
          and gateway_submission_status is null
          and gateway_cnab_file_id is null
        )
        or (
          gateway_submission_channel = 'API'
          and gateway_submission_status in ('API_AMBIGUOUS', 'API_REGISTERED')
          and gateway_cnab_file_id is null
        )
        or (
          gateway_submission_channel = 'CNAB'
          and gateway_submission_status in (
            'CNAB_GENERATED',
            'CNAB_SENT',
            'CNAB_REGISTERED',
            'CNAB_REJECTED'
          )
          and gateway_cnab_file_id is not null
          and gateway_provider is not null
          and gateway_environment is not null
          and gateway_boleto_convenio is not null
          and jsonb_typeof(gateway_financial_terms) = 'object'
          and gateway_financial_terms_confirmed_at is not null
        ),
        false
      )
    ) not valid,
  add constraint contas_receber_gateway_cnab_file_scope_fkey
    foreign key (
      gateway_cnab_file_id,
      gateway_provider,
      gateway_environment,
      gateway_boleto_convenio
    )
    references public.payment_gateway_cnab_files (
      id,
      provider_code,
      environment,
      convenio
    )
    on update restrict
    on delete restrict
    not valid;

create index if not exists contas_receber_gateway_cnab_file_idx
  on public.contas_receber (gateway_cnab_file_id)
  where gateway_cnab_file_id is not null;

create index if not exists contas_receber_gateway_submission_status_idx
  on public.contas_receber (
    gateway_submission_channel,
    gateway_submission_status,
    updated_at desc
  )
  where gateway_submission_channel is not null;

comment on column public.contas_receber.gateway_submission_channel is
  'Canal atomico e imutavel que assumiu o registro externo do titulo: API ou CNAB.';

comment on column public.contas_receber.gateway_submission_status is
  'Estado do fencing de registro externo; impede alternancia insegura entre API e CNAB.';

comment on column public.contas_receber.gateway_cnab_file_id is
  'Remessa CNAB que assumiu o registro externo do titulo; preenchido apenas para o canal CNAB.';

update public.contas_receber
set gateway_submission_channel = 'API',
    gateway_submission_status = 'API_REGISTERED',
    updated_at = now()
where gateway_provider = 'banese_card'
  and gateway_submission_channel is null
  and gateway_submission_status is null
  and gateway_cnab_file_id is null
  and (
    gateway_boleto_issued_at is not null
    or gateway_payment_id is not null
    or gateway_payment_link_id is not null
    or gateway_boleto_linha_digitavel is not null
    or gateway_boleto_codigo_barras is not null
    or gateway_invoice_url is not null
    or gateway_bank_slip_url is not null
  );

alter table public.contas_receber
  validate constraint contas_receber_gateway_submission_channel_check;
alter table public.contas_receber
  validate constraint contas_receber_gateway_submission_status_check;
alter table public.contas_receber
  validate constraint contas_receber_gateway_submission_state_check;
alter table public.contas_receber
  validate constraint contas_receber_gateway_cnab_file_scope_fkey;

alter table public.payment_gateway_cnab_sequences enable row level security;
alter table public.payment_gateway_cnab_files enable row level security;
alter table public.payment_gateway_cnab_records enable row level security;
alter table public.payment_gateway_cnab_audit_events enable row level security;

revoke all on table public.payment_gateway_cnab_sequences from public, anon, authenticated;
revoke all on table public.payment_gateway_cnab_files from public, anon, authenticated;
revoke all on table public.payment_gateway_cnab_records from public, anon, authenticated;
revoke all on table public.payment_gateway_cnab_audit_events from public, anon, authenticated;

grant select, insert, update on table public.payment_gateway_cnab_sequences to service_role;
grant select, insert, update on table public.payment_gateway_cnab_files to service_role;
grant select, insert, update on table public.payment_gateway_cnab_records to service_role;
grant select, insert on table public.payment_gateway_cnab_audit_events to service_role;
grant select on table public.payment_gateway_cnab_files to authenticated;
grant select (
  id,
  file_id,
  provider_code,
  environment,
  convenio,
  file_direction,
  receivable_id,
  record_type,
  line_number,
  sequence_number,
  nosso_numero,
  event_fingerprint,
  movement_code,
  occurrence_codes,
  nominal_amount,
  paid_amount,
  expected_min_amount,
  expected_max_amount,
  occurrence_date,
  liquidation_channel,
  expected_receivable_status,
  expected_receivable_updated_at,
  status,
  message,
  applied_at,
  activation_completed_at,
  created_at,
  updated_at
) on table public.payment_gateway_cnab_records to authenticated;
grant select on table public.payment_gateway_cnab_audit_events to authenticated;

drop policy if exists payment_gateway_cnab_files_global_gestor_select on public.payment_gateway_cnab_files;
create policy payment_gateway_cnab_files_global_gestor_select
on public.payment_gateway_cnab_files
for select
to authenticated
using (
  public.is_gestor_global()
  and public.gestor_has_financeiro_tab('conciliacao-bancaria')
);

drop policy if exists payment_gateway_cnab_records_global_gestor_select on public.payment_gateway_cnab_records;
create policy payment_gateway_cnab_records_global_gestor_select
on public.payment_gateway_cnab_records
for select
to authenticated
using (
  public.is_gestor_global()
  and public.gestor_has_financeiro_tab('conciliacao-bancaria')
  and exists (
    select 1
    from public.payment_gateway_cnab_files f
    where f.id = payment_gateway_cnab_records.file_id
  )
);

drop policy if exists payment_gateway_cnab_audit_global_gestor_select on public.payment_gateway_cnab_audit_events;
create policy payment_gateway_cnab_audit_global_gestor_select
on public.payment_gateway_cnab_audit_events
for select
to authenticated
using (
  public.is_gestor_global()
  and public.gestor_has_financeiro_tab('conciliacao-bancaria')
  and exists (
    select 1
    from public.payment_gateway_cnab_files f
    where f.id = payment_gateway_cnab_audit_events.file_id
  )
);

create or replace function public.enforce_payment_gateway_cnab_file_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transition_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if (new.direction = 'REMESSA' and new.status <> 'CREATING')
       or (new.direction = 'RETORNO' and new.status <> 'IMPORTING') then
      raise exception using
        errcode = '23514',
        message = 'Remessa deve nascer CREATING e retorno deve nascer IMPORTING.';
    end if;
    return new;
  end if;

  if row(
    new.provider_code,
    new.environment,
    new.convenio,
    new.edi7_code,
    new.direction,
    new.file_name,
    new.storage_path,
    new.sha256,
    new.nsa,
    new.title_count,
    new.record_count,
    new.total_amount,
    new.generated_at,
    new.imported_at
  ) is distinct from row(
    old.provider_code,
    old.environment,
    old.convenio,
    old.edi7_code,
    old.direction,
    old.file_name,
    old.storage_path,
    old.sha256,
    old.nsa,
    old.title_count,
    old.record_count,
    old.total_amount,
    old.generated_at,
    old.imported_at
  ) then
    raise exception using
      errcode = '23514',
      message = 'Identidade, escopo e totais do arquivo CNAB sao imutaveis.';
  end if;

  if new.status is distinct from old.status then
    v_transition_allowed := case
      when old.direction = 'REMESSA' and old.status = 'CREATING'
        then new.status in ('GENERATED', 'REJECTED')
      when old.direction = 'REMESSA' and old.status = 'GENERATED'
        then new.status in ('PROCESSED', 'PARTIAL', 'REJECTED')
      when old.direction = 'REMESSA' and old.status = 'PARTIAL'
        then new.status in ('PROCESSED', 'REJECTED')
      when old.direction = 'RETORNO' and old.status = 'PREVIEWED'
        then new.status in ('PROCESSING', 'REJECTED')
      when old.direction = 'RETORNO' and old.status = 'IMPORTING'
        then new.status in ('PREVIEWED', 'REJECTED')
      when old.direction = 'RETORNO' and old.status = 'PROCESSING'
        then new.status in ('PROCESSED', 'PARTIAL', 'REJECTED')
      when old.direction = 'RETORNO' and old.status = 'PARTIAL'
        then new.status in ('PROCESSING', 'PROCESSED', 'REJECTED')
      else false
    end;

    if not coalesce(v_transition_allowed, false) then
      raise exception using
        errcode = '23514',
        message = 'Transicao invalida no ciclo de vida do arquivo CNAB.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_payment_gateway_cnab_file_state()
  from public, anon, authenticated;

drop trigger if exists enforce_payment_gateway_cnab_file_state
  on public.payment_gateway_cnab_files;
create trigger enforce_payment_gateway_cnab_file_state
before insert or update on public.payment_gateway_cnab_files
for each row
execute function public.enforce_payment_gateway_cnab_file_state();

create or replace function public.protect_receivable_gateway_managed_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
  v_managed_fields constant text[] := array[
    'asaas_bank_slip_url',
    'asaas_fee_value',
    'asaas_installment_id',
    'asaas_invoice_url',
    'asaas_last_error',
    'asaas_net_value',
    'asaas_payment_id',
    'asaas_payment_link_id',
    'asaas_status',
    'asaas_synced_at',
    'asaas_transaction_receipt_url',
    'nosso_numero_asaas',
    'gateway_bank_slip_url',
    'gateway_boleto_agencia',
    'gateway_boleto_codigo_barras',
    'gateway_boleto_convenio',
    'gateway_boleto_issued_at',
    'gateway_boleto_linha_digitavel',
    'gateway_boleto_nosso_numero',
    'gateway_cnab_file_id',
    'gateway_creation_token',
    'gateway_customer_id',
    'gateway_environment',
    'gateway_fee_value',
    'gateway_financial_terms',
    'gateway_financial_terms_confirmed_at',
    'gateway_installment_id',
    'gateway_installments',
    'gateway_invoice_url',
    'gateway_issuer_polo_id',
    'gateway_last_error',
    'gateway_net_value',
    'gateway_payment_id',
    'gateway_payment_link_id',
    'gateway_payment_method',
    'gateway_pix_encoded_image',
    'gateway_pix_payload',
    'gateway_provider',
    'gateway_status',
    'gateway_submission_channel',
    'gateway_submission_status',
    'gateway_synced_at',
    'gateway_transaction_receipt_url'
  ];
  v_new_values jsonb;
  v_old_values jsonb;
begin
  if v_trusted_writer then
    return new;
  end if;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into v_new_values
  from jsonb_each(to_jsonb(new)) entry
  where entry.key = any(v_managed_fields);

  if tg_op = 'INSERT' then
    if jsonb_strip_nulls(v_new_values) <> '{}'::jsonb then
      raise exception using
        errcode = '42501',
        message = 'Campos gerenciados pelo gateway somente podem ser gravados pelo servidor.';
    end if;
    return new;
  end if;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into v_old_values
  from jsonb_each(to_jsonb(old)) entry
  where entry.key = any(v_managed_fields);

  if v_new_values is distinct from v_old_values then
    raise exception using
      errcode = '42501',
      message = 'Campos gerenciados pelo gateway somente podem ser alterados pelo servidor.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_receivable_gateway_managed_fields()
  from public, anon, authenticated;
grant execute on function public.protect_receivable_gateway_managed_fields()
  to service_role;

drop trigger if exists protect_receivable_gateway_managed_fields
  on public.contas_receber;
create trigger protect_receivable_gateway_managed_fields
before insert or update on public.contas_receber
for each row
execute function public.protect_receivable_gateway_managed_fields();

comment on function public.protect_receivable_gateway_managed_fields() is
  'Impede clientes de injetar ou alterar campos de gateway, inclusive o fencing API/CNAB.';

create or replace function public.enforce_receivable_gateway_submission_fence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Compatibilidade fail-safe com versões já implantadas dos emissores:
  -- uma identidade bancária materializada prova que a API assumiu o título.
  -- O Nosso Número isolado não basta, pois ele é reservado antes do POST.
  if old.gateway_submission_channel is null
     and new.gateway_submission_channel is null
     and old.gateway_submission_status is null
     and new.gateway_submission_status is null
     and new.gateway_cnab_file_id is null
     and new.gateway_provider = 'banese_card'
     and (
       new.gateway_boleto_issued_at is not null
       or new.gateway_payment_id is not null
       or new.gateway_payment_link_id is not null
       or new.gateway_boleto_linha_digitavel is not null
       or new.gateway_boleto_codigo_barras is not null
       or new.gateway_invoice_url is not null
       or new.gateway_bank_slip_url is not null
     ) then
    new.gateway_submission_channel := 'API';
    new.gateway_submission_status := 'API_REGISTERED';
  end if;

  if old.gateway_submission_channel is not null
     and new.gateway_submission_channel is distinct from old.gateway_submission_channel then
    raise exception using
      errcode = '23514',
      message = 'O canal de registro externo do titulo nao pode ser trocado depois do claim.';
  end if;

  if old.gateway_cnab_file_id is not null
     and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id then
    raise exception using
      errcode = '23514',
      message = 'A remessa CNAB vinculada ao titulo e imutavel.';
  end if;

  if old.gateway_submission_channel = 'CNAB'
     and (
       new.gateway_financial_terms is distinct from old.gateway_financial_terms
       or new.gateway_financial_terms_confirmed_at
          is distinct from old.gateway_financial_terms_confirmed_at
     ) then
    raise exception using
      errcode = '23514',
      message = 'O snapshot financeiro da remessa CNAB e imutavel.';
  end if;

  if old.gateway_submission_status is not null
     and new.gateway_submission_status is distinct from old.gateway_submission_status then
    if not coalesce(case old.gateway_submission_status
      when 'API_AMBIGUOUS' then new.gateway_submission_status = 'API_REGISTERED'
      when 'API_REGISTERED' then false
      when 'CNAB_GENERATED' then new.gateway_submission_status in (
        'CNAB_SENT',
        'CNAB_REGISTERED',
        'CNAB_REJECTED'
      )
      when 'CNAB_SENT' then new.gateway_submission_status in (
        'CNAB_REGISTERED',
        'CNAB_REJECTED'
      )
      when 'CNAB_REGISTERED' then new.gateway_submission_status = 'CNAB_REJECTED'
      when 'CNAB_REJECTED' then new.gateway_submission_status = 'CNAB_REGISTERED'
      else false
    end, false) then
      raise exception using
        errcode = '23514',
        message = 'Transicao invalida no fencing de registro externo do titulo.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_receivable_gateway_submission_fence()
  from public, anon, authenticated;
grant execute on function public.enforce_receivable_gateway_submission_fence()
  to service_role;

drop trigger if exists enforce_receivable_gateway_submission_fence
  on public.contas_receber;
create trigger enforce_receivable_gateway_submission_fence
before update of
  gateway_submission_channel,
  gateway_submission_status,
  gateway_cnab_file_id,
  gateway_financial_terms,
  gateway_financial_terms_confirmed_at,
  gateway_boleto_issued_at,
  gateway_payment_id,
  gateway_payment_link_id,
  gateway_boleto_linha_digitavel,
  gateway_boleto_codigo_barras,
  gateway_invoice_url,
  gateway_bank_slip_url
on public.contas_receber
for each row
execute function public.enforce_receivable_gateway_submission_fence();

create or replace function public.prevent_banese_cnab_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Eventos de auditoria CNAB sao append-only.';
end;
$$;

revoke all on function public.prevent_banese_cnab_audit_mutation()
  from public, anon, authenticated;

drop trigger if exists prevent_banese_cnab_audit_mutation
  on public.payment_gateway_cnab_audit_events;
create trigger prevent_banese_cnab_audit_mutation
before update or delete on public.payment_gateway_cnab_audit_events
for each row
execute function public.prevent_banese_cnab_audit_mutation();

create or replace function public.reserve_banese_cnab_nsa(
  p_environment text,
  p_convenio text,
  p_updated_by uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text := lower(btrim(coalesce(p_environment, '')));
  v_convenio text := btrim(coalesce(p_convenio, ''));
  v_nsa integer;
begin
  if v_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente CNAB invalido.';
  end if;
  if v_convenio !~ '^[0-9]{1,20}$' then
    raise exception 'Convenio Banese invalido para a sequencia CNAB.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'banese-cnab-nsa:banese_card:' || v_environment || ':' || v_convenio,
      0
    )
  );

  insert into public.payment_gateway_cnab_sequences (
    provider_code,
    environment,
    convenio,
    last_nsa,
    updated_by
  ) values (
    'banese_card',
    v_environment,
    v_convenio,
    1,
    p_updated_by
  )
  on conflict (provider_code, environment, convenio)
  do update set
    last_nsa = public.payment_gateway_cnab_sequences.last_nsa + 1,
    updated_by = excluded.updated_by,
    updated_at = now()
  where public.payment_gateway_cnab_sequences.last_nsa < 99999
  returning last_nsa into v_nsa;

  if v_nsa is null then
    raise exception 'Sequencia NSA CNAB esgotada; confirme a reinicializacao com o Banese.';
  end if;

  return v_nsa;
end;
$$;

revoke all on function public.reserve_banese_cnab_nsa(text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_banese_cnab_nsa(text, text, uuid) to service_role;

create or replace function public.claim_banese_cnab_remittance(
  p_file_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.payment_gateway_cnab_files%rowtype;
  v_record_count integer;
  v_claimed_count integer;
  v_file_version bigint;
  v_generated_at timestamptz := now();
begin
  if p_file_id is null then
    raise exception using
      errcode = '22004',
      message = 'Arquivo de remessa CNAB e obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('banese-cnab-remittance:' || p_file_id::text, 0)
  );

  select file_row.*
    into v_file
  from public.payment_gateway_cnab_files file_row
  where file_row.id = p_file_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Arquivo de remessa CNAB nao encontrado.';
  end if;

  if v_file.provider_code <> 'banese_card'
     or v_file.environment not in ('sandbox', 'production')
     or v_file.convenio !~ '^[0-9]{1,20}$'
     or v_file.direction <> 'REMESSA'
     or v_file.status <> 'CREATING'
     or v_file.generated_at is null
     or v_file.nsa not between 1 and 99999 then
    raise exception using
      errcode = '22023',
      message = 'Arquivo nao e uma remessa Banese CREATING valida para claim.';
  end if;

  perform record_row.id
  from public.payment_gateway_cnab_records record_row
  where record_row.file_id = v_file.id
  order by record_row.id
  for update;

  select count(*)::integer
    into v_record_count
  from public.payment_gateway_cnab_records record_row
  where record_row.file_id = v_file.id;

  if v_record_count < 1
     or v_record_count <> v_file.title_count
     or exists (
       select 1
       from public.payment_gateway_cnab_records record_row
       where record_row.file_id = v_file.id
         and (
           record_row.record_type <> 'TITLE'
           or record_row.file_direction <> 'REMESSA'
           or record_row.status <> 'GENERATED'
           or record_row.provider_code <> v_file.provider_code
           or record_row.environment <> v_file.environment
           or record_row.convenio <> v_file.convenio
           or record_row.receivable_id is null
         )
     )
     or coalesce((
       select round(sum(record_row.nominal_amount), 2)
       from public.payment_gateway_cnab_records record_row
       where record_row.file_id = v_file.id
     ), -1) <> round(v_file.total_amount, 2) then
    raise exception using
      errcode = '22023',
      message = 'Lote CNAB diverge dos titulos, quantidade ou valor total persistidos.';
  end if;

  perform receivable.id
  from public.payment_gateway_cnab_records record_row
  join public.contas_receber receivable
    on receivable.id = record_row.receivable_id
  where record_row.file_id = v_file.id
  order by receivable.id
  for update of receivable;

  perform gateway_transaction.id
  from public.payment_gateway_transactions gateway_transaction
  join public.payment_gateway_cnab_records record_row
    on record_row.receivable_id = gateway_transaction.receivable_id
   and record_row.file_id = v_file.id
  order by gateway_transaction.id
  for update of gateway_transaction;

  if exists (
    select 1
    from public.payment_gateway_cnab_records record_row
    left join public.contas_receber receivable
      on receivable.id = record_row.receivable_id
    where record_row.file_id = v_file.id
      and (
        receivable.id is null
        or receivable.gateway_provider is distinct from v_file.provider_code
        or receivable.gateway_environment is distinct from v_file.environment
        or receivable.gateway_boleto_convenio is distinct from v_file.convenio
        or upper(coalesce(receivable.gateway_payment_method, '')) <> 'BOLETO'
        or upper(coalesce(receivable.status, '')) <> 'PENDENTE'
        or receivable.status is distinct from record_row.expected_receivable_status
        or receivable.updated_at is distinct from record_row.expected_receivable_updated_at
        or receivable.gateway_boleto_nosso_numero is distinct from record_row.nosso_numero
        or receivable.gateway_boleto_issued_at is not null
        or receivable.gateway_payment_id is not null
        or receivable.gateway_payment_link_id is not null
        or receivable.gateway_boleto_linha_digitavel is not null
        or receivable.gateway_boleto_codigo_barras is not null
        or receivable.gateway_invoice_url is not null
        or receivable.gateway_bank_slip_url is not null
        or receivable.gateway_creation_token is not null
        or upper(coalesce(receivable.gateway_status, '')) = 'CREATING'
        or receivable.gateway_submission_channel is not null
        or receivable.gateway_submission_status is not null
        or receivable.gateway_cnab_file_id is not null
        or nullif(btrim(receivable.gateway_last_error), '') is null
        or record_row.nominal_amount is null
        or receivable.valor is null
        or abs(record_row.nominal_amount - receivable.valor) >= 0.01
        or case
          when jsonb_typeof(record_row.raw_payload -> 'financialTerms') = 'object'
            and jsonb_typeof(
              record_row.raw_payload -> 'financialTerms' -> 'nominalAmount'
            ) = 'number'
            and jsonb_typeof(
              record_row.raw_payload -> 'financialTerms' -> 'dueDate'
            ) = 'string'
          then
            abs(
              (record_row.raw_payload -> 'financialTerms' ->> 'nominalAmount')::numeric
              - receivable.valor
            ) >= 0.01
            or (record_row.raw_payload -> 'financialTerms' ->> 'dueDate')
              is distinct from receivable.data_vencimento::text
          else true
        end
        or exists (
          select 1
          from public.payment_gateway_transactions gateway_transaction
          where gateway_transaction.receivable_id = receivable.id
            and (
              gateway_transaction.remote_payment_id is not null
              or gateway_transaction.remote_payment_link_id is not null
              or gateway_transaction.remote_installment_id is not null
            )
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Um ou mais titulos nao sao elegiveis para contingencia CNAB; nenhuma cobranca foi vinculada.';
  end if;

  update public.contas_receber receivable
  set gateway_submission_channel = 'CNAB',
      gateway_submission_status = 'CNAB_GENERATED',
      gateway_cnab_file_id = v_file.id,
      gateway_financial_terms = record_row.raw_payload -> 'financialTerms',
      gateway_financial_terms_confirmed_at = v_generated_at,
      updated_at = v_generated_at
  from public.payment_gateway_cnab_records record_row
  where record_row.file_id = v_file.id
    and record_row.receivable_id = receivable.id
    and receivable.gateway_provider = v_file.provider_code
    and receivable.gateway_environment = v_file.environment
    and receivable.gateway_boleto_convenio = v_file.convenio
    and upper(coalesce(receivable.gateway_payment_method, '')) = 'BOLETO'
    and upper(coalesce(receivable.status, '')) = 'PENDENTE'
    and receivable.status is not distinct from record_row.expected_receivable_status
    and receivable.updated_at is not distinct from record_row.expected_receivable_updated_at
    and receivable.gateway_submission_channel is null
    and receivable.gateway_submission_status is null
    and receivable.gateway_cnab_file_id is null;

  get diagnostics v_claimed_count = row_count;

  if v_claimed_count <> v_record_count then
    raise exception using
      errcode = '40001',
      message = 'Concorrencia detectada ao vincular a remessa CNAB; nenhuma cobranca foi alterada.';
  end if;

  update public.payment_gateway_cnab_files
  set status = 'GENERATED',
      processing_summary = processing_summary || jsonb_build_object(
        'claimedReceivables', v_claimed_count,
        'claimedAt', v_generated_at
      ),
      version = version + 1,
      updated_at = v_generated_at
  where id = v_file.id
    and version = v_file.version
  returning version into v_file_version;

  if v_file_version is null then
    raise exception using
      errcode = '40001',
      message = 'Versao da remessa mudou durante o claim; nenhuma cobranca foi alterada.';
  end if;

  insert into public.payment_gateway_cnab_audit_events (
    file_id,
    actor_id,
    action,
    metadata
  ) values (
    v_file.id,
    p_actor_id,
    'REMESSA_VINCULADA',
    jsonb_build_object(
      'providerCode', v_file.provider_code,
      'environment', v_file.environment,
      'convenio', v_file.convenio,
      'nsa', v_file.nsa,
      'receivableCount', v_claimed_count,
      'fileVersion', v_file_version
    )
  );

  return jsonb_build_object(
    'fileId', v_file.id,
    'providerCode', v_file.provider_code,
    'environment', v_file.environment,
    'convenio', v_file.convenio,
    'receivableCount', v_claimed_count,
    'fileVersion', v_file_version,
    'claimed', true
  );
end;
$$;

revoke all on function public.claim_banese_cnab_remittance(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_banese_cnab_remittance(uuid, uuid)
  to service_role;

create or replace function public.finalize_banese_cnab_return_preview(
  p_file_id uuid,
  p_actor_id uuid default null
)
returns public.payment_gateway_cnab_files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.payment_gateway_cnab_files%rowtype;
  v_record_count integer;
begin
  if p_file_id is null then
    raise exception using
      errcode = '22004',
      message = 'Arquivo de retorno CNAB e obrigatorio.';
  end if;

  select file_row.*
    into v_file
  from public.payment_gateway_cnab_files file_row
  where file_row.id = p_file_id
  for update;

  if not found
     or v_file.provider_code <> 'banese_card'
     or v_file.direction <> 'RETORNO'
     or v_file.status <> 'IMPORTING' then
    raise exception using
      errcode = '55000',
      message = 'Arquivo nao esta no estado IMPORTING para finalizar a previa.';
  end if;

  select count(*)
    into v_record_count
  from public.payment_gateway_cnab_records record_row
  where record_row.file_id = p_file_id
    and record_row.provider_code = v_file.provider_code
    and record_row.environment = v_file.environment
    and record_row.convenio = v_file.convenio
    and record_row.file_direction = 'RETORNO'
    and record_row.record_type = 'RETURN_EVENT';

  if v_record_count <> v_file.title_count then
    raise exception using
      errcode = '23514',
      message = 'Quantidade persistida diverge dos eventos validados do retorno CNAB.';
  end if;

  update public.payment_gateway_cnab_files
  set status = 'PREVIEWED',
      processing_summary = jsonb_build_object('persistedRecords', v_record_count),
      updated_at = now()
  where id = p_file_id
    and status = 'IMPORTING'
  returning * into v_file;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Arquivo mudou antes da finalizacao da previa CNAB.';
  end if;

  return v_file;
end;
$$;

revoke all on function public.finalize_banese_cnab_return_preview(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_banese_cnab_return_preview(uuid, uuid)
  to service_role;

create or replace function public.revalidate_banese_cnab_return_records(
  p_file_id uuid,
  p_processing_token uuid,
  p_updates jsonb,
  p_actor_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.payment_gateway_cnab_files%rowtype;
  v_input_count integer;
  v_updated_count integer;
  v_now timestamptz := now();
begin
  if p_file_id is null or p_processing_token is null then
    raise exception using
      errcode = '22004',
      message = 'Arquivo e token de revalidacao CNAB sao obrigatorios.';
  end if;
  if p_updates is null
     or jsonb_typeof(p_updates) <> 'array'
     or jsonb_array_length(p_updates) not between 1 and 250 then
    raise exception using
      errcode = '22023',
      message = 'A revalidacao CNAB aceita lotes entre 1 e 250 registros.';
  end if;

  select file_row.*
    into v_file
  from public.payment_gateway_cnab_files file_row
  where file_row.id = p_file_id
  for update;

  if not found
     or v_file.provider_code <> 'banese_card'
     or v_file.direction <> 'RETORNO'
     or v_file.status <> 'PROCESSING'
     or v_file.processing_token is distinct from p_processing_token then
    raise exception using
      errcode = '55000',
      message = 'Lease de revalidacao do retorno CNAB invalido.';
  end if;

  with input_rows as (
    select parsed.*
    from jsonb_to_recordset(p_updates) as parsed(
      id uuid,
      expected_record_status text,
      expected_record_updated_at timestamptz,
      receivable_id uuid,
      expected_receivable_status text,
      expected_receivable_updated_at timestamptz,
      expected_min_amount numeric,
      expected_max_amount numeric,
      status text,
      message text
    )
  )
  select count(*), count(distinct id)
    into v_input_count, v_updated_count
  from input_rows;

  if v_input_count <> v_updated_count
     or exists (
       select 1
       from jsonb_to_recordset(p_updates) as parsed(
         id uuid,
         expected_record_status text,
         expected_record_updated_at timestamptz,
         receivable_id uuid,
         expected_receivable_status text,
         expected_receivable_updated_at timestamptz,
         expected_min_amount numeric,
         expected_max_amount numeric,
         status text,
         message text
       )
       where parsed.id is null
          or parsed.expected_record_status not in ('MATCHED', 'REVIEW_REQUIRED', 'ERROR')
          or parsed.expected_record_updated_at is null
          or parsed.status not in ('MATCHED', 'REVIEW_REQUIRED', 'SKIPPED')
          or length(coalesce(parsed.message, '')) > 500
          or (
            parsed.receivable_id is null
            and (
              parsed.expected_receivable_status is not null
              or parsed.expected_receivable_updated_at is not null
            )
          )
          or (
            parsed.receivable_id is not null
            and (
              parsed.expected_receivable_status is null
              or parsed.expected_receivable_updated_at is null
            )
          )
          or (
            parsed.expected_min_amount is not null
            and parsed.expected_max_amount is not null
            and parsed.expected_min_amount > parsed.expected_max_amount
          )
     ) then
    raise exception using
      errcode = '22023',
      message = 'Payload de revalidacao CNAB invalido.';
  end if;

  with input_rows as (
    select parsed.*
    from jsonb_to_recordset(p_updates) as parsed(
      id uuid,
      expected_record_status text,
      expected_record_updated_at timestamptz,
      receivable_id uuid,
      expected_receivable_status text,
      expected_receivable_updated_at timestamptz,
      expected_min_amount numeric,
      expected_max_amount numeric,
      status text,
      message text
    )
  ), updated_rows as (
    update public.payment_gateway_cnab_records record_row
    set receivable_id = input_rows.receivable_id,
        expected_receivable_status = input_rows.expected_receivable_status,
        expected_receivable_updated_at = input_rows.expected_receivable_updated_at,
        expected_min_amount = input_rows.expected_min_amount,
        expected_max_amount = input_rows.expected_max_amount,
        status = input_rows.status,
        message = input_rows.message,
        updated_at = v_now
    from input_rows
    where record_row.id = input_rows.id
      and record_row.file_id = p_file_id
      and record_row.record_type = 'RETURN_EVENT'
      and record_row.file_direction = 'RETORNO'
      and record_row.applied_at is null
      and record_row.status = input_rows.expected_record_status
      and record_row.updated_at is not distinct from input_rows.expected_record_updated_at
    returning record_row.id
  )
  select count(*) into v_updated_count from updated_rows;

  if v_updated_count <> v_input_count then
    raise exception using
      errcode = '40001',
      message = 'Registros do retorno mudaram durante a revalidacao; tente novamente.';
  end if;

  update public.payment_gateway_cnab_files
  set updated_at = v_now
  where id = p_file_id
    and status = 'PROCESSING'
    and processing_token = p_processing_token;

  return v_updated_count;
end;
$$;

revoke all on function public.revalidate_banese_cnab_return_records(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.revalidate_banese_cnab_return_records(uuid, uuid, jsonb, uuid)
  to service_role;

create or replace function public.finish_banese_cnab_return_processing(
  p_file_id uuid,
  p_processing_token uuid,
  p_mark_processed_at boolean default true
)
returns public.payment_gateway_cnab_files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.payment_gateway_cnab_files%rowtype;
  v_summary jsonb := '{}'::jsonb;
  v_pending_count bigint := 0;
  v_now timestamptz := now();
begin
  if p_file_id is null or p_processing_token is null then
    raise exception using
      errcode = '22004',
      message = 'Arquivo e token de processamento CNAB sao obrigatorios.';
  end if;

  select file_row.*
    into v_file
  from public.payment_gateway_cnab_files file_row
  where file_row.id = p_file_id
  for update;

  if not found
     or v_file.provider_code <> 'banese_card'
     or v_file.direction <> 'RETORNO'
     or v_file.status <> 'PROCESSING'
     or v_file.processing_token is distinct from p_processing_token then
    raise exception using
      errcode = '55000',
      message = 'Lease de conclusao do retorno CNAB invalido.';
  end if;

  select
    coalesce(jsonb_object_agg(status_count.status, status_count.total), '{}'::jsonb),
    coalesce(sum(status_count.total) filter (
      where status_count.status in (
        'REVIEW_REQUIRED',
        'ACTIVATION_PENDING',
        'ERROR',
        'MATCHED'
      )
    ), 0)
    into v_summary, v_pending_count
  from (
    select record_row.status, count(*) as total
    from public.payment_gateway_cnab_records record_row
    where record_row.file_id = p_file_id
    group by record_row.status
  ) status_count;

  update public.payment_gateway_cnab_files
  set status = case when v_pending_count > 0 then 'PARTIAL' else 'PROCESSED' end,
      processing_token = null,
      processed_at = case
        when p_mark_processed_at then v_now
        else processed_at
      end,
      processing_summary = v_summary,
      updated_at = v_now
  where id = p_file_id
    and status = 'PROCESSING'
    and processing_token = p_processing_token
  returning * into v_file;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Lease do retorno CNAB foi perdido antes da conclusao.';
  end if;

  return v_file;
end;
$$;

revoke all on function public.finish_banese_cnab_return_processing(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_banese_cnab_return_processing(uuid, uuid, boolean)
  to service_role;

-- Remove possible local/prototype overloads so PostgREST can never resolve an
-- older implementation instead of the token-fenced function below.
drop function if exists public.apply_banese_cnab_return_record(uuid, uuid);
drop function if exists public.apply_banese_cnab_return_record(uuid, uuid, text);

create or replace function public.apply_banese_cnab_return_record(
  p_record_id uuid,
  p_processing_token uuid,
  p_actor_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.payment_gateway_cnab_records%rowtype;
  v_file public.payment_gateway_cnab_files%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_payment_method text;
  v_submission_status text;
  v_review_reason text;
  v_request_id text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_applied_at timestamptz := now();
  v_receivable_updated_at timestamptz;
  v_transaction_id uuid;
begin
  if p_record_id is null then
    raise exception using
      errcode = '22004',
      message = 'Registro de retorno CNAB e obrigatorio.';
  end if;
  if p_processing_token is null then
    raise exception using
      errcode = '22004',
      message = 'Token de processamento do retorno CNAB e obrigatorio.';
  end if;
  if v_request_id is not null and length(v_request_id) > 120 then
    raise exception using
      errcode = '22023',
      message = 'Identificador da requisicao excede 120 caracteres.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('banese-cnab-record:' || p_record_id::text, 0)
  );

  select record_row.*
    into v_record
  from public.payment_gateway_cnab_records record_row
  where record_row.id = p_record_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Registro CNAB nao encontrado.';
  end if;

  select file_row.*
    into v_file
  from public.payment_gateway_cnab_files file_row
  where file_row.id = v_record.file_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Arquivo do registro CNAB nao existe.';
  end if;

  if v_file.provider_code <> 'banese_card'
     or v_file.environment not in ('sandbox', 'production')
     or v_file.convenio !~ '^[0-9]{1,20}$'
     or v_file.direction <> 'RETORNO'
     or v_record.provider_code <> v_file.provider_code
     or v_record.environment <> v_file.environment
     or v_record.convenio <> v_file.convenio
     or v_record.file_direction <> v_file.direction
     or v_record.record_type <> 'RETURN_EVENT' then
    raise exception using
      errcode = '22023',
      message = 'Registro nao pertence ao escopo exato de um retorno CNAB240 Banese.';
  end if;

  if v_file.status <> 'PROCESSING'
     or v_file.processing_token is distinct from p_processing_token then
    raise exception using
      errcode = '55000',
      message = 'Lease de processamento do retorno CNAB nao pertence a esta execucao.';
  end if;

  update public.payment_gateway_cnab_files
  set updated_at = v_applied_at
  where id = v_file.id
    and status = 'PROCESSING'
    and processing_token = p_processing_token
  returning * into v_file;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Lease de processamento do retorno CNAB foi perdido.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'banese-cnab-return:'
        || v_record.provider_code || ':'
        || v_record.environment || ':'
        || v_record.convenio || ':'
        || v_record.event_fingerprint,
      0
    )
  );

  if exists (
    select 1
    from public.payment_gateway_cnab_records applied_record
    where applied_record.id <> v_record.id
      and applied_record.record_type = 'RETURN_EVENT'
      and applied_record.provider_code = v_record.provider_code
      and applied_record.environment = v_record.environment
      and applied_record.convenio = v_record.convenio
      and applied_record.event_fingerprint = v_record.event_fingerprint
      and applied_record.applied_at is not null
  ) then
    update public.payment_gateway_cnab_records
    set status = 'SKIPPED',
        message = 'Evento ja aplicado por outro arquivo de retorno.',
        updated_at = v_applied_at
    where id = v_record.id
      and applied_at is null;

    insert into public.payment_gateway_cnab_audit_events (
      file_id,
      record_id,
      actor_id,
      request_id,
      action,
      metadata
    ) values (
      v_file.id,
      v_record.id,
      p_actor_id,
      v_request_id,
      'RETORNO_REPETIDO',
      jsonb_build_object('sameFingerprintAlreadyApplied', true)
    );

    return jsonb_build_object(
      'recordId', v_record.id,
      'receivableId', v_record.receivable_id,
      'paymentApplied', false,
      'alreadyProcessed', true,
      'needsActivation', false
    );
  end if;

  if v_record.applied_at is not null then
    insert into public.payment_gateway_cnab_audit_events (
      file_id,
      record_id,
      actor_id,
      request_id,
      action,
      metadata
    ) values (
      v_file.id,
      v_record.id,
      p_actor_id,
      v_request_id,
      'RETORNO_REPETIDO',
      jsonb_build_object(
        'status', v_record.status,
        'appliedAt', v_record.applied_at
      )
    );

    return jsonb_build_object(
      'recordId', v_record.id,
      'receivableId', v_record.receivable_id,
      'paymentApplied', false,
      'alreadyProcessed', true,
      'needsActivation',
        v_record.status = 'ACTIVATION_PENDING'
        and v_record.activation_completed_at is null
    );
  end if;

  if v_record.status <> 'MATCHED' then
    raise exception using
      errcode = '55000',
      message = 'Registro do retorno deve estar MATCHED antes da aplicacao.';
  end if;

  if coalesce(v_record.movement_code, '') not in ('06', '17') then
    if v_record.receivable_id is not null then
      select receivable.*
        into v_receivable
      from public.contas_receber receivable
      where receivable.id = v_record.receivable_id
      for update;

      if not found then
        v_review_reason := 'Recebivel vinculado ao retorno deixou de existir.';
      elsif v_record.movement_code in ('02', '03', '09')
         and (
           (
             v_receivable.gateway_submission_channel = 'API'
             and v_receivable.gateway_submission_status = 'API_REGISTERED'
           )
           or (
             v_receivable.gateway_submission_channel = 'CNAB'
             and v_receivable.gateway_submission_status in (
               'CNAB_GENERATED',
               'CNAB_SENT',
               'CNAB_REGISTERED',
               'CNAB_REJECTED'
             )
           )
         ) then
        if v_receivable.gateway_provider is distinct from v_record.provider_code
           or v_receivable.gateway_environment is distinct from v_record.environment
           or v_receivable.gateway_boleto_convenio is distinct from v_record.convenio
           or upper(coalesce(v_receivable.gateway_payment_method, '')) <> 'BOLETO'
           or v_receivable.gateway_boleto_nosso_numero is distinct from v_record.nosso_numero
           or v_receivable.gateway_creation_token is not null
           or upper(coalesce(v_receivable.gateway_status, '')) = 'CREATING'
           or upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO')
           or v_receivable.status is distinct from v_record.expected_receivable_status
           or v_receivable.updated_at is distinct from v_record.expected_receivable_updated_at then
          v_review_reason :=
            'Recebivel mudou depois da pre-visualizacao; revalide o retorno.';
        else
          v_submission_status := case
            when v_receivable.gateway_submission_channel = 'API'
              then v_receivable.gateway_submission_status
            when v_record.movement_code = '02' then 'CNAB_REGISTERED'
            else 'CNAB_REJECTED'
          end;

          update public.contas_receber
          set gateway_submission_status = v_submission_status,
              gateway_status = case
                when v_record.movement_code = '02' then 'PENDING'
                when v_record.movement_code = '03' then 'REJECTED'
                else 'CANCELED_BY_BANK'
              end,
              gateway_synced_at = v_applied_at,
              gateway_last_error = case
                when v_record.movement_code = '02' then null
                else coalesce(v_record.message, 'Titulo encerrado pelo retorno CNAB Banese.')
              end,
              updated_at = v_applied_at
          where id = v_receivable.id
            and (
              (
                gateway_submission_channel = 'API'
                and gateway_submission_status = 'API_REGISTERED'
              )
              or (
                gateway_submission_channel = 'CNAB'
                and gateway_submission_status in (
                  'CNAB_GENERATED',
                  'CNAB_SENT',
                  'CNAB_REGISTERED',
                  'CNAB_REJECTED'
                )
              )
            );
        end if;
      end if;
    end if;

    if v_review_reason is not null then
      update public.payment_gateway_cnab_records
      set status = 'REVIEW_REQUIRED',
          message = v_review_reason,
          updated_at = v_applied_at
      where id = v_record.id;

      insert into public.payment_gateway_cnab_audit_events (
        file_id,
        record_id,
        actor_id,
        request_id,
        action,
        metadata
      ) values (
        v_file.id,
        v_record.id,
        p_actor_id,
        v_request_id,
        'RETORNO_REVISAO',
        jsonb_build_object('reason', v_review_reason, 'movementCode', v_record.movement_code)
      );

      return jsonb_build_object(
        'recordId', v_record.id,
        'receivableId', v_record.receivable_id,
        'paymentApplied', false,
        'alreadyProcessed', false,
        'needsActivation', false,
        'reviewRequired', true
      );
    end if;

    update public.payment_gateway_cnab_records
    set status = 'RECORDED',
        message = coalesce(message, 'Movimento registrado sem baixa financeira.'),
        applied_at = v_applied_at,
        updated_at = v_applied_at
    where id = v_record.id;

    insert into public.payment_gateway_cnab_audit_events (
      file_id,
      record_id,
      actor_id,
      request_id,
      action,
      metadata
    ) values (
      v_file.id,
      v_record.id,
      p_actor_id,
      v_request_id,
      'RETORNO_REGISTRADO',
      jsonb_build_object(
        'movementCode', v_record.movement_code,
        'paymentApplied', false,
        'submissionStatus', v_submission_status
      )
    );

    return jsonb_build_object(
      'recordId', v_record.id,
      'receivableId', v_record.receivable_id,
      'paymentApplied', false,
      'alreadyProcessed', false,
      'needsActivation', false
    );
  end if;

  if v_record.receivable_id is null then
    v_review_reason := 'Liquidacao sem recebivel correspondente.';
  elsif v_record.occurrence_date is null
     or coalesce(v_record.paid_amount, 0) <= 0
     or v_record.expected_min_amount is null
     or v_record.expected_max_amount is null then
    v_review_reason := 'Liquidacao sem data ou faixa financeira suficiente para baixa segura.';
  end if;

  if v_review_reason is null then
    select receivable.*
      into v_receivable
    from public.contas_receber receivable
    where receivable.id = v_record.receivable_id
    for update;

    if not found then
      v_review_reason := 'Recebivel vinculado ao retorno deixou de existir.';
    end if;
  end if;

  if v_review_reason is null then
    if v_receivable.gateway_provider is distinct from v_record.provider_code
       or v_receivable.gateway_environment is distinct from v_record.environment
       or v_receivable.gateway_boleto_convenio is distinct from v_record.convenio
       or upper(coalesce(v_receivable.gateway_payment_method, '')) <> 'BOLETO'
       or v_receivable.gateway_boleto_nosso_numero is distinct from v_record.nosso_numero then
      v_review_reason :=
        'Retorno diverge do provedor, ambiente, convenio, produto BOLETO ou Nosso Numero.';
    elsif v_receivable.gateway_creation_token is not null
       or upper(coalesce(v_receivable.gateway_status, '')) = 'CREATING' then
      v_review_reason :=
        'Cobranca possui criacao remota em andamento; reconcilie a API antes da baixa.';
    elsif not (
      (
        v_receivable.gateway_submission_channel = 'API'
        and v_receivable.gateway_submission_status = 'API_REGISTERED'
      )
      or (
        v_receivable.gateway_submission_channel = 'CNAB'
        and v_receivable.gateway_submission_status in (
          'CNAB_GENERATED',
          'CNAB_SENT',
          'CNAB_REGISTERED'
        )
      )
    ) then
      v_review_reason :=
        'Cobranca nao possui registro externo confirmado por API ou remessa CNAB.';
    elsif upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO') then
      v_review_reason := 'Status financeiro atual nao permite baixa automatica.';
    elsif v_receivable.status is distinct from v_record.expected_receivable_status
       or v_receivable.updated_at is distinct from v_record.expected_receivable_updated_at then
      v_review_reason := 'Recebivel mudou depois da pre-visualizacao; gere um novo preview.';
    elsif v_record.nominal_amount is null
       or v_receivable.valor is null
       or abs(v_record.nominal_amount - v_receivable.valor) >= 0.01 then
      v_review_reason := 'Valor nominal do retorno diverge do recebivel.';
    elsif v_record.paid_amount < v_record.expected_min_amount
       or v_record.paid_amount > v_record.expected_max_amount then
      v_review_reason := 'Valor liquidado esta fora da faixa financeira calculada no preview.';
    end if;
  end if;

  if v_review_reason is not null then
    update public.payment_gateway_cnab_records
    set status = 'REVIEW_REQUIRED',
        message = v_review_reason,
        updated_at = v_applied_at
    where id = v_record.id;

    insert into public.payment_gateway_cnab_audit_events (
      file_id,
      record_id,
      actor_id,
      request_id,
      action,
      metadata
    ) values (
      v_file.id,
      v_record.id,
      p_actor_id,
      v_request_id,
      'RETORNO_REVISAO',
      jsonb_build_object(
        'reason', v_review_reason,
        'expectedStatus', v_record.expected_receivable_status,
        'actualStatus', case
          when v_record.receivable_id is null then null
          else v_receivable.status
        end
      )
    );

    return jsonb_build_object(
      'recordId', v_record.id,
      'receivableId', v_record.receivable_id,
      'paymentApplied', false,
      'alreadyProcessed', false,
      'needsActivation', false,
      'reviewRequired', true
    );
  end if;

  -- Motivo/canal Pix representa liquidacao BolePix. O produto bancario
  -- permanece BOLETO; somente a forma de pagamento contabil muda para PIX.
  v_payment_method := case
    when v_record.liquidation_channel = 'PIX'
      or '61' = any(v_record.occurrence_codes) then 'PIX'
    else 'BOLETO'
  end;

  update public.contas_receber
  set status = 'PAGO',
      valor_pago = v_record.paid_amount,
      data_pagamento = v_record.occurrence_date,
      forma_pagamento = v_payment_method,
      origem_pagamento = 'BANESE_CNAB240',
      gateway_status = 'PAID',
      gateway_submission_status = case
        when gateway_submission_channel = 'CNAB' then 'CNAB_REGISTERED'
        when gateway_submission_channel = 'API' then 'API_REGISTERED'
        else gateway_submission_status
      end,
      gateway_synced_at = v_applied_at,
      gateway_last_error = null,
      updated_at = v_applied_at
  where id = v_receivable.id
    and gateway_provider = v_record.provider_code
    and gateway_environment = v_record.environment
    and gateway_boleto_convenio = v_record.convenio
    and upper(coalesce(gateway_payment_method, '')) = 'BOLETO'
    and gateway_boleto_nosso_numero = v_record.nosso_numero
    and gateway_creation_token is null
    and upper(coalesce(gateway_status, '')) <> 'CREATING'
    and (
      (
        gateway_submission_channel = 'API'
        and gateway_submission_status = 'API_REGISTERED'
      )
      or (
        gateway_submission_channel = 'CNAB'
        and gateway_submission_status in (
          'CNAB_GENERATED',
          'CNAB_SENT',
          'CNAB_REGISTERED'
        )
      )
    )
    and status is not distinct from v_record.expected_receivable_status
    and updated_at is not distinct from v_record.expected_receivable_updated_at
    and status in ('PENDENTE', 'VENCIDO')
  returning updated_at into v_receivable_updated_at;

  if v_receivable_updated_at is null then
    raise exception using
      errcode = '40001',
      message = 'CAS da baixa CNAB falhou; nenhum pagamento foi aplicado.';
  end if;

  insert into public.payment_gateway_transactions (
    receivable_id,
    provider_code,
    environment,
    payment_method,
    remote_payment_id,
    remote_customer_id,
    remote_status,
    amount,
    invoice_url,
    bank_slip_url,
    bank_slip_digitable_line,
    bank_slip_barcode,
    bank_slip_our_number,
    installments,
    origin_polo_id,
    issuer_polo_id,
    transaction_receipt_url,
    raw_payload,
    last_error,
    synced_at,
    updated_at
  ) values (
    v_receivable.id,
    v_record.provider_code,
    v_record.environment,
    'BOLETO',
    v_record.nosso_numero,
    v_receivable.gateway_customer_id,
    'PAID',
    v_record.nominal_amount,
    v_receivable.gateway_invoice_url,
    v_receivable.gateway_bank_slip_url,
    v_receivable.gateway_boleto_linha_digitavel,
    v_receivable.gateway_boleto_codigo_barras,
    v_record.nosso_numero,
    greatest(coalesce(v_receivable.gateway_installments, 1), 1),
    v_receivable.polo_id,
    v_receivable.gateway_issuer_polo_id,
    v_receivable.gateway_transaction_receipt_url,
    jsonb_build_object(
      'cnab240',
      jsonb_build_object(
        'lastEvent',
        jsonb_build_object(
          'fileId', v_file.id,
          'recordId', v_record.id,
          'fingerprint', v_record.event_fingerprint,
          'movementCode', v_record.movement_code,
          'paidAmount', v_record.paid_amount,
          'occurrenceDate', v_record.occurrence_date,
          'liquidationChannel', coalesce(v_record.liquidation_channel, 'NAO_IDENTIFICADO')
        )
      )
    ),
    null,
    v_applied_at,
    v_applied_at
  )
  on conflict (provider_code, environment, remote_payment_id)
    where remote_payment_id is not null
  do update set
    receivable_id = excluded.receivable_id,
    payment_method = excluded.payment_method,
    remote_customer_id = coalesce(
      excluded.remote_customer_id,
      payment_gateway_transactions.remote_customer_id
    ),
    remote_status = excluded.remote_status,
    amount = excluded.amount,
    invoice_url = coalesce(excluded.invoice_url, payment_gateway_transactions.invoice_url),
    bank_slip_url = coalesce(excluded.bank_slip_url, payment_gateway_transactions.bank_slip_url),
    bank_slip_digitable_line = coalesce(
      excluded.bank_slip_digitable_line,
      payment_gateway_transactions.bank_slip_digitable_line
    ),
    bank_slip_barcode = coalesce(
      excluded.bank_slip_barcode,
      payment_gateway_transactions.bank_slip_barcode
    ),
    bank_slip_our_number = excluded.bank_slip_our_number,
    installments = excluded.installments,
    origin_polo_id = coalesce(
      excluded.origin_polo_id,
      payment_gateway_transactions.origin_polo_id
    ),
    issuer_polo_id = coalesce(
      excluded.issuer_polo_id,
      payment_gateway_transactions.issuer_polo_id
    ),
    transaction_receipt_url = coalesce(
      excluded.transaction_receipt_url,
      payment_gateway_transactions.transaction_receipt_url
    ),
    raw_payload = jsonb_set(
      coalesce(payment_gateway_transactions.raw_payload, '{}'::jsonb),
      '{cnab240}',
      coalesce(payment_gateway_transactions.raw_payload -> 'cnab240', '{}'::jsonb)
        || (excluded.raw_payload -> 'cnab240'),
      true
    ),
    last_error = null,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at
  where payment_gateway_transactions.receivable_id = excluded.receivable_id
    and payment_gateway_transactions.payment_method = 'BOLETO'
    and (
      payment_gateway_transactions.bank_slip_our_number is null
      or payment_gateway_transactions.bank_slip_our_number = excluded.bank_slip_our_number
    )
  returning id into v_transaction_id;

  if v_transaction_id is null then
    raise exception using
      errcode = '23505',
      message = 'Identidade da transacao Banese ja pertence a outra cobranca.';
  end if;

  update public.payment_gateway_cnab_records
  set status = 'ACTIVATION_PENDING',
      message = 'Pagamento aplicado por CAS; projecao academica pendente de confirmacao.',
      applied_at = v_applied_at,
      updated_at = v_applied_at
  where id = v_record.id;

  insert into public.payment_gateway_cnab_audit_events (
    file_id,
    record_id,
    actor_id,
    request_id,
    action,
    metadata
  ) values (
    v_file.id,
    v_record.id,
    p_actor_id,
    v_request_id,
    'RETORNO_APLICADO',
    jsonb_build_object(
      'providerCode', v_record.provider_code,
      'environment', v_record.environment,
      'convenio', v_record.convenio,
      'movementCode', v_record.movement_code,
      'liquidationChannel', coalesce(v_record.liquidation_channel, 'NAO_IDENTIFICADO'),
      'paymentMethod', v_payment_method,
      'previousStatus', v_receivable.status,
      'paidAmount', v_record.paid_amount,
      'occurrenceDate', v_record.occurrence_date
    )
  );

  return jsonb_build_object(
    'recordId', v_record.id,
    'receivableId', v_record.receivable_id,
    'paymentApplied', true,
    'alreadyProcessed', false,
    'needsActivation', true,
    'paymentMethod', v_payment_method
  );
end;
$$;

revoke all on function public.apply_banese_cnab_return_record(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_banese_cnab_return_record(uuid, uuid, uuid, text)
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-cnab',
  'bank-cnab',
  false,
  5242880,
  array['text/plain', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

update public.perfis_acesso
set permissoes = jsonb_set(
      permissoes,
      '{financeiroTabs}',
      coalesce(permissoes -> 'financeiroTabs', '[]'::jsonb) || to_jsonb('conciliacao-bancaria'::text),
      true
    )
where nome = 'Perfil Gestor'
  and coalesce(permissoes -> 'financeiroTabs', '[]'::jsonb) @> '[]'::jsonb
  and not coalesce(permissoes -> 'financeiroTabs', '[]'::jsonb) ? 'conciliacao-bancaria';

commit;
