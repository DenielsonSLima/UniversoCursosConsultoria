begin;

alter table public.contas_receber
  add column if not exists gateway_settlement_channel text,
  add column if not exists gateway_settlement_source text,
  add column if not exists gateway_settlement_evidence jsonb,
  add column if not exists gateway_settlement_recorded_at timestamptz;

alter table public.contas_receber
  drop constraint if exists contas_receber_gateway_settlement_channel_check,
  add constraint contas_receber_gateway_settlement_channel_check
    check (
      gateway_settlement_channel is null
      or gateway_settlement_channel in (
        'PIX',
        'BOLETO',
        'NAO_IDENTIFICADO',
        'MISTO'
      )
    ),
  drop constraint if exists contas_receber_gateway_settlement_source_check,
  add constraint contas_receber_gateway_settlement_source_check
    check (
      gateway_settlement_source is null
      or gateway_settlement_source in ('API', 'CNAB240', 'MANUAL')
    ),
  drop constraint if exists contas_receber_gateway_settlement_evidence_object,
  add constraint contas_receber_gateway_settlement_evidence_object
    check (
      gateway_settlement_evidence is null
      or jsonb_typeof(gateway_settlement_evidence) = 'object'
    );

comment on column public.contas_receber.gateway_settlement_channel is
  'Canal efetivo da liquidação, separado do produto bancário emitido em gateway_payment_method.';
comment on column public.contas_receber.gateway_settlement_source is
  'Fonte da evidência usada para classificar o canal: API, CNAB240 ou correção manual auditada.';
comment on column public.contas_receber.gateway_settlement_evidence is
  'Resumo estruturado da evidência canônica; não deve conter segredo bancário.';
comment on column public.contas_receber.gateway_settlement_recorded_at is
  'Instante em que a classificação do canal foi gravada.';

