-- Endurece o piloto automático Banese sem criar, reemitir ou cancelar títulos.
-- P10 é o teto automático; P17-P20 continuam somente como referência bloqueada.

alter table public.banese_reconciliation_runs
  add column if not exists config_version bigint;

update public.banese_reconciliation_profiles
set automatic_selectable = id between 1 and 10,
    fallback_profile_id = case when id >= 9 then 8 else greatest(1, id - 1) end
where id between 1 and 20;

update public.banese_reconciliation_config
set selected_profile_id = 10,
    effective_profile_id = case
      when effective_profile_id between 1 and 10 then effective_profile_id
      else 8
    end,
    last_stable_profile_id = case
      when last_stable_profile_id between 1 and 10 then last_stable_profile_id
      else 8
    end,
    test_expires_at = null,
    version = version + 1,
    updated_at = now()
where mode = 'AUTOMATIC';

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_family_policy_check;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_family_policy_check check (
    (
      id between 1 and 8
      and group_name = 'CONSERVATIVE'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id between 9 and 10
      and group_name = 'REAL_TEST'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
    or (
      id between 11 and 12
      and group_name = 'REAL_TEST'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
    or (
      id between 13 and 16
      and group_name = 'PRIORITY_WINDOW'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'EAD_DUE_WINDOW'
      and test_duration_minutes is not null
    )
    or (
      id between 17 and 20
      and group_name = 'AWAITING_BANESE'
      and not selectable
      and not automatic_selectable
      and test_duration_minutes is null
    )
  );

create index if not exists banese_reconciliation_profiles_fallback_idx
  on public.banese_reconciliation_profiles(fallback_profile_id);

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
  v_target_profile integer;
  v_profile public.banese_reconciliation_profiles%rowtype;
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

  v_target_profile := case when v_mode = 'AUTOMATIC' then 10 else p_profile_id end;
  select * into v_profile
  from public.banese_reconciliation_profiles
  where id = v_target_profile
    and selectable
    and (v_mode <> 'AUTOMATIC' or automatic_selectable);
  if v_profile.id is null then
    raise exception 'Este perfil não pode ser ativado no modo informado.';
  end if;

  select active_environment into v_environment
  from public.payment_gateway_runtime_config limit 1;
  if not exists (
    select 1 from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method in ('BOLETO', 'PIX')
      and route.enabled
  ) then
    raise exception 'O Banese não é o responsável pelas cobranças no ambiente ativo.';
  end if;

  select * into v_before
  from public.banese_reconciliation_config
  where environment = v_environment for update;
  if v_before.version <> p_expected_version then
    raise exception 'A configuração foi alterada por outro usuário. Atualize a tela e tente novamente.'
      using errcode = '40001';
  end if;

  update public.banese_reconciliation_config
  set mode = v_mode,
      selected_profile_id = v_target_profile,
      effective_profile_id = case
        when v_mode = 'MANUAL' then v_target_profile
        when v_mode = 'AUTOMATIC' and effective_profile_id between 1 and 10
          then effective_profile_id
        when v_mode = 'AUTOMATIC' then 8
        else effective_profile_id
      end,
      last_stable_profile_id = case
        when v_mode = 'MANUAL' then v_target_profile
        when last_stable_profile_id between 1 and 10 then last_stable_profile_id
        else 8
      end,
      state = case when v_mode = 'PAUSED' then 'PAUSED' else 'OBSERVING' end,
      stable_since = now(),
      cooldown_until = null,
      suspended_reason = null,
      test_expires_at = case
        when v_mode = 'MANUAL' and v_profile.test_duration_minutes is not null
          then now() + make_interval(mins => v_profile.test_duration_minutes)
        else null
      end,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where environment = v_environment and version = p_expected_version
  returning * into v_after;

  insert into public.banese_reconciliation_transitions (
    environment, transition_type, from_profile_id, to_profile_id,
    from_mode, to_mode, reason, actor_id
  ) values (
    v_environment, 'ADMIN_CONFIGURATION', v_before.effective_profile_id,
    v_after.effective_profile_id, v_before.mode, v_after.mode, v_reason, auth.uid()
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
  select active_environment into v_environment
  from public.payment_gateway_runtime_config where enabled limit 1;
  if v_environment is null or not exists (
    select 1 from public.payment_gateway_routes route
    where route.provider_code = 'banese_card'
      and route.environment = v_environment
      and route.payment_method = 'BOLETO'
      and route.enabled
  ) then
    return jsonb_build_object('enabled', false, 'reason', 'BANESE_NOT_RESPONSIBLE');
  end if;

  perform pg_advisory_xact_lock(hashtext('banese-reconciliation-' || v_environment));
  update public.banese_reconciliation_runs
  set status = 'ABANDONED', decision = 'Lease da execução expirou.', finished_at = now()
  where environment = v_environment and status = 'RUNNING'
    and started_at < now() - interval '2 minutes';
  if exists (
    select 1 from public.banese_reconciliation_runs
    where environment = v_environment and status = 'RUNNING'
  ) then
    return jsonb_build_object('enabled', false, 'reason', 'RUN_ALREADY_ACTIVE');
  end if;

  select * into v_config
  from public.banese_reconciliation_config
  where environment = v_environment for update;
  if v_config.mode = 'MANUAL'
    and v_config.test_expires_at is not null
    and v_config.test_expires_at <= now()
  then
    insert into public.banese_reconciliation_transitions (
      environment, transition_type, from_profile_id, to_profile_id,
      from_mode, to_mode, reason
    ) values (
      v_environment, 'TEST_EXPIRED', v_config.effective_profile_id, 8,
      'MANUAL', 'AUTOMATIC',
      'Teste temporário expirado; retorno ao P8 com teto automático P10.'
    );
    update public.banese_reconciliation_config
    set mode = 'AUTOMATIC', selected_profile_id = 10, effective_profile_id = 8,
        last_stable_profile_id = 8, state = 'OBSERVING', stable_since = now(),
        test_expires_at = null, version = version + 1, updated_at = now()
    where environment = v_environment
    returning * into v_config;
  end if;
  if v_config.mode = 'PAUSED' then
    return jsonb_build_object('enabled', false, 'reason', 'PAUSED');
  end if;
  if v_config.state = 'SUSPENDED' then
    return jsonb_build_object('enabled', false, 'reason', 'SUSPENDED');
  end if;
  if v_config.cooldown_until is not null and v_config.cooldown_until > now() then
    return jsonb_build_object(
      'enabled', false, 'reason', 'COOLDOWN',
      'cooldownUntil', v_config.cooldown_until
    );
  end if;
  if v_config.state = 'COOLDOWN' then
    update public.banese_reconciliation_config
    set state = 'OBSERVING', cooldown_until = null, stable_since = now(),
        version = version + 1, updated_at = now()
    where environment = v_environment
    returning * into v_config;
  end if;

  select * into v_profile
  from public.banese_reconciliation_profiles
  where id = v_config.effective_profile_id
    and selectable
    and (v_config.mode <> 'AUTOMATIC' or automatic_selectable);
  if v_profile.id is null then
    return jsonb_build_object('enabled', false, 'reason', 'PROFILE_BLOCKED');
  end if;

  insert into public.banese_reconciliation_runs (
    environment, mode, profile_id, target_titles, config_version
  )
  values (
    v_environment, v_config.mode, v_profile.id,
    v_profile.titles_per_minute, v_config.version
  )
  returning id into v_run_id;
  return jsonb_build_object(
    'enabled', true, 'runId', v_run_id, 'environment', v_environment,
    'mode', v_config.mode, 'profileId', v_profile.id,
    'targetTitles', v_profile.titles_per_minute,
    'maxConcurrency', v_profile.max_concurrency,
    'queueStrategy', v_profile.queue_strategy,
    'oauthReuseEnabled', v_config.oauth_reuse_enabled,
    'oauthRefreshMarginSeconds', v_config.oauth_refresh_margin_seconds
  );
end;
$$;

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
        when family_rank = 0
          and family_position <= greatest(1, ceil(v_run.target_titles * 0.8)::integer)
          then 0
        when family_rank = 1 then 1
        else 2
      end,
      priority, next_check_at, issued_at, receivable_id
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

create or replace function public.record_banese_reconciliation_attempt(
  p_run_id uuid, p_receivable_id uuid, p_result text, p_remote_status text,
  p_error_class text, p_http_status integer, p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.banese_reconciliation_queue%rowtype;
  v_result text := upper(trim(coalesce(p_result, '')));
  v_error_class text := upper(regexp_replace(trim(coalesce(p_error_class, '')), '[^A-Z0-9_]', '', 'g'));
  v_next_check timestamptz;
  v_due date;
  v_today date := (now() at time zone 'America/Maceio')::date;
begin
  if v_result not in ('PENDING', 'PAID', 'ERROR', 'THROTTLED') then
    raise exception 'Resultado de consulta Banese inválido.';
  end if;
  select * into v_queue
  from public.banese_reconciliation_queue
  where receivable_id = p_receivable_id
    and lease_run_id = p_run_id and state = 'LEASED' for update;
  if v_queue.receivable_id is null then
    raise exception 'Lease Banese inválido para registrar tentativa.';
  end if;
  select data_vencimento into v_due
  from public.contas_receber where id = p_receivable_id;

  insert into public.banese_reconciliation_attempts (
    run_id, receivable_id, environment, modality, result, remote_status,
    error_class, http_status, duration_ms
  ) values (
    p_run_id, p_receivable_id, v_queue.environment, v_queue.modality, v_result,
    nullif(left(upper(trim(coalesce(p_remote_status, ''))), 40), ''),
    nullif(left(v_error_class, 50), ''), p_http_status,
    greatest(0, least(coalesce(p_duration_ms, 0), 300000))
  ) on conflict (run_id, receivable_id) do nothing;

  if v_result = 'PAID' then
    update public.banese_reconciliation_queue
    set state = 'DONE', next_check_at = null, lease_run_id = null,
        lease_until = null, attempts = attempts + 1, consecutive_failures = 0,
        last_checked_at = now(), last_result = 'PAID',
        last_error_class = null, updated_at = now()
    where receivable_id = p_receivable_id;
    return;
  end if;

  if v_result = 'PENDING' then
    v_next_check := case
      when v_queue.modality = 'EAD' and v_queue.issued_at >= now() - interval '20 minutes' then now() + interval '1 minute'
      when v_queue.modality = 'EAD' and v_queue.issued_at >= now() - interval '2 hours' then now() + interval '5 minutes'
      when v_queue.modality = 'EAD' and v_queue.issued_at >= now() - interval '24 hours' then now() + interval '30 minutes'
      when v_queue.modality = 'EAD' then now() + interval '6 hours'
      when v_due > v_today + 2 then greatest(
        now() + interval '6 hours',
        ((v_due - 2)::timestamp + interval '5 minutes') at time zone 'America/Maceio'
      )
      when v_due < v_today - 2 then now() + interval '6 hours'
      else now() + interval '5 minutes'
    end;
  elsif v_result = 'THROTTLED' then
    v_next_check := now() + interval '1 hour';
  else
    v_next_check := now() + make_interval(
      mins => least(360, 5 * (2 ^ least(v_queue.consecutive_failures, 6))::integer)
    );
  end if;

  update public.banese_reconciliation_queue
  set state = case
        when v_result = 'ERROR' and consecutive_failures + 1 >= 8
          then 'QUARANTINED'
        else 'READY'
      end,
      next_check_at = v_next_check, lease_run_id = null, lease_until = null,
      attempts = attempts + 1,
      consecutive_failures = case
        when v_result = 'PENDING' then 0
        else consecutive_failures + 1
      end,
      last_checked_at = now(), last_result = v_result,
      last_error_class = nullif(left(v_error_class, 50), ''), updated_at = now()
  where receivable_id = p_receivable_id;
end;
$$;

create or replace function public.finish_banese_reconciliation_run(
  p_run_id uuid, p_oauth_requests integer, p_oauth_reused boolean, p_duration_ms integer
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
  v_checked integer; v_pending integer; v_paid integer; v_failed integer;
  v_throttled integer; v_auth_failed integer; v_shortfall integer;
  v_sample integer := 0; v_required integer := 0;
  v_from_profile smallint; v_to_profile smallint;
  v_decision text := 'Perfil mantido.'; v_status text;
  v_config_matches boolean;
begin
  select * into v_run from public.banese_reconciliation_runs
  where id = p_run_id and status = 'RUNNING' for update;
  if v_run.id is null then raise exception 'Execução Banese não encontrada.'; end if;

  select
    count(*), count(*) filter (where result = 'PENDING'),
    count(*) filter (where result = 'PAID'), count(*) filter (where result = 'ERROR'),
    count(*) filter (where result = 'THROTTLED'), count(*) filter (where error_class = 'AUTH')
  into v_checked, v_pending, v_paid, v_failed, v_throttled, v_auth_failed
  from public.banese_reconciliation_attempts where run_id = p_run_id;
  v_shortfall := greatest(0, v_run.claimed - v_checked);
  v_status := case
    when v_throttled > 0 then 'THROTTLED'
    when v_run.claimed > 0 and v_checked = 0 then 'FAILED'
    when v_failed > 0 or v_shortfall > 0 then 'PARTIAL'
    else 'SUCCESS'
  end;

  select * into v_config from public.banese_reconciliation_config
  where environment = v_run.environment for update;
  select * into v_profile from public.banese_reconciliation_profiles
  where id = v_run.profile_id;
  v_from_profile := v_run.profile_id;
  v_to_profile := v_from_profile;
  v_config_matches :=
    v_config.effective_profile_id = v_run.profile_id
    and v_config.version = v_run.config_version;

  if not v_config_matches then
    v_decision := 'Execução concluída sem alterar o seletor: a configuração mudou durante o lote.';
  elsif v_auth_failed > 0 then
    update public.banese_reconciliation_config
    set state = 'SUSPENDED',
        suspended_reason = 'Falha de autenticação após renovação única do OAuth.',
        cooldown_until = null, stable_since = now(),
        version = version + 1, updated_at = now()
    where environment = v_run.environment and version = v_run.config_version;
    v_decision := 'Circuito suspenso por falha de autenticação.';
  elsif v_status <> 'SUCCESS' then
    v_to_profile := case
      when v_from_profile >= 9 then 8
      else v_profile.fallback_profile_id
    end;
    update public.banese_reconciliation_config
    set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end,
        effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN', stable_since = now(),
        cooldown_until = now() + case
          when v_throttled > 0 then interval '1 hour'
          else interval '15 minutes'
        end,
        suspended_reason = null, test_expires_at = null,
        version = version + 1, updated_at = now()
    where environment = v_run.environment and version = v_run.config_version;
    v_decision := case
      when v_throttled > 0 then
        format('HTTP 429: retorno do P%s para P%s e resfriamento de 1 hora.', v_from_profile, v_to_profile)
      when v_shortfall > 0 then
        format('Lote incompleto (%s não processados): retorno do P%s para P%s.', v_shortfall, v_from_profile, v_to_profile)
      else
        format('Erro detectado: retorno do P%s para P%s e resfriamento de 15 minutos.', v_from_profile, v_to_profile)
    end;
  elsif v_config.mode = 'AUTOMATIC' and v_run.mode = 'AUTOMATIC'
    and v_checked > 0
    and now() - v_config.stable_since >= interval '1 hour'
    and v_from_profile < 10
  then
    v_required := greatest(20, v_profile.titles_per_minute * 10);
    select count(*) into v_sample
    from public.banese_reconciliation_attempts attempt
    join public.banese_reconciliation_runs run on run.id = attempt.run_id
    where run.environment = v_run.environment
      and run.profile_id = v_from_profile
      and attempt.created_at >= v_config.stable_since
      and attempt.result in ('PENDING', 'PAID');
    if v_sample >= v_required then
      v_to_profile := v_from_profile + 1;
      update public.banese_reconciliation_config
      set effective_profile_id = v_to_profile,
          last_stable_profile_id = v_from_profile,
          state = 'OBSERVING', stable_since = now(),
          version = version + 1, updated_at = now()
      where environment = v_run.environment and version = v_run.config_version;
      v_decision := format(
        'Uma hora sem erros e %s títulos válidos: promoção do P%s para P%s.',
        v_sample, v_from_profile, v_to_profile
      );
    else
      v_decision := format(
        'Perfil mantido: %s de %s títulos válidos e uma hora exigida.',
        v_sample, v_required
      );
    end if;
  elsif v_config.mode = 'MANUAL' then
    update public.banese_reconciliation_config
    set state = 'STABLE', updated_at = now()
    where environment = v_run.environment and version = v_run.config_version;
  end if;

  update public.banese_reconciliation_runs
  set status = v_status, checked = v_checked, pending = v_pending, paid = v_paid,
      failed = v_failed + v_shortfall, throttled = v_throttled > 0,
      oauth_requests = greatest(0, coalesce(p_oauth_requests, 0)),
      oauth_reused = coalesce(p_oauth_reused, false), decision = v_decision,
      duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 300000)),
      finished_at = now()
  where id = p_run_id;

  update public.banese_reconciliation_queue
  set state = 'READY', lease_run_id = null, lease_until = null,
      next_check_at = greatest(
        coalesce(next_check_at, now()),
        now() + case when v_throttled > 0 then interval '1 hour' else interval '1 minute' end
      ),
      updated_at = now()
  where lease_run_id = p_run_id and state = 'LEASED';

  if v_config_matches and (v_from_profile <> v_to_profile or v_auth_failed > 0) then
    insert into public.banese_reconciliation_transitions (
      environment, transition_type, from_profile_id, to_profile_id,
      from_mode, to_mode, reason, run_id
    ) values (
      v_run.environment,
      case
        when v_auth_failed > 0 then 'CIRCUIT_SUSPENDED'
        when v_to_profile < v_from_profile then 'AUTOMATIC_ROLLBACK'
        else 'AUTOMATIC_PROMOTION'
      end,
      v_from_profile, v_to_profile, v_run.mode, v_run.mode, v_decision, p_run_id
    );
  end if;
  return jsonb_build_object(
    'status', v_status, 'checked', v_checked, 'pending', v_pending,
    'paid', v_paid, 'failed', v_failed + v_shortfall,
    'decision', v_decision, 'effectiveProfileId',
    case when v_config_matches then v_to_profile else v_config.effective_profile_id end
  );
end;
$$;

create or replace function public.get_banese_reconciliation_autopilot_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_config public.banese_reconciliation_config%rowtype;
  v_profile public.banese_reconciliation_profiles%rowtype;
  v_valid integer;
  v_required integer;
  v_seconds integer;
begin
  if auth.uid() is null
    or not public.is_gestor_global()
    or not public.gestor_has_module('configuracoes')
  then
    raise exception 'Acesso negado à Consulta API Banese.' using errcode = '42501';
  end if;
  select active_environment into v_environment
  from public.payment_gateway_runtime_config limit 1;
  select * into v_config from public.banese_reconciliation_config
  where environment = coalesce(v_environment, 'sandbox');
  if v_config.environment is null then return '{}'::jsonb; end if;
  select * into v_profile from public.banese_reconciliation_profiles
  where id = v_config.effective_profile_id;
  v_required := greatest(20, v_profile.titles_per_minute * 10);
  v_seconds := greatest(
    0, extract(epoch from now() - v_config.stable_since)::integer
  );
  select count(*) into v_valid
  from public.banese_reconciliation_attempts attempt
  join public.banese_reconciliation_runs run on run.id = attempt.run_id
  where run.environment = v_config.environment
    and run.profile_id = v_config.effective_profile_id
    and attempt.created_at >= v_config.stable_since
    and attempt.result in ('PENDING', 'PAID');
  return jsonb_build_object(
    'currentProfileId', v_config.effective_profile_id,
    'nextProfileId', case
      when v_config.mode = 'AUTOMATIC' and v_config.effective_profile_id < 10
        then v_config.effective_profile_id + 1
      else null
    end,
    'validTitles', v_valid, 'requiredTitles', v_required,
    'stableSeconds', v_seconds, 'requiredSeconds', 3600,
    'eligibleToPromote', v_config.mode = 'AUTOMATIC'
      and v_config.effective_profile_id < 10
      and v_valid >= v_required and v_seconds >= 3600
  );
end;
$$;

revoke all on function public.update_banese_reconciliation_config(text, integer, bigint, text) from public, anon;
grant execute on function public.update_banese_reconciliation_config(text, integer, bigint, text) to authenticated;
revoke all on function public.begin_banese_reconciliation_run() from public, anon, authenticated;
grant execute on function public.begin_banese_reconciliation_run() to service_role;
revoke all on function public.claim_banese_reconciliation_batch_v2(uuid) from public, anon, authenticated;
grant execute on function public.claim_banese_reconciliation_batch_v2(uuid) to service_role;
revoke all on function public.record_banese_reconciliation_attempt(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_banese_reconciliation_attempt(uuid, uuid, text, text, text, integer, integer) to service_role;
revoke all on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer) to service_role;
revoke all on function public.get_banese_reconciliation_autopilot_progress() from public, anon;
grant execute on function public.get_banese_reconciliation_autopilot_progress() to authenticated, service_role;

comment on constraint banese_reconciliation_profiles_family_policy_check
  on public.banese_reconciliation_profiles is
  'P1-P10 podem compor o automático; P11-P16 são manuais temporários e P17-P20 permanecem bloqueados.';
comment on column public.banese_reconciliation_runs.config_version is
  'Snapshot que impede uma execução antiga de alterar uma configuração mais nova.';
comment on function public.get_banese_reconciliation_autopilot_progress() is
  'Exibe amostra real: P2 exige 20 títulos válidos e 1 hora; o teto automático é P10.';
