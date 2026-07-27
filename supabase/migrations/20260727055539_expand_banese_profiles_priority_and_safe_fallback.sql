-- Expande os perfis da consulta Banese com famílias explícitas, fallback seguro
-- e janela prioritária de vencimento. Nenhuma rotina desta migration emite títulos.

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_id_check;
alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_advanced_lock_check;
alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_group_name_check;

alter table public.banese_reconciliation_profiles
  add column if not exists automatic_selectable boolean not null default false,
  add column if not exists queue_strategy text not null default 'GENERAL',
  add column if not exists fallback_profile_id smallint,
  add column if not exists max_concurrency smallint not null default 1,
  add column if not exists test_duration_minutes integer;

update public.banese_reconciliation_profiles
set fallback_profile_id = greatest(1, id - 1)
where fallback_profile_id is null;

alter table public.banese_reconciliation_profiles
  alter column fallback_profile_id set not null;
alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_fallback_profile_id_fkey;
alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_fallback_profile_id_fkey
  foreign key (fallback_profile_id)
  references public.banese_reconciliation_profiles(id);
alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_id_check check (id between 1 and 20),
  add constraint banese_reconciliation_profiles_queue_strategy_check check (
    queue_strategy in ('GENERAL', 'EAD_DUE_WINDOW')
  ),
  add constraint banese_reconciliation_profiles_concurrency_check check (
    max_concurrency between 1 and 8
  ),
  add constraint banese_reconciliation_profiles_test_duration_check check (
    test_duration_minutes is null or test_duration_minutes between 15 and 120
  );

insert into public.banese_reconciliation_profiles (
  id, name, titles_per_minute, estimated_requests_per_minute, group_name,
  sicredi_reference_percent, selectable, automatic_selectable, queue_strategy,
  fallback_profile_id, max_concurrency, test_duration_minutes, source_note
)
values
  (1, 'Recuperação', 1, 2, 'CONSERVATIVE', null, true, true, 'GENERAL', 1, 1, null, 'Retomada controlada após indisponibilidade.'),
  (2, 'Base distribuída', 2, 4, 'CONSERVATIVE', null, true, true, 'GENERAL', 1, 1, null, 'Até 10 títulos a cada 5 minutos, distribuídos por minuto.'),
  (3, 'Transição', 3, 6, 'CONSERVATIVE', null, true, true, 'GENERAL', 2, 1, null, 'Até 15 títulos a cada 5 minutos.'),
  (4, 'Gradual', 4, 8, 'CONSERVATIVE', null, true, true, 'GENERAL', 3, 1, null, 'Até 20 títulos a cada 5 minutos.'),
  (5, 'Cauteloso', 5, 10, 'CONSERVATIVE', null, true, true, 'GENERAL', 4, 1, null, 'Até 25 títulos a cada 5 minutos.'),
  (6, 'Equilibrado', 6, 12, 'CONSERVATIVE', null, true, true, 'GENERAL', 5, 1, null, 'Até 30 títulos a cada 5 minutos.'),
  (7, 'Moderado', 8, 16, 'CONSERVATIVE', null, true, true, 'GENERAL', 6, 1, null, 'Até 40 títulos a cada 5 minutos.'),
  (8, 'EAD recomendado', 10, 20, 'CONSERVATIVE', null, true, true, 'GENERAL', 7, 2, null, 'Teto automático conservador, com EAD sempre em primeiro lugar.'),
  (9, 'Teste geral 30', 30, 60, 'REAL_TEST', 20, true, false, 'GENERAL', 8, 3, 30, 'Canário manual de 30 títulos/min; expira após 30 minutos.'),
  (10, 'Teste geral 60', 60, 120, 'REAL_TEST', 40, true, false, 'GENERAL', 9, 4, 30, 'Canário manual de 60 títulos/min; expira após 30 minutos.'),
  (11, 'Teste geral 90', 90, 180, 'REAL_TEST', 60, true, false, 'GENERAL', 10, 5, 30, 'Canário manual de 90 títulos/min; expira após 30 minutos.'),
  (12, 'Teste geral 150', 150, 300, 'REAL_TEST', 100, true, false, 'GENERAL', 11, 6, 30, 'Canário manual de 150 títulos/min; expira após 30 minutos.'),
  (13, 'Prioridade 10', 10, 20, 'PRIORITY_WINDOW', null, true, false, 'EAD_DUE_WINDOW', 8, 2, 30, 'EAD primeiro; demais títulos somente de D−2 a D+2 do vencimento.'),
  (14, 'Prioridade 30', 30, 60, 'PRIORITY_WINDOW', null, true, false, 'EAD_DUE_WINDOW', 13, 3, 30, 'EAD primeiro; janela de vencimento com até 30 títulos/min.'),
  (15, 'Prioridade 60', 60, 120, 'PRIORITY_WINDOW', null, true, false, 'EAD_DUE_WINDOW', 14, 4, 30, 'EAD primeiro; janela de vencimento com até 60 títulos/min.'),
  (16, 'Prioridade 100', 100, 200, 'PRIORITY_WINDOW', null, true, false, 'EAD_DUE_WINDOW', 15, 5, 30, 'EAD primeiro; janela de vencimento com até 100 títulos/min.'),
  (17, 'Aguardando 300 GETs', 150, 300, 'AWAITING_BANESE', null, false, false, 'GENERAL', 12, 6, null, 'Aguardando retorno formal do Banese: 300 requisições/min.'),
  (18, 'Aguardando 450 GETs', 225, 450, 'AWAITING_BANESE', null, false, false, 'GENERAL', 17, 7, null, 'Aguardando retorno formal do Banese: 450 requisições/min.'),
  (19, 'Aguardando 600 GETs', 300, 600, 'AWAITING_BANESE', null, false, false, 'GENERAL', 18, 8, null, 'Aguardando retorno formal do Banese: 600 requisições/min.'),
  (20, 'Aguardando 750 GETs', 375, 750, 'AWAITING_BANESE', null, false, false, 'GENERAL', 19, 8, null, 'Aguardando retorno formal do Banese: 750 requisições/min.')
