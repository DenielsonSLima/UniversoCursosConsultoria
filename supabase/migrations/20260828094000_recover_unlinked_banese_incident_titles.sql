begin;

create table if not exists public.banese_boleto_recovery_targets (
  receivable_id uuid primary key references public.contas_receber(id),
  environment text not null check (environment in ('sandbox', 'production')),
  convenio text not null check (convenio ~ '^[0-9]+$'),
  agencia text not null check (agencia ~ '^[0-9]{3}$' and agencia <> '000'),
  candidate_start bigint not null check (candidate_start between 1 and 99999999),
  candidate_end bigint not null check (
    candidate_end between candidate_start and 99999999
  ),
  state text not null default 'PENDING' check (
    state in ('PENDING', 'RECOVERED', 'EXHAUSTED')
  ),
  recovered_nosso_numero text check (
    recovered_nosso_numero is null or recovered_nosso_numero ~ '^[0-9]{9}$'
  ),
  scanned_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (state = 'RECOVERED' and recovered_nosso_numero is not null)
    or (state <> 'RECOVERED' and recovered_nosso_numero is null)
  )
);

alter table public.banese_boleto_recovery_targets enable row level security;
revoke all on public.banese_boleto_recovery_targets from public, anon, authenticated;
grant select, insert, update on public.banese_boleto_recovery_targets to service_role;

with incident_target_ids(receivable_id) as (
  values
    ('08090770-b1d0-4f43-a885-38d3e9859a78'::uuid),
    ('0c5bcdb3-024c-406a-a958-f87260504413'::uuid),
    ('0fe770f0-4bcd-4574-a827-9cf6876e6399'::uuid),
    ('1b47c345-3939-4414-89e5-6ba50fccee91'::uuid),
    ('2bae97e2-cf1c-4153-8da3-6bd9cd41903c'::uuid),
    ('2d5a7b98-ba37-4817-9060-7ab40b6b16d5'::uuid),
    ('38eae118-b430-49a1-8c14-2a99d123d85e'::uuid),
    ('425a9594-cf03-4dd2-a264-fd9ecfc8343f'::uuid),
    ('5c6e5c87-ce71-4185-80af-6c1a0b1e330f'::uuid),
    ('6a9ddb18-d9c7-4b3e-9ed3-c6884d1b4477'::uuid),
    ('87d5ac5d-7796-4627-b3a2-6df97efb6f29'::uuid),
    ('ddf366cf-a365-4a92-81d2-49499203ef32'::uuid),
    ('efe9d997-bf46-4580-83b4-701132d5e815'::uuid)
)
insert into public.banese_boleto_recovery_targets (
  receivable_id, environment, convenio, agencia, candidate_start,
  candidate_end, state, updated_at
)
select receivable.id, 'production', '15261', '033', 1, 23, 'PENDING',
  pg_catalog.clock_timestamp()
from public.contas_receber as receivable
join incident_target_ids as target on target.receivable_id = receivable.id
where receivable.gateway_provider = 'banese_card'
  and receivable.gateway_environment = 'production'
  and receivable.gateway_payment_method = 'BOLETO'
  and receivable.gateway_boleto_convenio = '15261'
  and receivable.gateway_boleto_agencia = '033'
  and receivable.gateway_boleto_nosso_numero is null
  and receivable.gateway_boleto_codigo_barras is null
  and receivable.gateway_boleto_linha_digitavel is null
  and receivable.gateway_boleto_issued_at is null
  and receivable.gateway_creation_token is null
  and receivable.gateway_status is null
  and receivable.gateway_last_error like 'BANESE_IDENTITY_QUARANTINED:%'
  and receivable.status in ('PENDENTE', 'VENCIDO')
  and receivable.data_pagamento is null
  and receivable.valor_pago is null
  and not exists (
    select 1 from public.payment_gateway_transactions as transaction
    where transaction.receivable_id = receivable.id
  )
on conflict (receivable_id) do nothing;

do $incident_scope$
declare
  v_targets integer;
  v_monthly integer;
  v_reenrollment integer;
