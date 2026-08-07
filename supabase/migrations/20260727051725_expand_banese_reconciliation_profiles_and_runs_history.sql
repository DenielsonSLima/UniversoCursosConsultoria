-- Amplia a escada conservadora da consulta Banese e adiciona histórico
-- paginado. Este módulo continua restrito à confirmação de títulos existentes.

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_id_check;
alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_advanced_lock_check;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_id_check
  check (id between 1 and 12);

insert into public.banese_reconciliation_profiles (
  id,
  name,
  titles_per_minute,
  estimated_requests_per_minute,
  group_name,
  sicredi_reference_percent,
  selectable,
  source_note
)
values
  (1, 'Recuperação', 1, 2, 'CONSERVATIVE', null, true, 'Retomada controlada após indisponibilidade.'),
  (2, 'Base distribuída', 2, 4, 'CONSERVATIVE', null, true, 'Equivale a até 10 títulos a cada 5 minutos, distribuídos de forma contínua.'),
  (3, 'Transição', 3, 6, 'CONSERVATIVE', null, true, 'Primeiro aumento gradual: até 15 títulos a cada 5 minutos.'),
  (4, 'Gradual', 4, 8, 'CONSERVATIVE', null, true, 'Avanço gradual: até 20 títulos a cada 5 minutos.'),
  (5, 'Cauteloso', 5, 10, 'CONSERVATIVE', null, true, 'Teste intermediário: até 25 títulos a cada 5 minutos.'),
  (6, 'Equilibrado', 6, 12, 'CONSERVATIVE', null, true, 'Operação equilibrada: até 30 títulos a cada 5 minutos.'),
  (7, 'Moderado', 8, 16, 'CONSERVATIVE', null, true, 'Operação moderada: até 40 títulos a cada 5 minutos.'),
  (8, 'EAD recomendado', 10, 20, 'CONSERVATIVE', null, true, 'Teto automático conservador: até 50 títulos a cada 5 minutos, com prioridade EAD.'),
  (9, 'Avançado 1', 30, 60, 'EXPERIMENTAL', 20, false, '30 títulos por minuto. Referência comparativa externa; não é limite autorizado pelo Banese.'),
  (10, 'Avançado 2', 60, 120, 'EXPERIMENTAL', 40, false, '60 títulos por minuto. Referência comparativa externa; não é limite autorizado pelo Banese.'),
  (11, 'Avançado 3', 90, 180, 'EXPERIMENTAL', 60, false, '90 títulos por minuto. Referência comparativa externa; não é limite autorizado pelo Banese.'),
  (12, 'Avançado 4', 150, 300, 'EXPERIMENTAL', 100, false, '150 títulos por minuto. Referência comparativa externa; não é limite autorizado pelo Banese.')
on conflict (id) do update
set name = excluded.name,
    titles_per_minute = excluded.titles_per_minute,
    estimated_requests_per_minute = excluded.estimated_requests_per_minute,
    group_name = excluded.group_name,
    sicredi_reference_percent = excluded.sicredi_reference_percent,
    selectable = excluded.selectable,
    source_note = excluded.source_note;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_advanced_lock_check
  check (
    (id <= 8 and group_name = 'CONSERVATIVE' and selectable)
    or (id >= 9 and group_name = 'EXPERIMENTAL' and not selectable)
  );

alter table public.banese_reconciliation_config
  drop constraint if exists banese_reconciliation_config_profile_order_check;
alter table public.banese_reconciliation_config
  add constraint banese_reconciliation_config_profile_order_check check (
    effective_profile_id between 1 and 8
    and last_stable_profile_id between 1 and 8
    and selected_profile_id between 1 and 8
    and effective_profile_id <= selected_profile_id
  );