on conflict (id) do update
set name = excluded.name,
    titles_per_minute = excluded.titles_per_minute,
    estimated_requests_per_minute = excluded.estimated_requests_per_minute,
    group_name = excluded.group_name,
    sicredi_reference_percent = excluded.sicredi_reference_percent,
    selectable = excluded.selectable,
    automatic_selectable = excluded.automatic_selectable,
    queue_strategy = excluded.queue_strategy,
    fallback_profile_id = excluded.fallback_profile_id,
    max_concurrency = excluded.max_concurrency,
    test_duration_minutes = excluded.test_duration_minutes,
    source_note = excluded.source_note;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_group_name_check check (
    group_name in ('CONSERVATIVE', 'REAL_TEST', 'PRIORITY_WINDOW', 'AWAITING_BANESE')
  );

alter table public.banese_reconciliation_config
  add column if not exists test_expires_at timestamptz;
alter table public.banese_reconciliation_config
  drop constraint if exists banese_reconciliation_config_profile_order_check;
alter table public.banese_reconciliation_config
  add constraint banese_reconciliation_config_profile_order_check check (
    effective_profile_id between 1 and 20
    and last_stable_profile_id between 1 and 20
    and selected_profile_id between 1 and 20
  );

update public.banese_reconciliation_config
set selected_profile_id = 8,
    effective_profile_id = least(effective_profile_id, 8),
    last_stable_profile_id = least(last_stable_profile_id, 8),
    test_expires_at = null
where mode = 'AUTOMATIC';

alter table public.banese_reconciliation_runs
  drop constraint if exists banese_reconciliation_runs_target_titles_check;
