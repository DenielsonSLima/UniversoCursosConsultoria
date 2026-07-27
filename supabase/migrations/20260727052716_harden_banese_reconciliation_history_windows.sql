-- Garante que cada página do histórico represente uma hora cronológica real
-- e expõe um resumo de erros sem identificadores de alunos ou títulos.

update public.banese_reconciliation_profiles
set sicredi_reference_percent = null
where id between 9 and 12;

-- Preserva a capacidade que os IDs antigos representavam antes da nova escada:
-- P4 (5/min) -> P5, P5 (8/min) -> P7 e P6 (10/min) -> P8.
update public.banese_reconciliation_config
set selected_profile_id = case selected_profile_id when 4 then 5 when 5 then 7 when 6 then 8 else selected_profile_id end,
    effective_profile_id = case effective_profile_id when 4 then 5 when 5 then 7 when 6 then 8 else effective_profile_id end,
    last_stable_profile_id = case last_stable_profile_id when 4 then 5 when 5 then 7 when 6 then 8 else last_stable_profile_id end,
    version = version + 1,
    updated_at = now()
where selected_profile_id in (4, 5, 6)
   or effective_profile_id in (4, 5, 6)
   or last_stable_profile_id in (4, 5, 6);

update public.banese_reconciliation_runs
set profile_id = case profile_id when 4 then 5 when 5 then 7 when 6 then 8 else profile_id end
where profile_id in (4, 5, 6);

update public.banese_reconciliation_transitions
set from_profile_id = case from_profile_id when 4 then 5 when 5 then 7 when 6 then 8 else from_profile_id end,
    to_profile_id = case to_profile_id when 4 then 5 when 5 then 7 when 6 then 8 else to_profile_id end
where from_profile_id in (4, 5, 6)
   or to_profile_id in (4, 5, 6);

