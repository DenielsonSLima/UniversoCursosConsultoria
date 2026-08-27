-- Cancela no Banese somente títulos futuros após encerramento acadêmico.
-- A outbox evita declarar o recebível cancelado antes da confirmação remota.

create table if not exists public.banese_cancellation_outbox (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null unique
    references public.contas_receber(id) on delete restrict,
  matricula_id uuid not null
    references public.matriculas(id) on delete restrict,
  movement_id uuid
    references public.matricula_movimentacoes(id) on delete restrict,
  environment text not null check (environment in ('sandbox', 'production')),
  effective_date date not null,
  reason text not null check (reason in (
    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  )),
  state text not null default 'PENDING' check (state in (
    'PENDING', 'PROCESSING', 'RETRY', 'REVIEW_REQUIRED', 'DONE'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  snapshot_convenio text,
  snapshot_nosso_numero text,
  snapshot_payment_id text,
  snapshot_transaction_id uuid,
  snapshot_due_date date,
  snapshot_receivable_status text,
  snapshot_gateway_status text,
  snapshot_transaction_status text,
  snapshot_receivable_updated_at timestamptz,
  remote_attempt_started_at timestamptz,
  remote_status text,
  already_canceled boolean,
  error_class text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint banese_cancellation_outbox_lease_check check (
    (state = 'PROCESSING' and lease_token is not null and lease_until is not null)
    or (state <> 'PROCESSING' and lease_token is null and lease_until is null)
  ),
  constraint banese_cancellation_outbox_snapshot_check check (
    state <> 'PROCESSING' or (
      snapshot_convenio is not null
      and snapshot_nosso_numero is not null
      and snapshot_payment_id is not null
      and snapshot_transaction_id is not null
      and snapshot_due_date is not null
      and snapshot_receivable_status is not null
      and snapshot_gateway_status is not null
      and snapshot_transaction_status is not null
      and snapshot_receivable_updated_at is not null
    )
  )
);

create index if not exists banese_cancellation_outbox_claim_idx
  on public.banese_cancellation_outbox(next_attempt_at, created_at)
  where state in ('PENDING', 'RETRY', 'PROCESSING');

alter table public.banese_cancellation_outbox enable row level security;
revoke all on table public.banese_cancellation_outbox
  from public, anon, authenticated;
grant select, insert, update on table public.banese_cancellation_outbox
  to service_role;

create or replace function public.enqueue_banese_cancellation(
  p_receivable_id uuid,
  p_movement_id uuid,
  p_effective_date date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason not in (
    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then
    return;
  end if;

  insert into public.banese_cancellation_outbox (
    receivable_id,
    matricula_id,
    movement_id,
    environment,
    effective_date,
    reason
  )
  select
    c.id,
    c.matricula_id,
    p_movement_id,
    c.gateway_environment,
    p_effective_date,
    p_reason
  from public.contas_receber c
  where c.id = p_receivable_id
    and c.matricula_id is not null
    and c.status = 'PENDENTE'
    and c.data_pagamento is null
    and c.data_vencimento > p_effective_date
    and c.data_vencimento > (now() at time zone 'America/Maceio')::date
    and c.gateway_provider = 'banese_card'
    and c.gateway_environment in ('sandbox', 'production')
    and c.gateway_payment_method = 'BOLETO'
    and upper(coalesce(c.gateway_status, '')) in ('PENDING', 'REGISTERED')
  on conflict (receivable_id) do update
  set movement_id = excluded.movement_id,
      effective_date = excluded.effective_date,
      reason = excluded.reason,
      environment = excluded.environment,
      state = 'PENDING',
      next_attempt_at = now(),
      lease_token = null,
      lease_until = null,
      snapshot_convenio = null,
      snapshot_nosso_numero = null,
      snapshot_payment_id = null,
      snapshot_transaction_id = null,
      snapshot_due_date = null,
      snapshot_receivable_status = null,
      snapshot_gateway_status = null,
      snapshot_transaction_status = null,
      snapshot_receivable_updated_at = null,
      remote_attempt_started_at = null,
      remote_status = null,
      already_canceled = null,
      error_class = null,
      error_message = null,
      completed_at = null,
      updated_at = now()
  where public.banese_cancellation_outbox.state in ('PENDING', 'RETRY')
     or (
       public.banese_cancellation_outbox.state = 'DONE'
       and public.banese_cancellation_outbox.remote_status = 'SKIPPED_REACTIVATED'
     );
end;
$$;

revoke all on function public.enqueue_banese_cancellation(uuid, uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_banese_cancellation(uuid, uuid, date, text)
  to service_role;

create or replace function public.enqueue_banese_cancellation_from_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'REATIVACAO' then
    if exists (
      select 1 from public.banese_cancellation_outbox j
      where j.matricula_id = new.matricula_id
        and j.state in ('PROCESSING', 'REVIEW_REQUIRED')
    ) then
      raise exception
        'Cancelamento bancário em andamento ou em revisão; regularize antes de reativar.';
    end if;

    update public.banese_cancellation_outbox
    set state = 'DONE',
        remote_status = 'SKIPPED_REACTIVATED',
        error_class = null,
        error_message = null,
        lease_token = null,
        lease_until = null,
        remote_attempt_started_at = null,
        completed_at = now(),
        updated_at = now()
    where matricula_id = new.matricula_id
      and state in ('PENDING', 'RETRY');
  elsif new.tipo in (
    'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then
    perform public.enqueue_banese_cancellation(
      c.id,
      new.id,
      new.data_movimentacao,
      new.tipo
    )
    from public.contas_receber c
    where c.matricula_id = new.matricula_id;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_banese_cancellation_from_movement()
  from public, anon, authenticated;

drop trigger if exists enqueue_banese_cancellation_from_movement_trigger
  on public.matricula_movimentacoes;
create trigger enqueue_banese_cancellation_from_movement_trigger
after insert on public.matricula_movimentacoes
for each row execute function public.enqueue_banese_cancellation_from_movement();

create or replace function public.enqueue_late_banese_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.matricula_movimentacoes%rowtype;
begin
  if new.matricula_id is null
     or new.status is distinct from 'PENDENTE'
     or new.data_pagamento is not null
     or new.gateway_provider is distinct from 'banese_card'
     or new.gateway_payment_method is distinct from 'BOLETO' then
    return new;
  end if;

  select latest.* into v_movement
  from public.matriculas m
  cross join lateral (
    select mm.*
    from public.matricula_movimentacoes mm
    where mm.matricula_id = m.id
      and mm.tipo in (
        'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
      )
      and mm.status_novo = m.status
    order by mm.created_at desc, mm.id desc
    limit 1
  ) latest
  where m.id = new.matricula_id
    and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO');

  if found then
    perform public.enqueue_banese_cancellation(
      new.id,
      v_movement.id,
      v_movement.data_movimentacao,
      v_movement.tipo
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_late_banese_cancellation()
  from public, anon, authenticated;

drop trigger if exists enqueue_late_banese_cancellation_trigger
  on public.contas_receber;
create trigger enqueue_late_banese_cancellation_trigger
after insert or update of
  matricula_id, status, data_vencimento, data_pagamento, gateway_provider,
  gateway_environment, gateway_payment_method, gateway_payment_id,
  gateway_boleto_nosso_numero, gateway_boleto_convenio, gateway_status,
  gateway_submission_channel, gateway_submission_status,
  gateway_cnab_file_id, manual_settlement_id
on public.contas_receber
for each row execute function public.enqueue_late_banese_cancellation();

create or replace function public.ajustar_financeiro_movimentacao_matricula()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'TRANCAMENTO' then
    update public.contas_receber
    set status = 'SUSPENSO', updated_at = now()
    where matricula_id = new.matricula_id
      and status in ('PENDENTE', 'VENCIDO')
      and data_vencimento > new.data_movimentacao;
  elsif new.tipo = 'REATIVACAO' then
    update public.contas_receber
    set status = case
          when data_vencimento < current_date then 'VENCIDO'
          else 'PENDENTE'
        end,
        updated_at = now()
    where matricula_id = new.matricula_id
      and status = 'SUSPENSO';
  elsif new.tipo in (
    'CANCELAMENTO', 'DESISTENCIA', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then
    if exists (
      select 1
      from public.matriculas m
      where m.id = new.matricula_id
        and (
          m.gerar_cobranca_futura is distinct from false
          or m.sincronizar_asaas is distinct from false
        )
    ) then
      perform internal_academic.authorize_matricula_control_update(
        new.matricula_id
      );
      update public.matriculas
      set gerar_cobranca_futura = false,
          sincronizar_asaas = false
      where id = new.matricula_id;
    end if;

    update public.contas_receber
    set status = 'CANCELADO', updated_at = now()
    where matricula_id = new.matricula_id
      and status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      and data_vencimento > new.data_movimentacao
      and (
        gateway_provider is distinct from 'banese_card'
        or gateway_payment_method is distinct from 'BOLETO'
        or upper(coalesce(gateway_status, '')) in (
          'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
        )
      );
  end if;
  return new;
end;
$$;

comment on table public.banese_cancellation_outbox is
  'Outbox privada e idempotente para baixa Banese após encerramento acadêmico.';
