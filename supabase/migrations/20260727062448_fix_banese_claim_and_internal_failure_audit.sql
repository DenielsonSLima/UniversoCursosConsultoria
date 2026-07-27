-- Corrige o claim da fila e impede que falhas internas apareçam como SUCCESS.

create or replace function public.claim_banese_reconciliation_batch_v2(p_run_id uuid)
returns table(receivable_id uuid, modality text, environment text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.banese_reconciliation_runs%rowtype;
  v_strategy text;
  v_today date := (now() at time zone 'America/Maceio')::date;
begin
  select * into v_run
  from public.banese_reconciliation_runs
  where id = p_run_id and status = 'RUNNING' for update;
  if v_run.id is null then
    raise exception 'Execução Banese inválida ou encerrada.';
  end if;
  select queue_strategy into v_strategy
  from public.banese_reconciliation_profiles where id = v_run.profile_id;

  return query
  with eligible as (
    select
      queue.receivable_id,
      queue.modality,
      queue.priority,
      queue.next_check_at,
      queue.issued_at,
      case when queue.modality = 'EAD' then 0 else 1 end as family_rank,
      row_number() over (
        partition by case when queue.modality = 'EAD' then 0 else 1 end
        order by queue.priority, queue.next_check_at, queue.issued_at, queue.receivable_id
      ) as family_position
    from public.banese_reconciliation_queue queue
    join public.contas_receber receivable on receivable.id = queue.receivable_id
    where queue.environment = v_run.environment
      and (
        (queue.state = 'READY' and coalesce(queue.next_check_at, '-infinity'::timestamptz) <= now())
        or (queue.state = 'LEASED' and queue.lease_until <= now())
      )
      and receivable.gateway_provider = 'banese_card'
      and receivable.gateway_payment_method = 'BOLETO'
      and receivable.status in ('PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO')
      and coalesce(receivable.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      and (
        v_strategy = 'GENERAL'
        or queue.modality = 'EAD'
        or receivable.data_vencimento between v_today - 2 and v_today + 2
      )
  ),
  candidates as (
    select eligible.receivable_id
    from eligible
    join public.banese_reconciliation_queue queue
      on queue.receivable_id = eligible.receivable_id
    order by
      case
        when eligible.family_rank = 0
          and eligible.family_position <= greatest(1, ceil(v_run.target_titles * 0.8)::integer)
          then 0
        when eligible.family_rank = 1 then 1
        else 2
      end,
      eligible.priority,
      eligible.next_check_at,
      eligible.issued_at,
      eligible.receivable_id
    limit v_run.target_titles
    for update of queue skip locked
  ),
  leased as (
    update public.banese_reconciliation_queue queue
    set state = 'LEASED', lease_run_id = p_run_id,
        lease_until = now() + interval '90 seconds', updated_at = now()
    from candidates candidate
    where queue.receivable_id = candidate.receivable_id
    returning queue.receivable_id, queue.modality, queue.environment
  )
  select leased.receivable_id, leased.modality, leased.environment from leased;

  update public.banese_reconciliation_runs run
  set claimed = (
    select count(*) from public.banese_reconciliation_queue queue
    where queue.lease_run_id = p_run_id
  )
  where run.id = p_run_id;
end;
$$;

create or replace function public.fail_banese_reconciliation_run(
  p_run_id uuid,
  p_error_class text,
  p_decision text,
  p_duration_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.banese_reconciliation_runs%rowtype;
  v_config public.banese_reconciliation_config%rowtype;
  v_profile public.banese_reconciliation_profiles%rowtype;
  v_error_class text := upper(regexp_replace(trim(coalesce(p_error_class, 'INTERNAL_ERROR')), '[^A-Z0-9_]', '', 'g'));
  v_decision text := left(trim(coalesce(p_decision, 'Falha interna na consulta Banese.')), 300);
  v_to_profile smallint;
  v_config_matches boolean;
begin
  select * into v_run
  from public.banese_reconciliation_runs
  where id = p_run_id and status = 'RUNNING' for update;
  if v_run.id is null then
    raise exception 'Execução Banese inválida ou já encerrada.';
  end if;

  select * into v_config
  from public.banese_reconciliation_config
  where environment = v_run.environment for update;
  select * into v_profile
  from public.banese_reconciliation_profiles
  where id = v_run.profile_id;
  v_config_matches :=
    v_config.effective_profile_id = v_run.profile_id
    and v_config.version = v_run.config_version;
  v_to_profile := case
    when v_run.profile_id >= 9 then 8
    else v_profile.fallback_profile_id
  end;

  if v_config_matches then
    update public.banese_reconciliation_config
    set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end,
        effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN',
        stable_since = now(),
        cooldown_until = now() + interval '15 minutes',
        suspended_reason = null,
        test_expires_at = null,
        version = version + 1,
        updated_at = now()
    where environment = v_run.environment and version = v_run.config_version;
  end if;

  update public.banese_reconciliation_runs
  set status = 'FAILED',
      failed = greatest(1, claimed),
      decision = format('%s [%s]', v_decision, v_error_class),
      duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 300000)),
      finished_at = now()
  where id = p_run_id;

  update public.banese_reconciliation_queue
  set state = 'READY', lease_run_id = null, lease_until = null,
      next_check_at = greatest(coalesce(next_check_at, now()), now() + interval '1 minute'),
      updated_at = now()
  where lease_run_id = p_run_id and state = 'LEASED';

  if v_config_matches and v_to_profile <> v_run.profile_id then
    insert into public.banese_reconciliation_transitions (
      environment, transition_type, from_profile_id, to_profile_id,
      from_mode, to_mode, reason, run_id
    ) values (
      v_run.environment, 'AUTOMATIC_ROLLBACK',
      v_run.profile_id, v_to_profile, v_run.mode, v_run.mode,
      format('%s [%s]', v_decision, v_error_class), p_run_id
    );
  end if;

  return jsonb_build_object(
    'status', 'FAILED',
    'errorClass', v_error_class,
    'effectiveProfileId', case
      when v_config_matches then v_to_profile
      else v_config.effective_profile_id
    end
  );
end;
$$;

create or replace function public.get_banese_reconciliation_error_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_result jsonb;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado aos erros da Consulta API Banese.'
      using errcode = '42501';
  end if;

  select active_environment into v_environment
  from public.payment_gateway_runtime_config limit 1;
  v_environment := coalesce(v_environment, 'sandbox');

  with errors as (
    select
      attempt.id,
      attempt.modality,
      attempt.result,
      attempt.error_class,
      attempt.http_status,
      attempt.created_at
    from public.banese_reconciliation_attempts attempt
    where attempt.environment = v_environment
      and attempt.result in ('ERROR', 'THROTTLED')
      and attempt.created_at >= now() - interval '1 hour'
    union all
    select
      run.id,
      'SISTEMA'::text,
      run.status,
      'RUN_FAILED'::text,
      null::integer,
      coalesce(run.finished_at, run.started_at)
    from public.banese_reconciliation_runs run
    where run.environment = v_environment
      and run.status in ('FAILED', 'PARTIAL', 'THROTTLED', 'ABANDONED')
      and coalesce(run.finished_at, run.started_at) >= now() - interval '1 hour'
      and not exists (
        select 1 from public.banese_reconciliation_attempts attempt
        where attempt.run_id = run.id
          and attempt.result in ('ERROR', 'THROTTLED')
      )
  )
  select jsonb_build_object(
    'attemptsLastHour', count(*),
    'throttledLastHour', count(*) filter (where result = 'THROTTLED'),
    'authLastHour', count(*) filter (where error_class = 'AUTH'),
    'lastErrorAt', max(created_at),
    'lastErrors', (
      select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc), '[]'::jsonb)
      from (
        select id, modality, result, error_class, http_status, created_at
        from errors
        order by created_at desc
        limit 5
      ) recent
    )
  )
  into v_result
  from errors;

  return coalesce(v_result, jsonb_build_object(
    'attemptsLastHour', 0,
    'throttledLastHour', 0,
    'authLastHour', 0,
    'lastErrorAt', null,
    'lastErrors', '[]'::jsonb
  ));
end;
$$;

-- Entre a migration anterior e esta correção, o claim falhava antes de contar
-- a fila. Esses runs foram fechados como SUCCESS pelo worker antigo e precisam
-- refletir o erro operacional real no histórico.
update public.banese_reconciliation_runs
set status = 'FAILED',
    failed = 1,
    decision = 'Falha interna ao preparar a fila de consulta Banese. [CLAIM_ERROR]'
where started_at >= timestamptz '2026-07-27 06:14:28+00'
  and config_version = 3
  and status = 'SUCCESS'
  and claimed = 0
  and checked = 0;

revoke all on function public.claim_banese_reconciliation_batch_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_banese_reconciliation_batch_v2(uuid)
  to service_role;
revoke all on function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  to service_role;
revoke all on function public.get_banese_reconciliation_error_summary()
  from public, anon;
grant execute on function public.get_banese_reconciliation_error_summary()
  to authenticated, service_role;

comment on function public.fail_banese_reconciliation_run(uuid, text, text, integer) is
  'Finaliza falhas de infraestrutura como FAILED e nunca as mascara como lote vazio saudável.';
