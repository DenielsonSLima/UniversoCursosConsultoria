begin;

alter table public.banese_boleto_sequences
  add column if not exists collision_preflight_enabled boolean not null default false,
  add column if not exists collision_preflight_floor bigint,
  add column if not exists collision_preflight_reference text,
  add column if not exists collision_preflight_enabled_at timestamptz;

alter table public.banese_boleto_sequences
  drop constraint if exists banese_boleto_sequences_collision_preflight_check,
  add constraint banese_boleto_sequences_collision_preflight_check check (
    (
      not collision_preflight_enabled
      and collision_preflight_floor is null
      and collision_preflight_reference is null
      and collision_preflight_enabled_at is null
    )
    or (
      collision_preflight_enabled
      and collision_preflight_floor between 0 and 99999998
      and last_number >= collision_preflight_floor
      and nullif(btrim(collision_preflight_reference), '') is not null
      and collision_preflight_enabled_at is not null
    )
  );

create table if not exists public.banese_boleto_collision_audit (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.contas_receber(id),
  environment text not null check (environment in ('sandbox', 'production')),
  convenio text not null check (convenio ~ '^[0-9]+$'),
  discarded_nosso_numero text not null check (discarded_nosso_numero ~ '^[0-9]{9}$'),
  replacement_nosso_numero text not null check (replacement_nosso_numero ~ '^[0-9]{9}$'),
  collision_stage text not null check (collision_stage in ('PREFLIGHT_GET', 'POST_DUPLICATE_GET')),
  response_fingerprint text not null check (response_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (receivable_id, discarded_nosso_numero)
);

alter table public.banese_boleto_collision_audit enable row level security;
revoke all on public.banese_boleto_collision_audit from public, anon, authenticated;
grant select, insert on public.banese_boleto_collision_audit to service_role;

create or replace function public.prevent_banese_sequence_regression()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.last_number < old.last_number then
    raise exception 'A sequencia de Nosso Numero Banese nao pode regredir.';
  end if;
  if old.bank_seed_confirmed and (
      not new.bank_seed_confirmed
      or new.bank_confirmed_seed < old.bank_confirmed_seed
      or new.bank_range_start < old.bank_range_start
      or new.bank_range_end < old.bank_range_end
    )
  then
    raise exception 'A faixa confirmada de Nosso Numero Banese nao pode regredir.';
  end if;
  if not old.bank_seed_confirmed
    and new.bank_seed_confirmed
    and new.last_number <> new.bank_confirmed_seed
  then
    raise exception 'A ativacao da faixa Banese deve iniciar no seed confirmado.';
  end if;
  if old.collision_preflight_enabled and (
      not new.collision_preflight_enabled
      or new.collision_preflight_floor < old.collision_preflight_floor
    )
  then
    raise exception 'O piso protegido por consulta Banese nao pode regredir.';
  end if;
  if not old.collision_preflight_enabled
    and new.collision_preflight_enabled
    and new.last_number < new.collision_preflight_floor
  then
    raise exception 'A consulta preventiva Banese deve iniciar no piso comprovado.';
  end if;
  return new;
end;
$function$;

create or replace function public.next_banese_nosso_numero(
  p_environment text,
  p_convenio text,
  p_agencia text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_number bigint;
  v_base text;
  v_sum integer := 0;
  v_position integer;
  v_weight integer := 2;
  v_remainder integer;
  v_digit integer;
begin
  if p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente Banese invalido.';
  end if;
  if p_convenio is null or p_convenio !~ '^[0-9]+$' then
    raise exception 'Convenio Banese invalido.';
  end if;
  if p_agencia is null or p_agencia !~ '^[0-9]{3}$' or p_agencia = '000' then
    raise exception 'Agencia Banese invalida.';
  end if;

  if p_environment = 'production' then
    update public.banese_boleto_sequences as sequence_row
    set last_number = sequence_row.last_number + 1,
        updated_at = pg_catalog.clock_timestamp()
    where sequence_row.environment = p_environment
      and sequence_row.convenio = p_convenio
      and sequence_row.last_number < 99999999
      and (
        (
          sequence_row.bank_seed_confirmed
          and sequence_row.bank_range_start is not null
          and sequence_row.bank_range_end is not null
          and sequence_row.last_number >= sequence_row.bank_confirmed_seed
          and sequence_row.last_number < sequence_row.bank_range_end
          and sequence_row.last_number + 1 >= sequence_row.bank_range_start
        )
        or (
          sequence_row.collision_preflight_enabled
          and sequence_row.collision_preflight_floor is not null
          and sequence_row.last_number >= sequence_row.collision_preflight_floor
        )
      )
    returning sequence_row.last_number into v_number;

    if v_number is null then
      raise exception 'Sequencia Banese de producao sem alocacao segura ativa.';
    end if;
  else
    insert into public.banese_boleto_sequences as sequence_row (
      environment, convenio, last_number, updated_at
    ) values (
      p_environment, p_convenio, 1, pg_catalog.clock_timestamp()
    )
    on conflict (environment, convenio) do update
    set last_number = sequence_row.last_number + 1,
        updated_at = pg_catalog.clock_timestamp()
    where sequence_row.last_number < 99999999
    returning sequence_row.last_number into v_number;
    if v_number is null then
      raise exception 'A sequencia de Nosso Numero Banese foi esgotada.';
    end if;
  end if;

  v_base := p_agencia || pg_catalog.lpad(v_number::text, 8, '0');
  for v_position in reverse pg_catalog.length(v_base)..1 loop
    v_sum := v_sum
      + pg_catalog.substring(v_base, v_position, 1)::integer * v_weight;
    v_weight := case when v_weight = 9 then 2 else v_weight + 1 end;
  end loop;
  v_remainder := pg_catalog.mod(v_sum, 11);
  v_digit := case when v_remainder in (0, 1) then 0 else 11 - v_remainder end;
  return pg_catalog.lpad(v_number::text, 8, '0') || v_digit::text;
end;
$function$;

create or replace function public.calculate_banese_nosso_numero(
  p_agencia text,
  p_number bigint
)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $function$
declare
  v_base text;
  v_sum integer := 0;
  v_position integer;
  v_weight integer := 2;
  v_remainder integer;
  v_digit integer;
begin
  if p_agencia !~ '^[0-9]{3}$' or p_agencia = '000'
    or p_number not between 1 and 99999999
  then
    raise exception 'Base de Nosso Numero Banese invalida.';
  end if;
  v_base := p_agencia || pg_catalog.lpad(p_number::text, 8, '0');
  for v_position in reverse pg_catalog.length(v_base)..1 loop
    v_sum := v_sum
      + pg_catalog.substring(v_base, v_position, 1)::integer * v_weight;
    v_weight := case when v_weight = 9 then 2 else v_weight + 1 end;
  end loop;
  v_remainder := pg_catalog.mod(v_sum, 11);
  v_digit := case when v_remainder in (0, 1) then 0 else 11 - v_remainder end;
  return pg_catalog.lpad(p_number::text, 8, '0') || v_digit::text;
end;
$function$;
revoke all on function public.calculate_banese_nosso_numero(text, bigint)
  from public, anon, authenticated;
grant execute on function public.calculate_banese_nosso_numero(text, bigint)
  to service_role;

drop function if exists public.reserve_banese_nosso_numero_for_receivable(
  uuid, text, text, text
);

create function public.reserve_banese_nosso_numero_for_receivable(
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

revoke all on function public.reserve_banese_nosso_numero_for_receivable(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.reserve_banese_nosso_numero_for_receivable(
  uuid, text, text, text, uuid
) to service_role;

create or replace function public.advance_banese_nosso_numero_after_collision(
  p_receivable_id uuid,
  p_environment text,
  p_convenio text,
  p_agencia text,
  p_expected_nosso_numero text,
  p_collision_stage text,
  p_response_fingerprint text,
  p_expected_creation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_replacement text;
  v_bank_range_confirmed boolean;
  v_collision_preflight_enabled boolean;
begin
  if p_collision_stage not in ('PREFLIGHT_GET', 'POST_DUPLICATE_GET')
    or p_environment not in ('sandbox', 'production')
    or p_convenio is null or p_convenio !~ '^[0-9]+$'
    or p_agencia is null or p_agencia !~ '^[0-9]{3}$' or p_agencia = '000'
    or p_expected_nosso_numero !~ '^[0-9]{9}$'
    or p_response_fingerprint !~ '^[0-9a-f]{64}$'
    or p_expected_creation_token is null
  then
    raise exception 'Prova de colisao Banese invalida.';
  end if;

  perform 1 from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.gateway_creation_token = p_expected_creation_token
    and receivable.gateway_boleto_nosso_numero = p_expected_nosso_numero
    and receivable.gateway_boleto_convenio = p_convenio
    and receivable.gateway_boleto_agencia = p_agencia
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
    and receivable.gateway_settlement_recorded_at is null
    and receivable.status in ('PENDENTE', 'VENCIDO')
    and not exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
    )
  for update;
  if not found then
    raise exception 'Recebivel Banese mudou antes do descarte da colisao.';
  end if;

  select coalesce(sequence_row.bank_seed_confirmed, false),
    coalesce(sequence_row.collision_preflight_enabled, false)
  into v_bank_range_confirmed, v_collision_preflight_enabled
  from public.banese_boleto_sequences as sequence_row
  where sequence_row.environment = p_environment
    and sequence_row.convenio = p_convenio;
  if not coalesce(v_bank_range_confirmed, false)
    and not coalesce(v_collision_preflight_enabled, false)
  then
    raise exception 'Alocacao segura Banese indisponivel.';
  end if;

  v_replacement := public.next_banese_nosso_numero(
    p_environment, p_convenio, p_agencia
  );
  update public.contas_receber as receivable
  set gateway_boleto_nosso_numero = v_replacement,
      gateway_boleto_convenio = p_convenio,
      gateway_boleto_agencia = p_agencia,
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = p_receivable_id;

  insert into public.banese_boleto_collision_audit (
    receivable_id, environment, convenio, discarded_nosso_numero,
    replacement_nosso_numero, collision_stage, response_fingerprint
  ) values (
    p_receivable_id, p_environment, p_convenio, p_expected_nosso_numero,
    v_replacement, p_collision_stage, p_response_fingerprint
  );
  return jsonb_build_object(
    'nossoNumero', v_replacement, 'convenio', p_convenio,
    'agencia', p_agencia, 'alreadyReserved', false,
    'bankRangeConfirmed', v_bank_range_confirmed,
    'collisionPreflightEnabled', v_collision_preflight_enabled
  );
end;
$function$;

revoke all on function public.advance_banese_nosso_numero_after_collision(
  uuid, text, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.advance_banese_nosso_numero_after_collision(
  uuid, text, text, text, text, text, text, uuid
) to service_role;

do $block$
declare
  v_floor bigint;
begin
  select max(left(receivable.gateway_boleto_nosso_numero, 8)::bigint)
  into v_floor
  from public.contas_receber as receivable
  where receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = 'production'
    and receivable.gateway_boleto_issued_at is not null
    and receivable.gateway_submission_status = 'API_REGISTERED'
    and receivable.gateway_boleto_nosso_numero ~ '^[0-9]{9}$'
    and exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
        and transaction.provider_code = 'banese_card'
        and transaction.environment = 'production'
        and transaction.remote_payment_id = receivable.gateway_boleto_nosso_numero
        and transaction.bank_slip_our_number = receivable.gateway_boleto_nosso_numero
    );
  if v_floor is null or v_floor < 9715 then
    raise exception 'Piso comprovado da sequencia Banese nao foi encontrado.';
  end if;
  update public.banese_boleto_sequences as sequence_row
  set last_number = greatest(sequence_row.last_number, v_floor),
      collision_preflight_enabled = true,
      collision_preflight_floor = v_floor,
      collision_preflight_reference =
        'INC-2026-08-28: GET por Nosso Numero + recuperacao de duplicidade',
      collision_preflight_enabled_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where sequence_row.environment = 'production'
    and sequence_row.convenio = '15261';
  if not found then
    raise exception 'Sequencia Banese de producao nao encontrada.';
  end if;
end;
$block$;

comment on column public.banese_boleto_sequences.collision_preflight_enabled is
  'Permite alocacao compartilhada somente com GET previo e recuperacao segura de duplicidade.';
comment on table public.banese_boleto_collision_audit is
  'Auditoria sem PII dos Nossos Numeros descartados apos colisao remota comprovada.';

commit;
