-- Encerramentos acadêmicos cancelam todo título não pago, vencido ou não.
-- Títulos Banese permanecem abertos localmente até a confirmação remota.

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
    and c.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and c.data_pagamento is null
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
       and public.banese_cancellation_outbox.remote_status =
         'SKIPPED_REACTIVATED'
     );
end;
$$;

revoke all on function public.enqueue_banese_cancellation(
  uuid, uuid, date, text
) from public, anon, authenticated;
grant execute on function public.enqueue_banese_cancellation(
  uuid, uuid, date, text
) to service_role;

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
     or new.status not in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
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

create or replace function public.cancel_late_terminal_local_receivable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.matricula_id is null
     or new.status not in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
     or new.data_pagamento is not null
     or new.gateway_provider is not null
     or new.gateway_payment_id is not null
     or new.gateway_payment_link_id is not null
     or new.gateway_installment_id is not null
     or new.gateway_boleto_nosso_numero is not null
     or new.gateway_cnab_file_id is not null
     or new.asaas_payment_id is not null
     or new.asaas_payment_link_id is not null
     or new.asaas_installment_id is not null
     or new.manual_settlement_id is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.matriculas m
    where m.id = new.matricula_id
      and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
      and exists (
        select 1
        from public.matricula_movimentacoes mm
        where mm.matricula_id = m.id
          and mm.tipo in (
            'DESISTENCIA', 'CANCELAMENTO',
            'TRANSFERENCIA_EXTERNA_ENVIADA'
          )
          and mm.status_novo = m.status
      )
  ) and not exists (
    select 1
    from public.payment_gateway_transactions t
    where t.receivable_id = new.id
  ) then
    new.status := 'CANCELADO';
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.cancel_late_terminal_local_receivable()
  from public, anon, authenticated;

drop trigger if exists cancel_late_terminal_local_receivable_trigger
  on public.contas_receber;
create trigger cancel_late_terminal_local_receivable_trigger
before insert or update of
  matricula_id, status, data_pagamento, gateway_provider,
  gateway_payment_id, gateway_payment_link_id, gateway_installment_id,
  gateway_boleto_nosso_numero, gateway_cnab_file_id,
  asaas_payment_id, asaas_payment_link_id, asaas_installment_id,
  manual_settlement_id
on public.contas_receber
for each row execute function public.cancel_late_terminal_local_receivable();

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
      and (
        (
          data_vencimento > new.data_movimentacao
          and (
            gateway_provider is distinct from 'banese_card'
            or gateway_payment_method is distinct from 'BOLETO'
            or upper(coalesce(gateway_status, '')) in (
              'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
            )
          )
        )
        or (
          gateway_provider is null
          and gateway_payment_id is null
          and gateway_payment_link_id is null
          and gateway_installment_id is null
          and gateway_boleto_nosso_numero is null
          and gateway_cnab_file_id is null
          and asaas_payment_id is null
          and asaas_payment_link_id is null
          and asaas_installment_id is null
          and manual_settlement_id is null
          and not exists (
            select 1
            from public.payment_gateway_transactions t
            where t.receivable_id = public.contas_receber.id
          )
        )
      );
  end if;
  return new;
end;
$$;

create or replace function public.cancel_terminal_local_receivable(
  p_receivable_id uuid,
  p_movement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receivable public.contas_receber%rowtype;
  v_status text;
  v_movement public.matricula_movimentacoes%rowtype;
  v_updated_count integer;
begin
  select * into v_receivable
  from public.contas_receber
  where id = p_receivable_id
  for update;
  if not found then
    raise exception 'Cobrança local não encontrada.';
  end if;

  select status into v_status
  from public.matriculas
  where id = v_receivable.matricula_id
  for update;
  if not found or v_status not in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO') then
    raise exception 'Matrícula não possui encerramento terminal vigente.';
  end if;

  select * into v_movement
  from public.matricula_movimentacoes
  where id = p_movement_id
    and matricula_id = v_receivable.matricula_id
    and tipo in (
      'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
    )
    and status_novo = v_status;
  if not found then
    raise exception 'Movimentação terminal incompatível.';
  end if;

  if v_receivable.status = 'CANCELADO' then
    return jsonb_build_object('canceled', true, 'alreadyCanceled', true);
  end if;
  if v_receivable.status not in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
     or v_receivable.data_pagamento is not null
     or v_receivable.gateway_provider is not null
     or v_receivable.gateway_payment_id is not null
     or v_receivable.gateway_payment_link_id is not null
     or v_receivable.gateway_installment_id is not null
     or v_receivable.gateway_boleto_nosso_numero is not null
     or v_receivable.gateway_cnab_file_id is not null
     or v_receivable.asaas_payment_id is not null
     or v_receivable.asaas_payment_link_id is not null
     or v_receivable.asaas_installment_id is not null
     or v_receivable.manual_settlement_id is not null
     or exists (
       select 1
       from public.payment_gateway_transactions t
       where t.receivable_id = v_receivable.id
     ) then
    raise exception 'Cobrança não é um título local aberto e não pago.';
  end if;

  update public.contas_receber
  set status = 'CANCELADO', updated_at = now()
  where id = v_receivable.id
    and status = v_receivable.status
    and data_pagamento is null;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Cobrança mudou durante o cancelamento.';
  end if;

  return jsonb_build_object('canceled', true, 'alreadyCanceled', false);
end;
$$;

revoke all on function public.cancel_terminal_local_receivable(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_terminal_local_receivable(uuid, uuid)
  to service_role;
