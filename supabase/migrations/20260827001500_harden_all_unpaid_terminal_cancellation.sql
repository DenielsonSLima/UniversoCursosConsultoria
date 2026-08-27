-- Fecha lacunas de reconciliação, pagamento e concorrência da baixa terminal.

create or replace function public.cancel_late_terminal_local_receivable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.matricula_id is null
     or new.status not in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
     or new.data_pagamento is not null then
    return new;
  end if;

  if not exists (
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
  ) then
    return new;
  end if;

  if (
    new.gateway_provider is null
    and new.gateway_payment_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_installment_id is null
    and new.gateway_boleto_nosso_numero is null
    and new.gateway_cnab_file_id is null
    and new.asaas_payment_id is null
    and new.asaas_payment_link_id is null
    and new.asaas_installment_id is null
    and new.manual_settlement_id is null
    and not exists (
      select 1
      from public.payment_gateway_transactions t
      where t.receivable_id = new.id
    )
  ) or (
    new.gateway_provider = 'banese_card'
    and new.gateway_environment in ('sandbox', 'production')
    and new.gateway_payment_method = 'BOLETO'
    and new.gateway_submission_channel = 'API'
    and new.gateway_submission_status = 'API_REGISTERED'
    and new.gateway_cnab_file_id is null
    and new.manual_settlement_id is null
    and new.gateway_payment_id = new.gateway_boleto_nosso_numero
    and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
    and upper(coalesce(new.gateway_status, '')) in (
      'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
    )
    and (
      select count(*)
      from public.payment_gateway_transactions t
      where t.receivable_id = new.id
        and t.provider_code = 'banese_card'
        and t.environment = new.gateway_environment
        and t.payment_method = 'BOLETO'
    ) = 1
    and exists (
      select 1
      from public.payment_gateway_transactions t
      where t.receivable_id = new.id
        and t.provider_code = 'banese_card'
        and t.environment = new.gateway_environment
        and t.payment_method = 'BOLETO'
        and t.remote_payment_id = new.gateway_boleto_nosso_numero
        and t.bank_slip_our_number = new.gateway_boleto_nosso_numero
        and upper(coalesce(t.remote_status, '')) in (
          'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
        )
    )
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
  gateway_environment, gateway_payment_method, gateway_status,
  gateway_submission_channel, gateway_submission_status,
  gateway_payment_id, gateway_payment_link_id, gateway_installment_id,
  gateway_boleto_convenio, gateway_boleto_nosso_numero,
  gateway_cnab_file_id, asaas_payment_id, asaas_payment_link_id,
  asaas_installment_id, manual_settlement_id
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
      and data_pagamento is null
      and data_vencimento > new.data_movimentacao;
  elsif new.tipo = 'REATIVACAO' then
    update public.contas_receber
    set status = case
          when data_vencimento < current_date then 'VENCIDO'
          else 'PENDENTE'
        end,
        updated_at = now()
    where matricula_id = new.matricula_id
      and status = 'SUSPENSO'
      and data_pagamento is null;
  elsif new.tipo in (
    'CANCELAMENTO', 'DESISTENCIA', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then
    if not exists (
      select 1
      from public.matriculas m
      where m.id = new.matricula_id
        and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
        and new.status_novo = m.status
    ) then
      return new;
    end if;

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
      and data_pagamento is null
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
        or (
          gateway_provider = 'banese_card'
          and gateway_environment in ('sandbox', 'production')
          and gateway_payment_method = 'BOLETO'
          and gateway_submission_channel = 'API'
          and gateway_submission_status = 'API_REGISTERED'
          and gateway_cnab_file_id is null
          and manual_settlement_id is null
          and gateway_payment_id = gateway_boleto_nosso_numero
          and coalesce(gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
          and upper(coalesce(gateway_status, '')) in (
            'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
          )
          and (
            select count(*)
            from public.payment_gateway_transactions t
            where t.receivable_id = public.contas_receber.id
              and t.provider_code = 'banese_card'
              and t.environment = public.contas_receber.gateway_environment
              and t.payment_method = 'BOLETO'
          ) = 1
          and exists (
            select 1
            from public.payment_gateway_transactions t
            where t.receivable_id = public.contas_receber.id
              and t.provider_code = 'banese_card'
              and t.environment = public.contas_receber.gateway_environment
              and t.payment_method = 'BOLETO'
              and t.remote_payment_id =
                public.contas_receber.gateway_boleto_nosso_numero
              and t.bank_slip_our_number =
                public.contas_receber.gateway_boleto_nosso_numero
              and upper(coalesce(t.remote_status, '')) in (
                'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
              )
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
  v_matricula_id uuid;
  v_status text;
  v_updated_count integer;
begin
  select matricula_id into v_matricula_id
  from public.contas_receber
  where id = p_receivable_id;
  if not found or v_matricula_id is null then
    raise exception 'Cobrança local não encontrada.';
  end if;

  select status into v_status
  from public.matriculas
  where id = v_matricula_id
  for update;
  if not found or v_status not in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO') then
    raise exception 'Matrícula não possui encerramento terminal vigente.';
  end if;

  select * into v_receivable
  from public.contas_receber
  where id = p_receivable_id
    and matricula_id = v_matricula_id
  for update;
  if not found then
    raise exception 'Cobrança mudou durante o bloqueio.';
  end if;

  perform 1
  from public.matricula_movimentacoes mm
  where mm.id = p_movement_id
    and mm.matricula_id = v_receivable.matricula_id
    and mm.tipo in (
      'DESISTENCIA', 'CANCELAMENTO', 'TRANSFERENCIA_EXTERNA_ENVIADA'
    )
    and mm.status_novo = v_status;
  if not found then
    raise exception 'Movimentação terminal incompatível.';
  end if;

  if v_receivable.data_pagamento is not null
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
    raise exception 'Cobrança não é um título local não pago.';
  end if;

  if v_receivable.status = 'CANCELADO' then
    return jsonb_build_object('canceled', true, 'alreadyCanceled', true);
  end if;
  if v_receivable.status not in ('PENDENTE', 'VENCIDO', 'SUSPENSO') then
    raise exception 'Cobrança local não está aberta.';
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

create or replace function public.fail_banese_cancellation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_class text,
  p_error_message text,
  p_review_required boolean default false,
  p_remote_mutation_started boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.banese_cancellation_outbox%rowtype;
  v_state text;
begin
  select * into v_job
  from public.banese_cancellation_outbox
  where id = p_job_id
    and state = 'PROCESSING'
    and lease_token = p_lease_token
  for update;
  if not found then
    raise exception 'Lease de cancelamento inválido.';
  end if;

  v_state := case
    when coalesce(p_review_required, false)
      or coalesce(p_remote_mutation_started, false)
      then 'REVIEW_REQUIRED'
    else 'RETRY'
  end;

  update public.banese_cancellation_outbox
  set state = v_state,
      next_attempt_at = case
        when v_state = 'REVIEW_REQUIRED' then next_attempt_at
        else now() + make_interval(
          mins => least(60, greatest(1, v_job.attempt_count * 2))
        )
      end,
      lease_token = null,
      lease_until = null,
      remote_attempt_started_at = case
        when v_state = 'REVIEW_REQUIRED' then remote_attempt_started_at
        else null
      end,
      error_class = left(
        coalesce(nullif(p_error_class, ''), 'UNKNOWN'), 80
      ),
      error_message = left(
        coalesce(nullif(p_error_message, ''), 'Falha não detalhada.'), 240
      ),
      updated_at = now()
  where id = v_job.id;

  update public.banese_reconciliation_queue q
  set state = 'READY',
      next_check_at = now(),
      lease_run_id = null,
      lease_until = null,
      last_result = case
        when v_state = 'REVIEW_REQUIRED' then 'CANCELLATION_REVIEW'
        else 'CANCELLATION_RETRY'
      end,
      updated_at = now()
  where q.receivable_id = v_job.receivable_id
    and not (
      q.state = 'LEASED'
      and q.lease_until > now()
    )
    and exists (
      select 1
      from public.contas_receber c
      where c.id = q.receivable_id
        and c.status in (
          'PENDENTE', 'VENCIDO', 'SUSPENSO', 'AGUARDANDO_CONFIRMACAO'
        )
        and c.data_pagamento is null
        and c.gateway_provider = 'banese_card'
        and c.gateway_payment_method = 'BOLETO'
        and upper(coalesce(c.gateway_status, '')) not in (
          'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
          'EXPIRED', 'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
        )
    );

  return jsonb_build_object('failed', true);
end;
$$;

revoke all on function public.fail_banese_cancellation_job(
  uuid, uuid, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.fail_banese_cancellation_job(
  uuid, uuid, text, text, boolean, boolean
) to service_role;
