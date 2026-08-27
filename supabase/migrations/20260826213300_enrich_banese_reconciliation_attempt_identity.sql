-- Identifica cada tentativa do reconciliador sem alterar o histórico técnico.
-- A situação atual do título é lida separadamente do resultado da tentativa.

begin;

create or replace function public.get_banese_reconciliation_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
  v_available boolean;
  v_can_receivable_details boolean;
  v_result jsonb;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado à Consulta API Banese.'
      using errcode = '42501';
  end if;

  v_can_receivable_details :=
    public.gestor_has_module('financeiro')
    and public.gestor_has_financeiro_tab('receber');

  select runtime.active_environment
  into v_environment
  from public.payment_gateway_runtime_config runtime
  limit 1;

  v_environment := coalesce(v_environment, 'sandbox');

  select exists (
    select 1
    from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method in ('BOLETO', 'PIX')
      and route.enabled
  )
  into v_available;

  if not v_available then
    return jsonb_build_object(
      'available', false,
      'environment', v_environment
    );
  end if;

  select jsonb_build_object(
    'available', true,
    'environment', v_environment,
    'canViewReceivableDetails', v_can_receivable_details,
    'config', to_jsonb(config),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(profile) order by profile.id), '[]'::jsonb)
      from public.banese_reconciliation_profiles profile
    ),
    'queue', jsonb_build_object(
      'ready', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.state = 'READY'
          and coalesce(queue.next_check_at, now()) <= now()
      ),
      'leased', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.state = 'LEASED'
          and queue.lease_until > now()
      ),
      'eadReady', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.modality = 'EAD'
          and queue.state = 'READY'
          and coalesce(queue.next_check_at, now()) <= now()
      ),
      'quarantined', (
        select count(*)
        from public.banese_reconciliation_queue queue
        where queue.environment = v_environment
          and queue.state = 'QUARANTINED'
      )
    ),
    'lastRuns', (
      select coalesce(jsonb_agg(to_jsonb(run) order by run.started_at desc), '[]'::jsonb)
      from (
        select
          source.id,
          source.environment,
          source.mode,
          source.profile_id,
          source.target_titles,
          source.status,
          source.claimed,
          source.checked,
          source.pending,
          source.paid,
          source.failed,
          source.throttled,
          source.oauth_requests,
          source.oauth_reused,
          source.decision,
          source.duration_ms,
          source.started_at,
          source.finished_at
        from public.banese_reconciliation_runs source
        where source.environment = v_environment
        order by source.started_at desc
        limit 30
      ) run
    ),
    'lastAttempts', (
      select coalesce(
        jsonb_agg(to_jsonb(attempt) order by attempt.created_at desc),
        '[]'::jsonb
      )
      from (
        select
          source.id,
          source.run_id,
          source.receivable_id,
          source.modality,
          source.result,
          source.remote_status,
          source.error_class,
          source.http_status,
          source.duration_ms,
          source.created_at,
          case when v_can_receivable_details then partner.nome end as partner_name,
          case when v_can_receivable_details then receivable.gateway_boleto_nosso_numero end as nosso_numero,
          case when v_can_receivable_details then receivable.descricao end as description,
          case when v_can_receivable_details then receivable.parcela_numero end as installment_number,
          case when v_can_receivable_details then receivable.data_vencimento end as due_date,
          case when v_can_receivable_details then receivable.valor end as amount,
          case when v_can_receivable_details then receivable.status end as current_receivable_status,
          case when v_can_receivable_details then receivable.gateway_status end as current_gateway_status,
          case when v_can_receivable_details then receivable.data_pagamento end as paid_at,
          case when v_can_receivable_details then receivable.valor_pago end as amount_paid
        from public.banese_reconciliation_attempts source
        left join public.contas_receber receivable
          on receivable.id = source.receivable_id
        left join public.parceiros partner
          on partner.id = receivable.cliente_id
        where source.environment = v_environment
        order by source.created_at desc
        limit 50
      ) attempt
    ),
    'lastSettlements', (
      select case
        when not v_can_receivable_details then '[]'::jsonb
        else coalesce(
          jsonb_agg(to_jsonb(settlement) order by settlement.created_at desc),
          '[]'::jsonb
        )
      end
      from (
        select
          ('settlement:' || receivable.id::text) as id,
          latest.run_id,
          receivable.id as receivable_id,
          latest.modality,
          latest.result,
          latest.remote_status,
          latest.error_class,
          latest.http_status,
          latest.duration_ms,
          receivable.gateway_settlement_recorded_at as created_at,
          partner.nome as partner_name,
          receivable.gateway_boleto_nosso_numero as nosso_numero,
          receivable.descricao as description,
          receivable.parcela_numero as installment_number,
          receivable.data_vencimento as due_date,
          receivable.valor as amount,
          receivable.status as current_receivable_status,
          receivable.gateway_status as current_gateway_status,
          receivable.data_pagamento as paid_at,
          receivable.valor_pago as amount_paid
        from public.contas_receber receivable
        left join public.parceiros partner
          on partner.id = receivable.cliente_id
        left join lateral (
          select
            attempt.run_id,
            attempt.modality,
            attempt.result,
            attempt.remote_status,
            attempt.error_class,
            attempt.http_status,
            attempt.duration_ms
          from public.banese_reconciliation_attempts attempt
          where attempt.receivable_id = receivable.id
            and attempt.environment = v_environment
          order by attempt.created_at desc
          limit 1
        ) latest on true
        where v_can_receivable_details
          and receivable.gateway_provider = 'banese_card'
          and receivable.gateway_environment = v_environment
          and receivable.status = 'PAGO'
          and receivable.gateway_settlement_source = 'API'
          and receivable.gateway_settlement_recorded_at is not null
        order by receivable.gateway_settlement_recorded_at desc
        limit 50
      ) settlement
    ),
    'lastErrorAttempts', (
      select coalesce(
        jsonb_agg(to_jsonb(attempt) order by attempt.created_at desc),
        '[]'::jsonb
      )
      from (
        select
          source.id,
          source.run_id,
          source.receivable_id,
          source.modality,
          source.result,
          source.remote_status,
          source.error_class,
          source.http_status,
          source.duration_ms,
          source.created_at,
          case when v_can_receivable_details then partner.nome end as partner_name,
          case when v_can_receivable_details then receivable.gateway_boleto_nosso_numero end as nosso_numero,
          case when v_can_receivable_details then receivable.descricao end as description,
          case when v_can_receivable_details then receivable.parcela_numero end as installment_number,
          case when v_can_receivable_details then receivable.data_vencimento end as due_date,
          case when v_can_receivable_details then receivable.valor end as amount,
          case when v_can_receivable_details then receivable.status end as current_receivable_status,
          case when v_can_receivable_details then receivable.gateway_status end as current_gateway_status,
          case when v_can_receivable_details then receivable.data_pagamento end as paid_at,
          case when v_can_receivable_details then receivable.valor_pago end as amount_paid
        from public.banese_reconciliation_attempts source
        left join public.contas_receber receivable
          on receivable.id = source.receivable_id
        left join public.parceiros partner
          on partner.id = receivable.cliente_id
        where source.environment = v_environment
          and source.result in ('ERROR', 'THROTTLED')
        order by source.created_at desc
        limit 50
      ) attempt
    ),
    'transitions', (
      select coalesce(
        jsonb_agg(to_jsonb(transition) order by transition.created_at desc),
        '[]'::jsonb
      )
      from (
        select
          source.id,
          source.transition_type,
          source.from_profile_id,
          source.to_profile_id,
          source.from_mode,
          source.to_mode,
          source.reason,
          source.created_at
        from public.banese_reconciliation_transitions source
        where source.environment = v_environment
        order by source.created_at desc
        limit 30
      ) transition
    )
  )
  into v_result
  from public.banese_reconciliation_config config
  where config.environment = v_environment;

  return coalesce(
    v_result,
    jsonb_build_object('available', true, 'environment', v_environment)
  );
end;
$$;

revoke all on function public.get_banese_reconciliation_dashboard()
  from public, anon;
grant execute on function public.get_banese_reconciliation_dashboard()
  to authenticated, service_role;

comment on function public.get_banese_reconciliation_dashboard() is
  'Painel Banese protegido: preserva o resultado histórico de cada tentativa e acrescenta identidade operacional e situação atual do recebível, sem CPF, contato ou payload bancário bruto.';

commit;