alter table public.banese_reconciliation_runs
  add constraint banese_reconciliation_runs_target_titles_check
  check (target_titles between 1 and 375);

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

  v_target_profile := case when v_mode = 'AUTOMATIC' then 8 else p_profile_id end;
  select * into v_profile
  from public.banese_reconciliation_profiles
  where id = v_target_profile and selectable;
  if v_profile.id is null then
    raise exception 'Este perfil está aguardando retorno formal do Banese.';
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
        when v_mode = 'AUTOMATIC' then least(effective_profile_id, 8)
        else effective_profile_id
      end,
      last_stable_profile_id = case
        when v_mode = 'MANUAL' then v_target_profile
        else least(last_stable_profile_id, 8)
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
      'MANUAL', 'AUTOMATIC', 'Teste temporário expirado; retorno seguro ao P8.'
    );
    update public.banese_reconciliation_config
    set mode = 'AUTOMATIC', selected_profile_id = 8, effective_profile_id = 8,
        last_stable_profile_id = 8, state = 'OBSERVING', stable_since = now(),
        test_expires_at = null, updated_at = now()
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
    return jsonb_build_object('enabled', false, 'reason', 'COOLDOWN', 'cooldownUntil', v_config.cooldown_until);
  end if;
  if v_config.state = 'COOLDOWN' then
    update public.banese_reconciliation_config
    set state = 'OBSERVING', cooldown_until = null, stable_since = now(), updated_at = now()
    where environment = v_environment;
  end if;

  select * into v_profile
  from public.banese_reconciliation_profiles
  where id = v_config.effective_profile_id and selectable;
  if v_profile.id is null then
    return jsonb_build_object('enabled', false, 'reason', 'PROFILE_BLOCKED');
  end if;

  insert into public.banese_reconciliation_runs (environment, mode, profile_id, target_titles)
  values (v_environment, v_config.mode, v_profile.id, v_profile.titles_per_minute)
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
  with candidates as (
    select queue.receivable_id
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
        or receivable.data_vencimento between current_date - 2 and current_date + 2
      )
    order by
      case
        when queue.modality = 'EAD' then 0
        when receivable.data_vencimento between current_date - 2 and current_date + 2 then 1
        else 2
      end,
      queue.priority, queue.next_check_at, queue.issued_at, queue.receivable_id
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
      when v_due > current_date + 2 then greatest(
        now() + interval '6 hours',
        ((v_due - 2)::timestamp + interval '5 minutes') at time zone 'America/Maceio'
      )
      when v_due < current_date - 2 then now() + interval '6 hours'
      else now() + interval '5 minutes'
    end;
  elsif v_result = 'THROTTLED' then
    v_next_check := now() + interval '1 hour';
  else
    v_next_check := now() + make_interval(mins => least(360, 5 * (2 ^ least(v_queue.consecutive_failures, 6))::integer));
  end if;

  update public.banese_reconciliation_queue
  set state = case when v_result = 'ERROR' and consecutive_failures + 1 >= 8 then 'QUARANTINED' else 'READY' end,
      next_check_at = v_next_check, lease_run_id = null, lease_until = null,
      attempts = attempts + 1,
      consecutive_failures = case when v_result = 'PENDING' then 0 else consecutive_failures + 1 end,
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
  v_throttled integer; v_auth_failed integer; v_sample integer := 0;
  v_from_profile smallint; v_to_profile smallint;
  v_decision text := 'Perfil mantido.'; v_status text;