create or replace function public.update_banese_reconciliation_config(
  p_mode text,
  p_profile_id integer,
  p_expected_version bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_mode text := upper(trim(coalesce(p_mode, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_before public.banese_reconciliation_config%rowtype;
  v_after public.banese_reconciliation_config%rowtype;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado à configuração da Consulta API Banese.'
      using errcode = '42501';
  end if;
  if v_mode not in ('MANUAL', 'AUTOMATIC', 'PAUSED') then
    raise exception 'Modo de operação inválido.';
  end if;
  if length(v_reason) < 5 or length(v_reason) > 300 then
    raise exception 'Informe um motivo entre 5 e 300 caracteres.';
  end if;
  if not exists (
    select 1
    from public.banese_reconciliation_profiles profile
    where profile.id = p_profile_id
      and profile.selectable
      and profile.id <= 8
  ) then
    raise exception 'Perfil bloqueado até confirmação formal do limite pelo Banese.';
  end if;

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;

  if not exists (
    select 1
    from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method in ('BOLETO', 'PIX')
      and route.enabled
  ) then
    raise exception 'O Banese não é o responsável pelas cobranças no ambiente ativo.';
  end if;

  select *
  into v_before
  from public.banese_reconciliation_config
  where environment = v_environment
  for update;

  if v_before.version <> p_expected_version then
    raise exception 'A configuração foi alterada por outro usuário. Atualize a tela e tente novamente.'
      using errcode = '40001';
  end if;

  update public.banese_reconciliation_config
  set mode = v_mode,
      selected_profile_id = p_profile_id,
      effective_profile_id = case
        when v_mode = 'MANUAL' then p_profile_id
        when v_mode = 'AUTOMATIC' then least(effective_profile_id, p_profile_id)
        else effective_profile_id
      end,
      last_stable_profile_id = case
        when v_mode = 'MANUAL' then p_profile_id
        else least(last_stable_profile_id, p_profile_id)
      end,
      state = case
        when v_mode = 'PAUSED' then 'PAUSED'
        else 'OBSERVING'
      end,
      stable_since = now(),
      cooldown_until = null,
      suspended_reason = null,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where environment = v_environment
    and version = p_expected_version
  returning * into v_after;

  insert into public.banese_reconciliation_transitions (
    environment,
    transition_type,
    from_profile_id,
    to_profile_id,
    from_mode,
    to_mode,
    reason,
    actor_id
  )
  values (
    v_environment,
    'ADMIN_CONFIGURATION',
    v_before.effective_profile_id,
    v_after.effective_profile_id,
    v_before.mode,
    v_after.mode,
    v_reason,
    auth.uid()
  );

  return to_jsonb(v_after);
end;
$$;

create or replace function public.begin_banese_reconciliation_run()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_config public.banese_reconciliation_config%rowtype;
  v_profile public.banese_reconciliation_profiles%rowtype;
  v_run_id uuid;
begin
  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  where enabled
  limit 1;

  if v_environment is null or not exists (
    select 1
    from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method = 'BOLETO'
      and route.enabled
  ) then
    return jsonb_build_object('enabled', false, 'reason', 'BANESE_NOT_RESPONSIBLE');
  end if;

  perform pg_advisory_xact_lock(hashtext('banese-reconciliation-' || v_environment));

  update public.banese_reconciliation_runs
  set status = 'ABANDONED',
      decision = 'Lease da execução expirou.',
      finished_at = now()
  where environment = v_environment
    and status = 'RUNNING'
    and started_at < now() - interval '2 minutes';

  if exists (
    select 1
    from public.banese_reconciliation_runs
    where environment = v_environment
      and status = 'RUNNING'
  ) then
    return jsonb_build_object('enabled', false, 'reason', 'RUN_ALREADY_ACTIVE');
  end if;

  select *
  into v_config
  from public.banese_reconciliation_config
  where environment = v_environment
  for update;

  if v_config.mode = 'PAUSED' then
    return jsonb_build_object('enabled', false, 'reason', 'PAUSED');
  end if;
  if v_config.state = 'SUSPENDED' then
    return jsonb_build_object('enabled', false, 'reason', 'SUSPENDED');
  end if;
  if v_config.cooldown_until is not null and v_config.cooldown_until > now() then
    return jsonb_build_object(
      'enabled', false,
      'reason', 'COOLDOWN',
      'cooldownUntil', v_config.cooldown_until
    );
  end if;

  if v_config.state = 'COOLDOWN' then
    update public.banese_reconciliation_config
    set state = 'OBSERVING',
        cooldown_until = null,
        stable_since = now(),
        updated_at = now()
    where environment = v_environment;
  end if;

  select *
  into v_profile
  from public.banese_reconciliation_profiles
  where id = least(v_config.effective_profile_id, 8)
    and selectable;

  insert into public.banese_reconciliation_runs (
    environment,
    mode,
    profile_id,
    target_titles
  )
  values (
    v_environment,
    v_config.mode,
    v_profile.id,
    least(v_profile.titles_per_minute, 10)
  )
  returning id into v_run_id;

  return jsonb_build_object(
    'enabled', true,
    'runId', v_run_id,
    'environment', v_environment,
    'mode', v_config.mode,
    'profileId', v_profile.id,
    'targetTitles', least(v_profile.titles_per_minute, 10),
    'oauthReuseEnabled', v_config.oauth_reuse_enabled,
    'oauthRefreshMarginSeconds', v_config.oauth_refresh_margin_seconds
  );
end;
$$;

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
  v_groups_per_page constant integer := 6;
  v_total_groups integer := 0;
  v_total_runs integer := 0;
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

  select active_environment
  into v_environment
  from public.payment_gateway_runtime_config
  limit 1;
  v_environment := coalesce(v_environment, 'sandbox');

  select count(distinct date_bin('10 minutes', run.started_at, timestamptz '2000-01-01 00:00:00+00')),
         count(*)
  into v_total_groups, v_total_runs
  from public.banese_reconciliation_runs run
  join public.banese_reconciliation_profiles profile on profile.id = run.profile_id
  where run.environment = v_environment
    and (p_started_from is null or run.started_at >= p_started_from)
    and (p_started_to is null or run.started_at <= p_started_to)
    and (
      not coalesce(p_errors_only, false)
      or run.failed > 0
      or run.throttled
      or run.status in ('FAILED', 'PARTIAL', 'THROTTLED', 'ABANDONED')
    )
    and (
      v_search is null
      or run.status ilike '%' || v_search || '%'
      or coalesce(run.decision, '') ilike '%' || v_search || '%'
      or profile.name ilike '%' || v_search || '%'
      or ('P' || run.profile_id::text) ilike '%' || v_search || '%'
    );

  select coalesce(jsonb_agg(to_jsonb(grouped) order by grouped.window_start desc), '[]'::jsonb)
  into v_items
  from (
    select
      date_bin('10 minutes', run.started_at, timestamptz '2000-01-01 00:00:00+00') as window_start,
      date_bin('10 minutes', run.started_at, timestamptz '2000-01-01 00:00:00+00') + interval '10 minutes' as window_end,
      count(*)::integer as run_count,
      array_agg(distinct run.profile_id order by run.profile_id) as profile_ids,
      array_agg(distinct run.status order by run.status) as statuses,
      sum(run.claimed)::integer as claimed,
      sum(run.checked)::integer as checked,
      sum(run.paid)::integer as paid,
      sum(run.failed)::integer as failed,
      sum(run.oauth_requests)::integer as oauth_requests,
      count(*) filter (where run.oauth_reused)::integer as oauth_reused_count,
      round(avg(run.duration_ms))::integer as average_duration_ms,
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
      ) as runs
    from public.banese_reconciliation_runs run
    join public.banese_reconciliation_profiles profile on profile.id = run.profile_id
    where run.environment = v_environment
      and (p_started_from is null or run.started_at >= p_started_from)
      and (p_started_to is null or run.started_at <= p_started_to)
      and (
        not coalesce(p_errors_only, false)
        or run.failed > 0
        or run.throttled
        or run.status in ('FAILED', 'PARTIAL', 'THROTTLED', 'ABANDONED')
      )
      and (
        v_search is null
        or run.status ilike '%' || v_search || '%'
        or coalesce(run.decision, '') ilike '%' || v_search || '%'
        or profile.name ilike '%' || v_search || '%'
        or ('P' || run.profile_id::text) ilike '%' || v_search || '%'
      )
    group by date_bin('10 minutes', run.started_at, timestamptz '2000-01-01 00:00:00+00')
    order by window_start desc
    limit v_groups_per_page
    offset (v_page - 1) * v_groups_per_page
  ) grouped;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'minutesPerPage', 60,
    'groupsPerPage', v_groups_per_page,
    'totalGroups', v_total_groups,
    'totalPages', case
      when v_total_groups = 0 then 0
      else ceil(v_total_groups::numeric / v_groups_per_page)::integer
    end,
    'totalRuns', v_total_runs
  );
end;
$$;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure
  )
  into v_definition;

  if position('least(v_config.selected_profile_id, 6)' in v_definition) = 0 then
    raise exception 'Não foi possível localizar o teto anterior do autopiloto Banese.';
  end if;

  v_definition := replace(
    v_definition,
    'least(v_config.selected_profile_id, 6)',
    'least(v_config.selected_profile_id, 8)'
  );
  execute v_definition;
end;
$migration$;

revoke all on function public.get_banese_reconciliation_runs_page(integer, text, timestamptz, timestamptz, boolean)
  from public, anon;
grant execute on function public.get_banese_reconciliation_runs_page(integer, text, timestamptz, timestamptz, boolean)
  to authenticated, service_role;

comment on function public.update_banese_reconciliation_config(text, integer, bigint, text) is
  'RPC protegida por autenticação, permissão, versão otimista e perfis conservadores P1-P8.';
comment on function public.get_banese_reconciliation_runs_page(integer, text, timestamptz, timestamptz, boolean) is
  'Histórico sanitizado em blocos de 10 minutos, seis blocos (60 minutos) por página.';
comment on table public.banese_reconciliation_profiles is
  'Perfis de confirmação Banese; P1-P8 conservadores e selecionáveis, P9-P12 avançados e bloqueados.';
