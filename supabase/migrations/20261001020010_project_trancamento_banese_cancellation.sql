-- Projeção imutável para distinguir fila/revisão de cancelamento confirmado.
begin;

create or replace function internal_academic.trancamento_banese_is_canonical(
  p_receivable public.contas_receber
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_receivable.gateway_provider = 'banese_card'
    and p_receivable.gateway_environment in ('sandbox', 'production')
    and p_receivable.gateway_payment_method = 'BOLETO'
    and p_receivable.gateway_submission_channel = 'API'
    and p_receivable.gateway_submission_status = 'API_REGISTERED'
    and p_receivable.gateway_cnab_file_id is null
    and p_receivable.manual_settlement_id is null
    and coalesce(p_receivable.gateway_boleto_nosso_numero, '')
      ~ '^[0-9]{9}$'
    and p_receivable.gateway_payment_id
      = p_receivable.gateway_boleto_nosso_numero
    and upper(coalesce(p_receivable.gateway_status, ''))
      in ('PENDING', 'REGISTERED')
    and regexp_replace(
      coalesce(p_receivable.gateway_boleto_convenio, ''), '\D', '', 'g'
    ) ~ '^[0-9]{1,20}$'
    and (
      select count(*)
      from public.payment_gateway_transactions tx
      where tx.receivable_id = p_receivable.id
    ) = 1
    and exists (
      select 1
      from public.payment_gateway_transactions tx
      where tx.receivable_id = p_receivable.id
        and tx.provider_code = 'banese_card'
        and tx.environment = p_receivable.gateway_environment
        and tx.payment_method = 'BOLETO'
        and tx.remote_payment_id = p_receivable.gateway_boleto_nosso_numero
        and tx.bank_slip_our_number
          = p_receivable.gateway_boleto_nosso_numero
        and tx.amount = p_receivable.valor
        and upper(coalesce(tx.remote_status, ''))
          in ('PENDING', 'REGISTERED')
    )
    and not exists (
      select 1 from public.receivable_manual_settlements settlement
      where settlement.receivable_id = p_receivable.id
        and settlement.state in (
          'STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'REVIEW_REQUIRED'
        )
    ),
    false
  );
$$;

create or replace function internal_academic.trancamento_receivable_business_scope_matches(
  p_receivable public.contas_receber,
  p_movement_id uuid,
  p_effective_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_receivable.matricula_id is not null
    and p_receivable.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    and p_receivable.data_pagamento is null
    and coalesce(p_receivable.valor_pago, 0) = 0
    and p_receivable.data_vencimento > p_effective_date
    and not exists (select 1 from internal_proesc.obligation_links link
      where link.receivable_id = p_receivable.id)
    and not exists (
      select 1 from public.receivable_manual_settlements settlement
      where settlement.receivable_id = p_receivable.id
        and settlement.state in (
          'STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'REVIEW_REQUIRED'
        )
    )
    and (
      p_movement_id = internal_academic.current_trancamento_movement(
        p_receivable.matricula_id
      )
      or internal_academic.current_terminal_cancellation_movement(
        p_receivable.matricula_id
      ) is not null
    )
    and exists (
      select 1 from public.matricula_movimentacoes mm
      where mm.id = p_movement_id
        and mm.matricula_id = p_receivable.matricula_id
        and mm.tipo = 'TRANCAMENTO'
        and mm.status_novo = 'TRANCADO'
        and mm.data_movimentacao = p_effective_date
    ),
    false
  );
$$;