begin
  select count(*),
    count(*) filter (
      where receivable.tipo_lancamento = 'PARCELA'
        and round(receivable.valor::numeric, 2) = 279.90
    ),
    count(*) filter (
      where receivable.tipo_lancamento = 'REMATRICULA'
        and round(receivable.valor::numeric, 2) = 100.00
    )
  into v_targets, v_monthly, v_reenrollment
  from public.banese_boleto_recovery_targets as target
  join public.contas_receber as receivable
    on receivable.id = target.receivable_id
  where target.environment = 'production'
    and target.convenio = '15261'
    and target.agencia = '033'
    and target.candidate_start = 1
    and target.candidate_end = 23
    and target.state = 'PENDING';

  if v_targets <> 13 or v_monthly <> 12 or v_reenrollment <> 1 then
    raise exception
      'A recuperacao Banese deve conter somente as 13 cobrancas Adenize auditadas.';
  end if;
end;
$incident_scope$;

create or replace function public.reserve_banese_nosso_numero_for_receivable(
  p_receivable_id uuid,
  p_environment text,
  p_convenio text,
  p_agencia text,
  p_expected_creation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing text;
  v_convenio text;
  v_agencia text;
  v_reserved text;
  v_bank_range_confirmed boolean := p_environment <> 'production';
  v_collision_preflight_enabled boolean := p_environment <> 'production';
  v_recovery_start bigint;
  v_recovery_end bigint;
begin
  if p_environment not in ('sandbox', 'production')
    or p_convenio is null or p_convenio !~ '^[0-9]+$'
    or p_agencia is null or p_agencia !~ '^[0-9]{3}$' or p_agencia = '000'
    or p_expected_creation_token is null
  then
    raise exception 'Parametros invalidos para reservar Nosso Numero Banese.';
  end if;

  select receivable.gateway_boleto_nosso_numero,
    receivable.gateway_boleto_convenio, receivable.gateway_boleto_agencia
  into v_existing, v_convenio, v_agencia
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.gateway_creation_token = p_expected_creation_token
    and receivable.gateway_status = 'CREATING'
    and coalesce(receivable.gateway_submission_status, '') <> 'API_AMBIGUOUS'
    and receivable.gateway_payment_id is null
    and receivable.gateway_payment_link_id is null
    and receivable.gateway_boleto_codigo_barras is null
    and receivable.gateway_boleto_linha_digitavel is null
    and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
    and nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '') is null
    and receivable.gateway_boleto_issued_at is null
    and receivable.data_pagamento is null
    and receivable.valor_pago is null
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and not exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
    )
  for update;
  if not found then
    raise exception 'Recebivel Banese indisponivel para reserva do Nosso Numero.';
  end if;

  if (v_convenio is not null and v_convenio <> p_convenio)
    or (v_agencia is not null and v_agencia <> p_agencia)
  then
    raise exception 'Snapshot Banese diverge da tentativa sob ownership.';
  end if;

  if p_environment = 'production' then
    select coalesce(sequence_row.bank_seed_confirmed, false),
      coalesce(sequence_row.collision_preflight_enabled, false)
    into v_bank_range_confirmed, v_collision_preflight_enabled
    from public.banese_boleto_sequences as sequence_row
    where sequence_row.environment = p_environment
      and sequence_row.convenio = coalesce(v_convenio, p_convenio);
  end if;

  if v_existing is not null then
    v_convenio := coalesce(v_convenio, p_convenio);
    v_agencia := coalesce(v_agencia, p_agencia);
    update public.contas_receber as receivable
    set gateway_boleto_convenio = v_convenio,
        gateway_boleto_agencia = v_agencia,
        updated_at = pg_catalog.clock_timestamp()
    where receivable.id = p_receivable_id
      and (receivable.gateway_boleto_convenio is null
        or receivable.gateway_boleto_agencia is null);
    return jsonb_build_object(
      'nossoNumero', v_existing, 'convenio', v_convenio,
      'agencia', v_agencia, 'alreadyReserved', true,
      'bankRangeConfirmed', v_bank_range_confirmed,
      'collisionPreflightEnabled', v_collision_preflight_enabled
    );
  end if;

  select target.candidate_start, target.candidate_end
  into v_recovery_start, v_recovery_end
  from public.banese_boleto_recovery_targets as target
  where target.receivable_id = p_receivable_id
    and target.environment = p_environment
    and target.convenio = p_convenio
    and target.agencia = p_agencia
    and target.state = 'PENDING'
  for update;
  if found then
    return jsonb_build_object(
      'convenio', p_convenio, 'agencia', p_agencia,
      'alreadyReserved', false, 'recoveryPending', true,
      'recoveryCandidateStart', v_recovery_start,
      'recoveryCandidateEnd', v_recovery_end,
      'bankRangeConfirmed', v_bank_range_confirmed,
      'collisionPreflightEnabled', v_collision_preflight_enabled
    );
  end if;

  v_reserved := public.next_banese_nosso_numero(
    p_environment, p_convenio, p_agencia
  );
  update public.contas_receber as receivable
  set gateway_boleto_nosso_numero = v_reserved,
      gateway_boleto_convenio = p_convenio,
      gateway_boleto_agencia = p_agencia,
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = p_receivable_id;
  return jsonb_build_object(
    'nossoNumero', v_reserved, 'convenio', p_convenio,
    'agencia', p_agencia, 'alreadyReserved', false,
    'bankRangeConfirmed', v_bank_range_confirmed,
    'collisionPreflightEnabled', v_collision_preflight_enabled
  );