create or replace function public.get_banese_reconciliation_runs_page(
  p_page integer default 1,
  p_search text default null,
  p_started_from timestamptz default null,
  p_started_to timestamptz default null,
  p_errors_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_total_runs integer := 0;
  v_total_pages integer := 1;
  v_earliest timestamptz;
  v_latest timestamptz;
  v_anchor_start timestamptz;
  v_anchor_end timestamptz;
  v_page_start timestamptz;
  v_page_end timestamptz;
  v_filter_start timestamptz;
  v_filter_end timestamptz;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado às execuções da Consulta API Banese.'
      using errcode = '42501';
  end if;
  if p_started_from is not null
    and p_started_to is not null
    and p_started_from > p_started_to
  then
    raise exception 'A data inicial deve ser anterior à data final.';
  end if;
  if p_page is not null and (p_page < 1 or p_page > 744) then
    raise exception 'Página fora do limite permitido.';
  end if;

  v_filter_start := coalesce(p_started_from, now() - interval '31 days');
  v_filter_end := coalesce(p_started_to, now());
  if v_filter_end - v_filter_start > interval '31 days 1 second' then
    raise exception 'O período máximo por consulta é de 31 dias.';
  end if;

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;
  v_environment := coalesce(v_environment, 'sandbox');

  select count(*), min(run.started_at), max(run.started_at)
  into v_total_runs, v_earliest, v_latest
  from public.banese_reconciliation_runs run
  join public.banese_reconciliation_profiles profile on profile.id = run.profile_id
  where run.environment = v_environment
    and run.started_at >= v_filter_start
    and run.started_at <= v_filter_end
    and (
      not coalesce(p_errors_only, false)
      or run.failed > 0
      or run.throttled
      or run.status in ('FAILED', 'PARTIAL', 'THROTTLED', 'ABANDONED')
    )
    and (
      v_search is null
      or run.id::text ilike '%' || v_search || '%'
      or run.status ilike '%' || v_search || '%'
      or coalesce(run.decision, '') ilike '%' || v_search || '%'
      or profile.name ilike '%' || v_search || '%'
      or ('P' || run.profile_id::text) ilike '%' || v_search || '%'
    );

  v_anchor_end := date_trunc('hour', coalesce(p_started_to, v_latest, now())) + interval '1 hour';
  v_anchor_start := date_trunc(
    'hour',
    coalesce(p_started_from, v_earliest, greatest(v_filter_start, v_anchor_end - interval '1 hour'))
  );
  v_total_pages := greatest(
    1,
    ceil(extract(epoch from (v_anchor_end - v_anchor_start)) / 3600.0)::integer
  );
  v_page := least(v_page, v_total_pages);
  v_page_end := v_anchor_end - make_interval(hours => v_page - 1);
  v_page_start := v_page_end - interval '1 hour';

  with filtered as (
    select run.*
    from public.banese_reconciliation_runs run
    join public.banese_reconciliation_profiles profile on profile.id = run.profile_id
    where run.environment = v_environment
      and run.started_at >= v_page_start
      and run.started_at < v_page_end
      and run.started_at >= v_filter_start
      and run.started_at <= v_filter_end
      and (
        not coalesce(p_errors_only, false)
        or run.failed > 0
        or run.throttled
        or run.status in ('FAILED', 'PARTIAL', 'THROTTLED', 'ABANDONED')
      )
      and (
        v_search is null
        or run.id::text ilike '%' || v_search || '%'
        or run.status ilike '%' || v_search || '%'
        or coalesce(run.decision, '') ilike '%' || v_search || '%'
        or profile.name ilike '%' || v_search || '%'
        or ('P' || run.profile_id::text) ilike '%' || v_search || '%'
      )
  ),
  buckets as (
    select generate_series(
      v_page_start,
      v_page_end - interval '10 minutes',
      interval '10 minutes'
    ) as window_start
  ),
  grouped as (
    select
      bucket.window_start,
      bucket.window_start + interval '10 minutes' as window_end,
      count(run.id)::integer as run_count,
      coalesce(
        array_agg(distinct run.profile_id order by run.profile_id)
          filter (where run.profile_id is not null),
        '{}'::smallint[]
      ) as profile_ids,
      coalesce(
        array_agg(distinct run.status order by run.status)
          filter (where run.status is not null),
        '{}'::text[]
      ) as statuses,
      coalesce(sum(run.claimed), 0)::integer as claimed,
      coalesce(sum(run.checked), 0)::integer as checked,
      coalesce(sum(run.paid), 0)::integer as paid,
      coalesce(sum(run.failed), 0)::integer as failed,
      coalesce(sum(run.oauth_requests), 0)::integer as oauth_requests,
      count(run.id) filter (where run.oauth_reused)::integer as oauth_reused_count,
      round(avg(run.duration_ms))::integer as average_duration_ms,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', run.id,
            'environment', run.environment,
            'mode', run.mode,
            'profile_id', run.profile_id,
            'target_titles', run.target_titles,
            'status', run.status,
            'claimed', run.claimed,
            'checked', run.checked,
            'pending', run.pending,
            'paid', run.paid,
            'failed', run.failed,
            'throttled', run.throttled,
            'oauth_requests', run.oauth_requests,
            'oauth_reused', run.oauth_reused,
            'decision', run.decision,
            'duration_ms', run.duration_ms,
            'started_at', run.started_at,
            'finished_at', run.finished_at
          )
          order by run.started_at desc
        ) filter (where run.id is not null),
        '[]'::jsonb
      ) as runs
    from buckets bucket
    left join filtered run
      on run.started_at >= bucket.window_start
      and run.started_at < bucket.window_start + interval '10 minutes'
    group by bucket.window_start
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by grouped.window_start desc), '[]'::jsonb)
  into v_items
  from grouped;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'pageStart', v_page_start,
    'pageEnd', v_page_end,
    'minutesPerPage', 60,
    'groupsPerPage', 6,
    'totalGroups', v_total_pages * 6,
    'totalPages', v_total_pages,
    'totalRuns', v_total_runs
  );
end;
$$;