create or replace function internal_academic.trancamento_receivable_scope_matches(
  p_receivable public.contas_receber,
  p_movement_id uuid,
  p_effective_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select internal_academic.trancamento_receivable_business_scope_matches(
      p_receivable, p_movement_id, p_effective_date
    )
    and internal_academic.trancamento_banese_is_canonical(p_receivable);
$$;

create or replace function internal_academic.banese_trancamento_completion_matches(
  p_receivable public.contas_receber,
  p_job public.banese_cancellation_outbox
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_job.reason = 'TRANCAMENTO_FUTURO'
    and p_job.receivable_id = p_receivable.id
    and p_job.matricula_id = p_receivable.matricula_id
    and internal_academic.trancamento_receivable_business_scope_matches(
      p_receivable, p_job.movement_id, p_job.effective_date
    ),
    false
  );
$$;

create or replace function internal_academic.receivable_trancamento_cancellation(
  p_receivable public.contas_receber
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_state as (
    select
      internal_academic.current_trancamento_movement(
        p_receivable.matricula_id
      ) as trancamento_id,
      internal_academic.current_terminal_cancellation_movement(
        p_receivable.matricula_id
      ) as terminal_id
  ), cancellation_basis as (
    select mm.id, mm.data_movimentacao
    from public.matricula_movimentacoes mm
    cross join current_state state
    where mm.matricula_id = p_receivable.matricula_id
      and mm.tipo = 'TRANCAMENTO'
      and mm.status_novo = 'TRANCADO'
      and (
        mm.id = state.trancamento_id
        or (
          state.terminal_id is not null
          and mm.id = (
            select prior.id
            from public.matricula_movimentacoes prior
            where prior.matricula_id = p_receivable.matricula_id
              and prior.id <> state.terminal_id
            order by prior.created_at desc, prior.id desc
            limit 1
          )
        )
      )
  )
  select case
    when j.id is null
      and cancellation_basis.id is not null
      and p_receivable.status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      and p_receivable.data_pagamento is null
      and coalesce(p_receivable.valor_pago, 0) = 0
      and p_receivable.data_vencimento
        > cancellation_basis.data_movimentacao
      and not exists (select 1 from internal_proesc.obligation_links link
        where link.receivable_id = p_receivable.id)
      and p_receivable.gateway_provider = 'banese_card'
      and p_receivable.gateway_payment_method = 'BOLETO' then
      jsonb_build_object(
        'state', 'REVIEW_REQUIRED', 'reason', 'TRANCAMENTO_FUTURO',
        'movementId', cancellation_basis.id,
        'cutoffDate', cancellation_basis.data_movimentacao
      )
    when j.state = 'DONE' and j.remote_status = 'CANCELED' then
      jsonb_build_object(
        'state', 'CANCELED', 'reason', j.reason,
        'movementId', j.movement_id, 'cutoffDate', j.effective_date
      )
    when j.state = 'REVIEW_REQUIRED' then
      jsonb_build_object(
        'state', 'REVIEW_REQUIRED', 'reason', j.reason,
        'movementId', j.movement_id, 'cutoffDate', j.effective_date
      )
    when j.state = 'PROCESSING' then
      jsonb_build_object(
        'state', 'PROCESSING', 'reason', j.reason,
        'movementId', j.movement_id, 'cutoffDate', j.effective_date
      )
    when j.state in ('PENDING', 'RETRY') then
      jsonb_build_object(
        'state', 'PENDING', 'reason', j.reason,
        'movementId', j.movement_id, 'cutoffDate', j.effective_date
      )
    else null
  end
  from (select 1) seed
  left join public.banese_cancellation_outbox j
    on j.receivable_id = p_receivable.id
   and j.reason = 'TRANCAMENTO_FUTURO'
  left join cancellation_basis on true;
$$;

revoke all on function internal_academic.receivable_trancamento_cancellation(
  public.contas_receber
) from public, anon, authenticated;
revoke all on function internal_academic.trancamento_banese_is_canonical(
  public.contas_receber
) from public, anon, authenticated;
revoke all on function
  internal_academic.trancamento_receivable_business_scope_matches(
    public.contas_receber, uuid, date
  ),
  internal_academic.banese_trancamento_completion_matches(
    public.contas_receber, public.banese_cancellation_outbox
  ) from public, anon, authenticated;

comment on function internal_academic.receivable_trancamento_cancellation(
  public.contas_receber
) is 'Projeção local: pendente/revisão não equivale a cancelamento confirmado no Banese.';

commit;