end;
$function$;

create or replace function public.claim_banese_incident_recovered_title(
  p_receivable_id uuid,
  p_environment text,
  p_convenio text,
  p_agencia text,
  p_nosso_numero text,
  p_expected_creation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.banese_boleto_recovery_targets%rowtype;
  v_base bigint;
begin
  if p_environment not in ('sandbox', 'production')
    or p_convenio is null or p_convenio !~ '^[0-9]+$'
    or p_agencia is null or p_agencia !~ '^[0-9]{3}$' or p_agencia = '000'
    or p_nosso_numero is null or p_nosso_numero !~ '^[0-9]{9}$'
    or p_expected_creation_token is null
  then
    raise exception 'Parametros invalidos para recuperar titulo Banese.';
  end if;

  select * into v_target
  from public.banese_boleto_recovery_targets as target
  where target.receivable_id = p_receivable_id
    and target.state = 'PENDING'
  for update;
  if not found then
    raise exception 'Alvo de recuperacao Banese nao esta pendente.';
  end if;
  v_base := left(p_nosso_numero, 8)::bigint;
  if v_target.environment <> p_environment
    or v_target.convenio <> p_convenio
    or v_target.agencia <> p_agencia
    or v_base not between v_target.candidate_start and v_target.candidate_end
    or public.calculate_banese_nosso_numero(p_agencia, v_base)
      <> p_nosso_numero
  then
    raise exception 'Nosso Numero recuperado fora do conjunto auditado.';
  end if;
  if exists (
    select 1 from public.contas_receber as other_receivable
    where other_receivable.id <> p_receivable_id
      and other_receivable.gateway_provider = 'banese_card'
      and other_receivable.gateway_environment = p_environment
      and other_receivable.gateway_boleto_nosso_numero = p_nosso_numero
  ) or exists (
    select 1 from public.payment_gateway_transactions as transaction
    where transaction.provider_code = 'banese_card'
      and transaction.environment = p_environment
      and (
        transaction.remote_payment_id = p_nosso_numero
        or transaction.bank_slip_our_number = p_nosso_numero
      )
      and transaction.receivable_id is distinct from p_receivable_id
  ) then
    raise exception 'Nosso Numero recuperado ja pertence a outro recebivel.';
  end if;

  update public.contas_receber as receivable
  set gateway_boleto_nosso_numero = p_nosso_numero,
      gateway_boleto_convenio = p_convenio,
      gateway_boleto_agencia = p_agencia,
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.gateway_creation_token = p_expected_creation_token
    and receivable.gateway_status = 'CREATING'
    and coalesce(receivable.gateway_submission_status, '') <> 'API_AMBIGUOUS'
    and receivable.gateway_boleto_convenio = p_convenio
    and receivable.gateway_boleto_agencia = p_agencia
    and receivable.gateway_boleto_nosso_numero is null
    and receivable.gateway_boleto_codigo_barras is null
    and receivable.gateway_boleto_linha_digitavel is null
    and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
    and nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '') is null
    and receivable.gateway_boleto_issued_at is null
    and receivable.gateway_payment_id is null
    and receivable.gateway_payment_link_id is null
    and receivable.data_pagamento is null
    and receivable.valor_pago is null
    and receivable.gateway_settlement_recorded_at is null
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and not exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
    );
  if not found then
    raise exception 'Recebivel mudou durante a recuperacao Banese.';
  end if;
  update public.banese_boleto_recovery_targets as target
  set state = 'RECOVERED', recovered_nosso_numero = p_nosso_numero,
      scanned_at = pg_catalog.clock_timestamp(),
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where target.receivable_id = p_receivable_id;
  return jsonb_build_object(
    'nossoNumero', p_nosso_numero, 'convenio', p_convenio,
    'agencia', p_agencia, 'alreadyReserved', true,
    'bankRangeConfirmed', false, 'collisionPreflightEnabled', true
  );
