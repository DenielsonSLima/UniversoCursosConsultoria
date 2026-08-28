begin;
-- A sequencia local nao prova disponibilidade no Banese. Em producao, uma
-- confirmacao explicita do banco passa a ser pre-condicao para toda reserva.
alter table public.banese_boleto_sequences
  add column bank_seed_confirmed boolean not null default false,
  add column bank_confirmed_seed bigint, add column bank_range_start bigint,
  add column bank_range_end bigint,
  add column bank_confirmation_reference text,
  add column bank_confirmed_at timestamptz,
  add constraint banese_boleto_sequences_bank_seed_check check (
    (
      not bank_seed_confirmed
      and bank_confirmed_seed is null
      and bank_range_start is null
      and bank_range_end is null
      and bank_confirmation_reference is null
      and bank_confirmed_at is null
    )
    or (
      bank_seed_confirmed
      and bank_confirmed_seed between 0 and 99999999
      and last_number >= bank_confirmed_seed
      and bank_confirmed_at is not null
      and nullif(btrim(bank_confirmation_reference), '') is not null
      and bank_range_start between 1 and 99999999
      and bank_range_end between bank_range_start and 99999999
      and bank_confirmed_seed = bank_range_start - 1
      and last_number <= bank_range_end
    )
  );

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
  return new;
end;
$function$;
revoke all on function public.prevent_banese_sequence_regression() from public, anon, authenticated;
grant execute on function public.prevent_banese_sequence_regression() to service_role;
drop trigger if exists prevent_banese_sequence_regression
  on public.banese_boleto_sequences;
create trigger prevent_banese_sequence_regression
before update of last_number, bank_seed_confirmed, bank_confirmed_seed,
  bank_range_start, bank_range_end on public.banese_boleto_sequences
for each row execute function public.prevent_banese_sequence_regression();
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
  if p_agencia is null or p_agencia !~ '^[0-9]{3}$'
      or p_agencia = '000' then
    raise exception 'Agencia Banese invalida.';
  end if;
  if p_environment = 'production' then
    update public.banese_boleto_sequences as sequence_row
    set last_number = sequence_row.last_number + 1,
        updated_at = pg_catalog.clock_timestamp()
    where sequence_row.environment = p_environment
      and sequence_row.convenio = p_convenio
      and sequence_row.bank_seed_confirmed
      and sequence_row.bank_confirmed_seed is not null
      and sequence_row.bank_range_start is not null
      and sequence_row.bank_range_end is not null
      and sequence_row.last_number >= sequence_row.bank_confirmed_seed
      and sequence_row.last_number < sequence_row.bank_range_end
      and sequence_row.last_number + 1 >= sequence_row.bank_range_start
    returning sequence_row.last_number into v_number;

    if v_number is null then
      if not exists (
        select 1
        from public.banese_boleto_sequences as sequence_row
        where sequence_row.environment = p_environment
          and sequence_row.convenio = p_convenio
          and sequence_row.bank_seed_confirmed
          and sequence_row.bank_range_start is not null
          and sequence_row.bank_range_end is not null
      ) then
        raise exception
          'Sequencia Banese de producao sem faixa exclusiva confirmada pelo banco.';
      end if;
      raise exception 'A faixa confirmada de Nosso Numero Banese foi esgotada.';
    end if;
  else
    insert into public.banese_boleto_sequences as sequence_row (
      environment,
      convenio,
      last_number,
      updated_at
    )
    values (p_environment, p_convenio, 1, pg_catalog.clock_timestamp())
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
  v_digit := case
    when v_remainder in (0, 1) then 0
    else 11 - v_remainder
  end;

  return pg_catalog.lpad(v_number::text, 8, '0') || v_digit::text;
end;
$function$;
revoke all on function public.next_banese_nosso_numero(text, text, text) from public, anon, authenticated;
grant execute on function public.next_banese_nosso_numero(text, text, text) to service_role;
comment on function public.next_banese_nosso_numero(text, text, text) is
  'Reserva Nosso Numero atomicamente; producao exige faixa exclusiva confirmada pelo Banese e nunca inicia em 1 implicitamente.';

create or replace function public.reserve_banese_nosso_numero_for_receivable(
  p_receivable_id uuid,
  p_environment text,
  p_convenio text,
  p_agencia text
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
begin
  if p_environment not in ('sandbox', 'production')
    or p_convenio is null or p_convenio !~ '^[0-9]+$'
    or p_agencia is null or p_agencia !~ '^[0-9]{3}$'
    or p_agencia = '000'
  then
    raise exception 'Parametros invalidos para reservar Nosso Numero Banese.';
  end if;

  select receivable.gateway_boleto_nosso_numero,
    receivable.gateway_boleto_convenio,
    receivable.gateway_boleto_agencia
  into v_existing, v_convenio, v_agencia
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = p_environment
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.status <> 'PAGO'
  for update;

  if not found then
    raise exception 'Recebivel Banese indisponivel para reserva do Nosso Numero.';
  end if;

  if v_existing is not null then
    if v_convenio is null or v_agencia is null then
      v_convenio := p_convenio;
      v_agencia := p_agencia;
      update public.contas_receber as receivable
      set gateway_boleto_convenio = v_convenio,
          gateway_boleto_agencia = v_agencia,
          updated_at = pg_catalog.clock_timestamp()
      where receivable.id = p_receivable_id;
    end if;
    if p_environment = 'production' then
      select coalesce(
        sequence_row.bank_seed_confirmed
        and sequence_row.bank_range_start is not null
        and sequence_row.bank_range_end is not null
        and sequence_row.last_number >= sequence_row.bank_confirmed_seed
        and sequence_row.last_number <= sequence_row.bank_range_end
        and case when v_existing ~ '^[0-9]{9}$' then
          left(v_existing, 8)::bigint between
            sequence_row.bank_range_start and sequence_row.last_number
        else false end,
        false
      )
      into v_bank_range_confirmed
      from public.banese_boleto_sequences as sequence_row
      where sequence_row.environment = p_environment
        and sequence_row.convenio = v_convenio;
      v_bank_range_confirmed := coalesce(v_bank_range_confirmed, false);
    end if;
    return jsonb_build_object(
      'nossoNumero', v_existing,
      'convenio', v_convenio,
      'agencia', v_agencia,
      'alreadyReserved', true,
      'bankRangeConfirmed', v_bank_range_confirmed
    );
  end if;

  v_reserved := public.next_banese_nosso_numero(
    p_environment,
    p_convenio,
    p_agencia
  );
  update public.contas_receber as receivable
  set gateway_boleto_nosso_numero = v_reserved,
      gateway_boleto_convenio = p_convenio,
      gateway_boleto_agencia = p_agencia,
      updated_at = pg_catalog.clock_timestamp()
  where receivable.id = p_receivable_id;

  return jsonb_build_object(
    'nossoNumero', v_reserved,
    'convenio', p_convenio,
    'agencia', p_agencia,
    'alreadyReserved', false,
    'bankRangeConfirmed', true
  );
end;
$function$;
revoke all on function public.reserve_banese_nosso_numero_for_receivable(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.reserve_banese_nosso_numero_for_receivable(uuid,text,text,text)
  to service_role;

commit;