create or replace function public.finish_banese_reconciliation_run(
  p_run_id uuid,
  p_oauth_requests integer,
  p_oauth_reused boolean,
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
  v_checked integer;
  v_pending integer;
  v_paid integer;
  v_failed integer;
  v_throttled integer;
  v_auth_failed integer;
  v_from_profile smallint;
  v_to_profile smallint;
  v_decision text := 'Perfil mantido.';
  v_status text;
  v_sample integer;
begin
  select *
  into v_run
  from public.banese_reconciliation_runs
  where id = p_run_id
    and status = 'RUNNING'
  for update;

  if v_run.id is null then
    raise exception 'Execução Banese inválida ou já encerrada.';
  end if;

  select
    count(*),
    count(*) filter (where result = 'PENDING'),
    count(*) filter (where result = 'PAID'),
    count(*) filter (where result = 'ERROR'),
    count(*) filter (where result = 'THROTTLED'),
    count(*) filter (where error_class = 'AUTH')
  into v_checked, v_pending, v_paid, v_failed, v_throttled, v_auth_failed
  from public.banese_reconciliation_attempts
  where run_id = p_run_id;

  v_status := case
    when v_throttled > 0 then 'THROTTLED'
    when v_checked = 0 and v_run.claimed > 0 then 'FAILED'
    when v_failed > 0 and v_paid + v_pending > 0 then 'PARTIAL'
    when v_failed > 0 then 'FAILED'
    else 'SUCCESS'
  end;

  select *
  into v_config
  from public.banese_reconciliation_config
  where environment = v_run.environment
  for update;

  v_from_profile := v_config.effective_profile_id;
  v_to_profile := v_from_profile;

  if v_auth_failed > 0 then
    update public.banese_reconciliation_config
    set state = 'SUSPENDED',
        suspended_reason = 'Falha de autenticação após renovação única do OAuth.',
        cooldown_until = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := 'Circuito suspenso por falha de autenticação.';
  elsif v_throttled > 0 then
    v_to_profile := greatest(1, v_from_profile - 1);
    update public.banese_reconciliation_config
    set effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN',
        stable_since = now(),
        cooldown_until = now() + interval '1 hour',
        suspended_reason = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := format('HTTP 429: retorno automático do P%s para P%s e resfriamento de 1 hora.', v_from_profile, v_to_profile);
  elsif v_failed > 0 and v_checked > 0 and v_failed::numeric / v_checked >= 0.25 then
    v_to_profile := greatest(1, v_from_profile - 1);
    update public.banese_reconciliation_config
    set effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN',
        stable_since = now(),
        cooldown_until = now() + interval '15 minutes',
        suspended_reason = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := format('Taxa de erro elevada: retorno do P%s para P%s.', v_from_profile, v_to_profile);
  elsif v_config.mode = 'AUTOMATIC' and v_failed > 0 then
    update public.banese_reconciliation_config
    set state = 'OBSERVING',
        stable_since = now(),
        suspended_reason = null,
        updated_at = now()
    where environment = v_run.environment;
    v_decision := 'Falha isolada: perfil mantido e contagem de estabilidade reiniciada.';
  elsif v_config.mode = 'AUTOMATIC'
    and now() - v_config.stable_since >= interval '1 hour'
    and v_from_profile < least(v_config.selected_profile_id, 8)
  then
    select count(*)
    into v_sample
    from public.banese_reconciliation_attempts attempt
    join public.banese_reconciliation_runs run on run.id = attempt.run_id
    where run.environment = v_run.environment
      and run.profile_id = v_from_profile
      and attempt.created_at >= v_config.stable_since
      and attempt.result in ('PENDING', 'PAID');

    if v_sample >= greatest(10, v_from_profile * 10) then
      v_to_profile := v_from_profile + 1;
      update public.banese_reconciliation_config
      set effective_profile_id = v_to_profile,
          last_stable_profile_id = v_from_profile,
          state = 'OBSERVING',
          stable_since = now(),
          updated_at = now()
      where environment = v_run.environment;
      v_decision := format('Uma hora sem erros e amostra estável concluídas: promoção do P%s para P%s.', v_from_profile, v_to_profile);
    else
      update public.banese_reconciliation_config
      set state = 'OBSERVING',
          updated_at = now()
      where environment = v_run.environment;
      v_decision := format('Perfil mantido: amostra insuficiente (%s consultas válidas).', v_sample);
    end if;
  else
    update public.banese_reconciliation_config
    set state = case
          when mode = 'MANUAL' then 'STABLE'
          else state
        end,
        updated_at = now()
    where environment = v_run.environment;
  end if;

  update public.banese_reconciliation_runs
  set status = v_status,
      checked = v_checked,
      pending = v_pending,
      paid = v_paid,
      failed = v_failed,
      throttled = v_throttled > 0,
      oauth_requests = greatest(0, coalesce(p_oauth_requests, 0)),
      oauth_reused = coalesce(p_oauth_reused, false),
      decision = v_decision,
      duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 300000)),
      finished_at = now()
  where id = p_run_id;

  update public.banese_reconciliation_queue
  set state = 'READY',
      lease_run_id = null,
      lease_until = null,
      next_check_at = greatest(coalesce(next_check_at, now()), now() + interval '1 minute'),
      updated_at = now()
  where lease_run_id = p_run_id
    and state = 'LEASED';

  if v_from_profile <> v_to_profile or v_auth_failed > 0 then
    insert into public.banese_reconciliation_transitions (
      environment,
      transition_type,
      from_profile_id,
      to_profile_id,
      from_mode,
      to_mode,
      reason,
      run_id
    )
    values (
      v_run.environment,
      case
        when v_auth_failed > 0 then 'CIRCUIT_SUSPENDED'
        when v_to_profile < v_from_profile then 'AUTOMATIC_ROLLBACK'
        else 'AUTOMATIC_PROMOTION'
      end,
      v_from_profile,
      v_to_profile,
      v_config.mode,
      v_config.mode,
      v_decision,
      p_run_id
    );
  end if;

  return jsonb_build_object(
    'status', v_status,
    'checked', v_checked,
    'pending', v_pending,
    'paid', v_paid,
    'failed', v_failed,
    'decision', v_decision,
    'effectiveProfileId', v_to_profile
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

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;
  v_environment := coalesce(v_environment, 'sandbox');

  select jsonb_build_object(
    'attemptsLastHour', count(*) filter (
      where attempt.created_at >= now() - interval '1 hour'
    ),
    'throttledLastHour', count(*) filter (
      where attempt.created_at >= now() - interval '1 hour'
        and attempt.result = 'THROTTLED'
    ),
    'authLastHour', count(*) filter (
      where attempt.created_at >= now() - interval '1 hour'
        and attempt.error_class = 'AUTH'
    ),
    'lastErrorAt', max(attempt.created_at),
    'lastErrors', (
      select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc), '[]'::jsonb)
      from (
        select id, modality, result, error_class, http_status, created_at
        from public.banese_reconciliation_attempts
        where environment = v_environment
          and result in ('ERROR', 'THROTTLED')
        order by created_at desc
        limit 5
      ) recent
    )
  )
  into v_result
  from public.banese_reconciliation_attempts attempt
  where attempt.environment = v_environment
    and attempt.result in ('ERROR', 'THROTTLED');

  return coalesce(
    v_result,
    jsonb_build_object(
      'attemptsLastHour', 0,
      'throttledLastHour', 0,
      'authLastHour', 0,
      'lastErrorAt', null,
      'lastErrors', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_banese_reconciliation_error_summary()
  from public, anon;
grant execute on function public.get_banese_reconciliation_error_summary()
  to authenticated, service_role;

comment on function public.get_banese_reconciliation_runs_page(integer, text, timestamptz, timestamptz, boolean) is
  'Histórico sanitizado em seis janelas cronológicas de 10 minutos por página de uma hora.';
comment on function public.get_banese_reconciliation_error_summary() is
  'Resumo sanitizado de erros Banese; exige gestor global com acesso a Configurações.';
