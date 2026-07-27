-- Falha OAuth também deve recuar o perfil efetivo antes de suspender o circuito.

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
    v_to_profile := case
      when v_from_profile >= 9 then 8
      else v_profile.fallback_profile_id
    end;
    update public.banese_reconciliation_config
    set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end,
        effective_profile_id = v_to_profile,
        last_stable_profile_id = v_to_profile,
        state = 'SUSPENDED',
        suspended_reason = 'Falha de autenticação após renovação única do OAuth.',
        cooldown_until = null,
        stable_since = now(),
        test_expires_at = null,
        version = version + 1,
        updated_at = now()
    where environment = v_run.environment and version = v_run.config_version;
    v_decision := format(
      'Circuito suspenso por falha de autenticação e retorno do P%s para P%s.',
      v_from_profile, v_to_profile
    );
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

revoke all on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  to service_role;
