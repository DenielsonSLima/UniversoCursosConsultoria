begin;

-- Read-only observation. A successful query does not imply payment.
create function internal_contas.banese_attempt_recovery_labels(
  p_recovered boolean,p_current_status text,p_queue_state text,p_latest_result text
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'status',case when p_recovered then 'RECOVERED_AFTER_QUERY'
      when p_current_status='PAGO' and p_queue_state='DONE' then 'SETTLED_CURRENT'
      when p_current_status in ('CANCELADO','SUSPENSO') then 'TERMINAL_CURRENT'
      else 'AWAITING_NEW_QUERY' end,
    'label',case when p_recovered then 'Erro histórico superado por consulta posterior'
      when p_current_status='PAGO' and p_queue_state='DONE' then 'Título já pago e fila concluída; sem nova consulta comprovada'
      when p_current_status in ('CANCELADO','SUSPENSO') then 'Título encerrado; isso não comprova recuperação da consulta'
      else 'Sem consulta posterior bem-sucedida registrada' end,
    'currentQueryLabel',case when p_latest_result in ('ERROR','THROTTLED') then 'A última tentativa de consulta falhou'
      when p_latest_result='PENDING' then 'Última consulta concluída: banco informou pendente'
      when p_latest_result='PAID' then 'Última consulta concluída: banco informou pago'
      else 'Última consulta não registrada' end,
    'queueLabel',case p_queue_state when 'READY' then 'Aguardando próxima consulta'
      when 'LEASED' then 'Consulta em andamento' when 'DONE' then 'Concluída'
      when 'QUARANTINED' then 'Em revisão' when 'SUSPENDED' then 'Suspensa'
      else 'Sem agendamento registrado' end
  );
$$;
revoke all on function internal_contas.banese_attempt_recovery_labels(boolean,text,text,text)
  from public,anon,authenticated,service_role;

create or replace function public.get_banese_reconciliation_attempts_page(
  p_context text default 'queries',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
  v_can_receivable_details boolean;
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 20), 100));
  v_offset integer := (v_page - 1) * v_page_size;
  v_context text := coalesce(nullif(trim(p_context), ''), 'queries');
  v_total_count integer := 0;
  v_total_pages integer := 1;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado às tentativas da Consulta API Banese.'
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

  if v_context = 'settlements' then
    if not v_can_receivable_details then
      return jsonb_build_object(
        'items', '[]'::jsonb,
        'page', v_page,
        'pageSize', v_page_size,
        'totalCount', 0,
        'totalPages', 0
      );
    end if;

    select count(*)
    into v_total_count
    from public.contas_receber receivable
    where receivable.gateway_provider = 'banese_card'
      and receivable.gateway_environment = v_environment
      and receivable.status = 'PAGO'
      and receivable.gateway_settlement_source = 'API'
      and receivable.gateway_settlement_recorded_at is not null;

    select coalesce(
      jsonb_agg(to_jsonb(settlement) order by settlement.created_at desc),
      '[]'::jsonb
    )
    into v_items
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
      where receivable.gateway_provider = 'banese_card'
        and receivable.gateway_environment = v_environment
        and receivable.status = 'PAGO'
        and receivable.gateway_settlement_source = 'API'
        and receivable.gateway_settlement_recorded_at is not null
      order by receivable.gateway_settlement_recorded_at desc
      limit v_page_size
      offset v_offset
    ) settlement;

  elsif v_context = 'errors' then
    select count(*)
    into v_total_count
    from public.banese_reconciliation_attempts source
    where source.environment = v_environment
      and source.result in ('ERROR', 'THROTTLED');

    select coalesce(
      jsonb_agg(to_jsonb(attempt) order by attempt.created_at desc,attempt.id desc),
      '[]'::jsonb
    )
    into v_items
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
      order by source.created_at desc,source.id desc
      limit v_page_size
      offset v_offset
    ) attempt;

  else
    -- 'queries'
    select count(*)
    into v_total_count
    from public.banese_reconciliation_attempts source
    where source.environment = v_environment;

    select coalesce(
      jsonb_agg(to_jsonb(attempt) order by attempt.created_at desc,attempt.id desc),
      '[]'::jsonb
    )
    into v_items
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
      order by source.created_at desc,source.id desc
      limit v_page_size
      offset v_offset
    ) attempt;
  end if;

  -- Decorate only the selected error page, after the original authorization
  -- and financial-detail mask. No worker, queue or receivable is updated.
  if v_context='errors' and v_can_receivable_details then
    select coalesce(jsonb_agg(item.value || jsonb_build_object('recovery',
      internal_contas.banese_attempt_recovery_labels(
        recovered.created_at is not null,c.status,q.state,latest.result
      ) || jsonb_build_object(
        'recoveredAt',recovered.created_at,
        'latestQueryAt',latest.created_at,'latestQueryResult',latest.result,
        'latestQueryErrorClass',latest.error_class,
        'queueState',q.state,'nextCheckAt',q.next_check_at
      )) order by item.ordinality),'[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_items) with ordinality item(value,ordinality)
    left join public.contas_receber c on c.id=(item.value->>'receivable_id')::uuid
    left join public.banese_reconciliation_queue q on q.receivable_id=c.id
      and q.environment=v_environment
    left join lateral (
      select a.created_at,a.result,a.error_class
      from public.banese_reconciliation_attempts a
      where a.receivable_id=(item.value->>'receivable_id')::uuid
        and a.environment=v_environment
      order by a.created_at desc,a.id desc limit 1
    ) latest on true
    left join lateral (
      select a.created_at from public.banese_reconciliation_attempts a
      where a.receivable_id=(item.value->>'receivable_id')::uuid
        and a.environment=v_environment and a.result in ('PENDING','PAID')
        and (a.created_at,a.id)>(
          (item.value->>'created_at')::timestamptz,(item.value->>'id')::bigint
        )
      order by a.created_at,a.id limit 1
    ) recovered on true;
  end if;

  v_total_pages := ceil(v_total_count::numeric / v_page_size);
  if v_total_pages < 1 then
    v_total_pages := 1;
  end if;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'page', v_page,
    'pageSize', v_page_size,
    'totalCount', v_total_count,
    'totalPages', v_total_pages
  );
end;
$$;

-- CREATE OR REPLACE preserves the existing RPC identity and grants.
notify pgrst,'reload schema';
commit;