begin
  select * into v_run from public.banese_reconciliation_runs
  where id = p_run_id and status = 'RUNNING' for update;
  if v_run.id is null then raise exception 'Execução Banese inválida ou já encerrada.'; end if;
  select count(*), count(*) filter (where result = 'PENDING'),
    count(*) filter (where result = 'PAID'), count(*) filter (where result = 'ERROR'),
    count(*) filter (where result = 'THROTTLED'), count(*) filter (where error_class = 'AUTH')
  into v_checked, v_pending, v_paid, v_failed, v_throttled, v_auth_failed
  from public.banese_reconciliation_attempts where run_id = p_run_id;
  v_status := case
    when v_throttled > 0 then 'THROTTLED'
    when v_checked = 0 and v_run.claimed > 0 then 'FAILED'
    when v_failed > 0 and v_paid + v_pending > 0 then 'PARTIAL'
    when v_failed > 0 then 'FAILED' else 'SUCCESS' end;

  select * into v_config from public.banese_reconciliation_config
  where environment = v_run.environment for update;
  select * into v_profile from public.banese_reconciliation_profiles
  where id = v_config.effective_profile_id;
  v_from_profile := v_config.effective_profile_id;
  v_to_profile := v_from_profile;

  if v_auth_failed > 0 then
    update public.banese_reconciliation_config
    set state = 'SUSPENDED', suspended_reason = 'Falha de autenticação após renovação única do OAuth.',
        cooldown_until = null, updated_at = now()
    where environment = v_run.environment;
    v_decision := 'Circuito suspenso por falha de autenticação.';
  elsif v_throttled > 0 or v_failed > 0 then
    v_to_profile := v_profile.fallback_profile_id;
    update public.banese_reconciliation_config
    set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else selected_profile_id end,
        effective_profile_id = v_to_profile, last_stable_profile_id = v_to_profile,
        state = 'COOLDOWN', stable_since = now(),
        cooldown_until = now() + case when v_throttled > 0 then interval '1 hour' else interval '15 minutes' end,
        suspended_reason = null, updated_at = now()
    where environment = v_run.environment;
    v_decision := case
      when v_throttled > 0 then format('HTTP 429: retorno seguro do P%s para P%s e resfriamento de 1 hora.', v_from_profile, v_to_profile)
      else format('Erro detectado: retorno seguro do P%s para P%s e resfriamento de 15 minutos.', v_from_profile, v_to_profile)
    end;
  elsif v_config.mode = 'AUTOMATIC' and v_checked > 0
    and now() - v_config.stable_since >= interval '1 hour'
    and v_from_profile < 8
  then
    select count(*) into v_sample
    from public.banese_reconciliation_attempts attempt
    join public.banese_reconciliation_runs run on run.id = attempt.run_id
    where run.environment = v_run.environment
      and run.profile_id = v_from_profile
      and attempt.created_at >= v_config.stable_since
      and attempt.result in ('PENDING', 'PAID');
    if v_sample >= greatest(10, v_from_profile * 10) then
      v_to_profile := v_from_profile + 1;
      update public.banese_reconciliation_config
      set effective_profile_id = v_to_profile, last_stable_profile_id = v_from_profile,
          state = 'OBSERVING', stable_since = now(), updated_at = now()
      where environment = v_run.environment;
      v_decision := format('Uma hora sem erros e %s títulos válidos: promoção do P%s para P%s.', v_sample, v_from_profile, v_to_profile);
    else
      v_decision := format('Perfil mantido: %s de %s títulos válidos e uma hora exigida.', v_sample, greatest(10, v_from_profile * 10));
    end if;
  elsif v_config.mode = 'MANUAL' then
    update public.banese_reconciliation_config set state = 'STABLE', updated_at = now()
    where environment = v_run.environment;
  end if;

  update public.banese_reconciliation_runs
  set status = v_status, checked = v_checked, pending = v_pending, paid = v_paid,
      failed = v_failed, throttled = v_throttled > 0,
      oauth_requests = greatest(0, coalesce(p_oauth_requests, 0)),
      oauth_reused = coalesce(p_oauth_reused, false), decision = v_decision,
      duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 300000)),
      finished_at = now()
  where id = p_run_id;
  update public.banese_reconciliation_queue
  set state = 'READY', lease_run_id = null, lease_until = null,
      next_check_at = greatest(coalesce(next_check_at, now()), now() + interval '1 minute'),
      updated_at = now()
  where lease_run_id = p_run_id and state = 'LEASED';

  if v_from_profile <> v_to_profile or v_auth_failed > 0 then
    insert into public.banese_reconciliation_transitions (
      environment, transition_type, from_profile_id, to_profile_id,
      from_mode, to_mode, reason, run_id
    ) values (
      v_run.environment,
      case when v_auth_failed > 0 then 'CIRCUIT_SUSPENDED'
           when v_to_profile < v_from_profile then 'AUTOMATIC_ROLLBACK'
           else 'AUTOMATIC_PROMOTION' end,
      v_from_profile, v_to_profile, v_config.mode, v_config.mode, v_decision, p_run_id
    );
  end if;
  return jsonb_build_object(
    'status', v_status, 'checked', v_checked, 'pending', v_pending,
    'paid', v_paid, 'failed', v_failed, 'decision', v_decision,
    'effectiveProfileId', v_to_profile
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
  v_required := greatest(10, v_config.effective_profile_id * 10);
  v_seconds := greatest(0, extract(epoch from now() - v_config.stable_since)::integer);
  select count(*) into v_valid
  from public.banese_reconciliation_attempts attempt
  join public.banese_reconciliation_runs run on run.id = attempt.run_id
  where run.environment = v_config.environment
    and run.profile_id = v_config.effective_profile_id
    and attempt.created_at >= v_config.stable_since
    and attempt.result in ('PENDING', 'PAID');
  return jsonb_build_object(
    'currentProfileId', v_config.effective_profile_id,
    'nextProfileId', case when v_config.mode = 'AUTOMATIC' and v_config.effective_profile_id < 8 then v_config.effective_profile_id + 1 else null end,
    'validTitles', v_valid, 'requiredTitles', v_required,
    'stableSeconds', v_seconds, 'requiredSeconds', 3600,
    'eligibleToPromote', v_config.mode = 'AUTOMATIC'
      and v_config.effective_profile_id < 8 and v_valid >= v_required and v_seconds >= 3600
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

comment on table public.banese_reconciliation_profiles is
  'Perfis de consulta de títulos existentes: P1-P8 automáticos, P9-P16 testes temporários e P17-P20 aguardando retorno.';
comment on function public.get_banese_reconciliation_autopilot_progress() is
  'Expõe somente contadores sanitizados da promoção automática; execuções vazias não contam como amostra.';