end;
$function$;

create or replace function public.finish_banese_incident_recovery_scan(
  p_receivable_id uuid,
  p_environment text,
  p_convenio text,
  p_agencia text,
  p_expected_creation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reserved text;
  v_bank_range_confirmed boolean;
  v_collision_preflight_enabled boolean;
begin
  if p_environment not in ('sandbox', 'production')
    or p_convenio is null or p_convenio !~ '^[0-9]+$'
    or p_agencia is null or p_agencia !~ '^[0-9]{3}$' or p_agencia = '000'
    or p_expected_creation_token is null
  then
    raise exception 'Parametros invalidos para concluir varredura Banese.';
  end if;

  perform 1 from public.banese_boleto_recovery_targets as target
  where target.receivable_id = p_receivable_id
    and target.environment = p_environment
    and target.convenio = p_convenio
    and target.agencia = p_agencia
    and target.state = 'PENDING'
  for update;
  if not found then
    raise exception 'Varredura Banese nao esta pendente.';
  end if;
  perform 1 from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.gateway_creation_token = p_expected_creation_token
    and receivable.gateway_status = 'CREATING'
    and coalesce(receivable.gateway_submission_status, '') <> 'API_AMBIGUOUS'
    and receivable.gateway_boleto_convenio = p_convenio
    and receivable.gateway_boleto_agencia = p_agencia
    and receivable.gateway_boleto_nosso_numero is null
    and receivable.gateway_boleto_codigo_barras is null
    and receivable.gateway_boleto_linha_digitavel is null
    and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
    and nullif(btrim(coalesce(receivable.gateway_pix_encoded_image, '')), '') is null
    and receivable.gateway_boleto_issued_at is null
    and receivable.gateway_payment_id is null
    and receivable.gateway_payment_link_id is null
    and receivable.data_pagamento is null
    and receivable.valor_pago is null
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and not exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
    )
  for update;
  if not found then
    raise exception 'Recebivel mudou durante a varredura Banese.';
  end if;

  v_reserved := public.next_banese_nosso_numero(
    p_environment, p_convenio, p_agencia
  );
  update public.contas_receber as receivable
  set gateway_boleto_nosso_numero = v_reserved,
      gateway_boleto_convenio = p_convenio,
      gateway_boleto_agencia = p_agencia,
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = p_receivable_id;
  update public.banese_boleto_recovery_targets as target
  set state = 'EXHAUSTED', scanned_at = pg_catalog.clock_timestamp(),
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where target.receivable_id = p_receivable_id;
  select coalesce(sequence_row.bank_seed_confirmed, false),
    coalesce(sequence_row.collision_preflight_enabled, false)
  into v_bank_range_confirmed, v_collision_preflight_enabled
  from public.banese_boleto_sequences as sequence_row
  where sequence_row.environment = p_environment
    and sequence_row.convenio = p_convenio;
  return jsonb_build_object(
    'nossoNumero', v_reserved, 'convenio', p_convenio,
    'agencia', p_agencia, 'alreadyReserved', false,
    'bankRangeConfirmed', v_bank_range_confirmed,
    'collisionPreflightEnabled', v_collision_preflight_enabled
  );
end;
$function$;

revoke all on function public.claim_banese_incident_recovered_title(
  uuid, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.claim_banese_incident_recovered_title(
  uuid, text, text, text, text, uuid
) to service_role;
revoke all on function public.finish_banese_incident_recovery_scan(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.finish_banese_incident_recovery_scan(
  uuid, text, text, text, uuid
) to service_role;

revoke all on function public.reserve_banese_nosso_numero_for_receivable(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.reserve_banese_nosso_numero_for_receivable(
  uuid, text, text, text, uuid
) to service_role;

comment on table public.banese_boleto_recovery_targets is
  'Alvos sem identidade local cuja emissao bancaria anterior deve ser procurada antes de qualquer novo POST.';

commit;