create or replace function public.protect_receivable_settlement_evidence_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if v_trusted_writer then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.gateway_settlement_channel is not null
       or new.gateway_settlement_source is not null
       or new.gateway_settlement_evidence is not null
       or new.gateway_settlement_recorded_at is not null then
      raise exception using
        errcode = '42501',
        message = 'A evidência do canal de liquidação somente pode ser gravada pelo servidor.';
    end if;
    return new;
  end if;

  if row(
    new.gateway_settlement_channel,
    new.gateway_settlement_source,
    new.gateway_settlement_evidence,
    new.gateway_settlement_recorded_at
  ) is distinct from row(
    old.gateway_settlement_channel,
    old.gateway_settlement_source,
    old.gateway_settlement_evidence,
    old.gateway_settlement_recorded_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'A evidência do canal de liquidação somente pode ser alterada pelo servidor.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_receivable_settlement_evidence_fields()
  from public, anon, authenticated;
grant execute on function public.protect_receivable_settlement_evidence_fields()
  to service_role;

drop trigger if exists protect_receivable_settlement_evidence_fields
  on public.contas_receber;
create trigger protect_receivable_settlement_evidence_fields
before insert or update on public.contas_receber
for each row
execute function public.protect_receivable_settlement_evidence_fields();

create or replace function public.protect_receivable_contract_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
  v_has_issued_title boolean :=
    old.gateway_payment_id is not null
    or old.gateway_boleto_nosso_numero is not null
    or old.gateway_creation_token is not null
    or upper(coalesce(old.status, '')) = 'PAGO';
begin
  if v_trusted_writer then
    return new;
  end if;

  if v_has_issued_title
     and (
       new.valor is distinct from old.valor
       or new.data_vencimento is distinct from old.data_vencimento
     ) then
    raise exception using
      errcode = '42501',
      message = 'Valor e vencimento de cobrança emitida ou paga são imutáveis.';
  end if;

  if upper(coalesce(old.status, '')) = 'PAGO'
     and row(
       new.valor_pago,
       new.data_pagamento,
       new.forma_pagamento,
       new.origem_pagamento
     ) is distinct from row(
       old.valor_pago,
       old.data_pagamento,
       old.forma_pagamento,
       old.origem_pagamento
     ) then
    raise exception using
      errcode = '42501',
      message = 'A liquidação confirmada somente pode ser corrigida por fluxo interno auditado.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_receivable_contract_snapshot()
  from public, anon, authenticated;
grant execute on function public.protect_receivable_contract_snapshot()
  to service_role;

drop trigger if exists protect_receivable_contract_snapshot
  on public.contas_receber;
create trigger protect_receivable_contract_snapshot
before update on public.contas_receber
for each row
execute function public.protect_receivable_contract_snapshot();

create or replace function public.prevent_gateway_transaction_amount_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount is distinct from old.amount then
    raise exception using
      errcode = '55000',
      message = 'O valor da transação de gateway é imutável.';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_gateway_transaction_amount_change()
  from public, anon, authenticated;
grant execute on function public.prevent_gateway_transaction_amount_change()
  to service_role;

drop trigger if exists prevent_gateway_transaction_amount_change
  on public.payment_gateway_transactions;
create trigger prevent_gateway_transaction_amount_change
before update on public.payment_gateway_transactions
for each row
execute function public.prevent_gateway_transaction_amount_change();

create or replace function public.enforce_online_inscription_receivable_value()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_receivable_value numeric;
begin
  if new.receivable_id is null then
    return new;
  end if;

  select receivable.valor
    into v_receivable_value
  from public.contas_receber receivable
  where receivable.id = new.receivable_id;

  if not found then
    return new;
  end if;

  if round(coalesce(new.valor, 0)::numeric, 2)
     is distinct from round(coalesce(v_receivable_value, 0)::numeric, 2) then
    raise exception using
      errcode = '23514',
      message = 'O valor da inscrição deve corresponder ao snapshot da cobrança.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_online_inscription_receivable_value()
  from public, anon, authenticated;
grant execute on function public.enforce_online_inscription_receivable_value()
  to service_role;

drop trigger if exists enforce_online_inscription_receivable_value
  on public.inscricoes_online;
create trigger enforce_online_inscription_receivable_value
before insert or update of receivable_id, valor on public.inscricoes_online
for each row
execute function public.enforce_online_inscription_receivable_value();

update public.contas_receber
set
  gateway_settlement_channel = 'NAO_IDENTIFICADO',
  gateway_settlement_source = 'API',
  gateway_settlement_evidence = jsonb_build_object(
    'classification', 'NAO_IDENTIFICADO',
    'reason', 'API_PAYMENT_RESPONSE_WITHOUT_SETTLEMENT_CHANNEL',
    'documentedFields', jsonb_build_array(
      'BancoRecebedor',
      'DataPagamento',
      'ValorPago'
    )
  ),
  gateway_settlement_recorded_at = coalesce(gateway_synced_at, now()),
  updated_at = now()
where gateway_provider = 'banese_card'
  and gateway_environment = 'production'
  and gateway_payment_method = 'BOLETO'
  and gateway_payment_id = '000000074'
  and status = 'PAGO'
  and valor = 14.90
  and gateway_settlement_channel is null;

create or replace function public.get_receivables_modality_page_secure(
  p_modality text,
  p_polo_id uuid default null,
  p_search text default null,
  p_due_start date default null,
  p_due_end date default null,
  p_status_scope text default 'pending',
  p_group_mode text default 'none',
  p_group_key text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_rows jsonb;
begin
  if auth.role() <> 'service_role'
     and not (
       (p_polo_id is null and public.is_gestor_global())
       or (p_polo_id is not null and public.is_gestor_for_polo(p_polo_id))
     ) then
    raise exception 'Acesso financeiro fora do escopo autorizado.'
      using errcode = '42501';
  end if;

  v_payload := public.get_receivables_modality_page(
    p_modality,
    p_polo_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_group_mode,
    p_group_key,
    p_page,
    p_page_size
  );

  select coalesce(
    jsonb_agg(
      entry.row_data || jsonb_build_object(
        'gateway_provider', receivable.gateway_provider,
        'gateway_environment', receivable.gateway_environment,
        'gateway_payment_method', receivable.gateway_payment_method,
        'gateway_settlement_channel', receivable.gateway_settlement_channel,
        'gateway_settlement_source', receivable.gateway_settlement_source
      )
      order by entry.position
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_payload -> 'rows', '[]'::jsonb))
       with ordinality as entry(row_data, position)
  left join public.contas_receber as receivable
    on receivable.id = (entry.row_data ->> 'id')::uuid;

  return jsonb_set(v_payload, '{rows}', v_rows, true);
end;
$$;

revoke all on function public.get_receivables_modality_page_secure(
  text, uuid, text, date, date, text, text, text, integer, integer
) from public, anon;

grant execute on function public.get_receivables_modality_page_secure(
  text, uuid, text, date, date, text, text, text, integer, integer
) to authenticated, service_role;

commit;
