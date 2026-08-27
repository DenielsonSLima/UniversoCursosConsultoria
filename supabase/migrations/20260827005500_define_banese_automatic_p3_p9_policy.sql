-- Define a faixa automática Banese como P3..P9. Perfis fora da faixa continuam
-- disponíveis no modo manual conforme a política vigente.
begin;

-- O worker bloqueia configuração antes de ler o perfil. Repete essa ordem para
-- evitar inversão de locks enquanto a política é trocada atomicamente.
lock table public.banese_reconciliation_config in exclusive mode;

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_family_policy_check;

update public.banese_reconciliation_profiles
set automatic_selectable = id between 3 and 9
where id between 1 and 20;

alter table public.banese_reconciliation_profiles
  add constraint banese_reconciliation_profiles_family_policy_check check (
    (
      id between 1 and 2
      and group_name = 'CONSERVATIVE'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id between 3 and 8
      and group_name = 'CONSERVATIVE'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id = 9
      and group_name = 'REAL_TEST'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
    or (
      id between 10 and 12
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

comment on constraint banese_reconciliation_profiles_family_policy_check
  on public.banese_reconciliation_profiles is
  'P3-P9 compõem o automático; P1-P2 e P10-P16 são somente manuais; P17-P20 permanecem bloqueados.';

with before as materialized (
  select config.*
  from public.banese_reconciliation_config as config
  where config.mode = 'AUTOMATIC'
    and (
      config.selected_profile_id <> 9
      or config.effective_profile_id not between 3 and 9
      or config.last_stable_profile_id not between 3 and 9
      or config.test_expires_at is not null
    )
  order by config.environment
  for update
), normalized as (
  update public.banese_reconciliation_config as config
  set selected_profile_id = 9,
      effective_profile_id = greatest(3, least(9, before.effective_profile_id)),
      last_stable_profile_id = greatest(3, least(9, before.last_stable_profile_id)),
      stable_since = case
        when before.effective_profile_id between 3 and 9 then before.stable_since
        else now()
      end,
      test_expires_at = null,
      version = before.version + 1,
      updated_at = now()
  from before
  where config.environment = before.environment
  returning
    config.environment,
    before.effective_profile_id as from_profile_id,
    config.effective_profile_id as to_profile_id,
    before.mode as from_mode,
    config.mode as to_mode
)
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
select
  normalized.environment,
  'SYSTEM_POLICY',
  normalized.from_profile_id,
  normalized.to_profile_id,
  normalized.from_mode,
  normalized.to_mode,
  'Política automática Banese ajustada para faixa P3-P9 e teto P9.',
  null
from normalized;

alter table public.banese_reconciliation_config
  drop constraint if exists banese_reconciliation_config_automatic_range_check;
alter table public.banese_reconciliation_config
  add constraint banese_reconciliation_config_automatic_range_check check (
    mode <> 'AUTOMATIC'
    or (
      selected_profile_id = 9
      and effective_profile_id between 3 and 9
      and last_stable_profile_id between 3 and 9
    )
  );

comment on constraint banese_reconciliation_config_automatic_range_check
  on public.banese_reconciliation_config is
  'No automático, o teto configurado é P9 e os perfis efetivo/estável permanecem entre P3 e P9.';

-- Mantém a guarda, a auditoria e o versionamento do RPC administrativo; altera
-- somente teto, início e preservação do perfil dentro da nova faixa.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.update_banese_reconciliation_config(text,integer,bigint,text)'::regprocedure
  );
  v_old_target constant text := $old$  v_target_profile := case when v_mode = 'AUTOMATIC' then 10 else p_profile_id end;$old$;
  v_new_target constant text := $new$  v_target_profile := case when v_mode = 'AUTOMATIC' then 9 else p_profile_id end;$new$;
  v_old_range constant text := $old$      effective_profile_id = case
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
      end,$old$;
  v_new_range constant text := $new$      effective_profile_id = case
        when v_mode = 'MANUAL' then v_target_profile
        when v_mode = 'AUTOMATIC' and v_before.mode = 'AUTOMATIC'
          then greatest(3, least(9, effective_profile_id))
        when v_mode = 'AUTOMATIC' then 3
        else effective_profile_id
      end,
      last_stable_profile_id = case
        when v_mode = 'MANUAL' then v_target_profile
        when v_mode = 'AUTOMATIC' and v_before.mode = 'AUTOMATIC'
          then greatest(3, least(9, last_stable_profile_id))
        when v_mode = 'AUTOMATIC' then 3
        when last_stable_profile_id between 1 and 10 then last_stable_profile_id
        else 8
      end,$new$;
begin
  if position(v_old_target in v_definition) = 0
    or position(v_old_range in v_definition) = 0
  then
    raise exception 'Contrato inesperado em update_banese_reconciliation_config; migration interrompida.';
  end if;
  v_definition := replace(v_definition, v_old_target, v_new_target);
  v_definition := replace(v_definition, v_old_range, v_new_range);
  if position(v_old_target in v_definition) > 0
    or position(v_old_range in v_definition) > 0
  then
    raise exception 'Contrato P10 permaneceu em update_banese_reconciliation_config.';
  end if;
  execute v_definition;
end;
$migration$;

-- Rollback automático respeita o piso P3; rollback manual mantém o fallback
-- cadastrado. Promoções continuam unitárias e param no menor valor entre P9 e o teto.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure
  );
  v_old_rollback constant text := $old$    v_to_profile := case
      when v_from_profile >= 9 then 8
      else v_profile.fallback_profile_id
    end;$old$;
  v_new_rollback constant text := $new$    v_to_profile := case
      when v_config.mode = 'AUTOMATIC' then greatest(
        3,
        least(
          9,
          case
            when v_from_profile >= 9 then 8
            else v_profile.fallback_profile_id
          end
        )
      )
      when v_from_profile >= 9 then 8
      else v_profile.fallback_profile_id
    end;$new$;
  v_old_selected constant text := $old$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end,$old$;
  v_new_selected constant text := $new$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 9 end,$new$;
  v_old_ceiling constant text := $old$    and v_from_profile < 10$old$;
  v_new_ceiling constant text := $new$    and v_from_profile < least(9, v_config.selected_profile_id)$new$;
  v_old_promotion constant text := $old$      v_to_profile := v_from_profile + 1;$old$;
  v_new_promotion constant text := $new$      v_to_profile := least(9, v_config.selected_profile_id, v_from_profile + 1);$new$;
begin
  if (length(v_definition) - length(replace(v_definition, v_old_rollback, ''))) / length(v_old_rollback) <> 2
    or (length(v_definition) - length(replace(v_definition, v_old_selected, ''))) / length(v_old_selected) <> 2
    or position(v_old_ceiling in v_definition) = 0
    or position(v_old_promotion in v_definition) = 0
  then
    raise exception 'Contrato inesperado em finish_banese_reconciliation_run; migration interrompida.';
  end if;
  v_definition := replace(v_definition, v_old_rollback, v_new_rollback);
  v_definition := replace(v_definition, v_old_selected, v_new_selected);
  v_definition := replace(v_definition, v_old_ceiling, v_new_ceiling);
  v_definition := replace(v_definition, v_old_promotion, v_new_promotion);
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.fail_banese_reconciliation_run(uuid,text,text,integer)'::regprocedure
  );
  v_old_rollback constant text := $old$  v_to_profile := case
    when v_run.profile_id >= 9 then 8
    else v_profile.fallback_profile_id
  end;$old$;
  v_new_rollback constant text := $new$  v_to_profile := case
    when v_config.mode = 'AUTOMATIC' then greatest(
      3,
      least(
        9,
        case
          when v_run.profile_id >= 9 then 8
          else v_profile.fallback_profile_id
        end
      )
    )
    when v_run.profile_id >= 9 then 8
    else v_profile.fallback_profile_id
  end;$new$;
  v_old_selected constant text := $old$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end,$old$;
  v_new_selected constant text := $new$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 9 end,$new$;
begin
  if position(v_old_rollback in v_definition) = 0
    or position(v_old_selected in v_definition) = 0
  then
    raise exception 'Contrato inesperado em fail_banese_reconciliation_run; migration interrompida.';
  end if;
  v_definition := replace(v_definition, v_old_rollback, v_new_rollback);
  v_definition := replace(v_definition, v_old_selected, v_new_selected);
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.get_banese_reconciliation_autopilot_progress()'::regprocedure
  );
  v_old_next constant text := $old$      when v_config.mode = 'AUTOMATIC' and v_config.effective_profile_id < 10
        then v_config.effective_profile_id + 1$old$;
  v_new_next constant text := $new$      when v_config.mode = 'AUTOMATIC'
        and v_config.effective_profile_id < least(9, v_config.selected_profile_id)
        then least(9, v_config.selected_profile_id, v_config.effective_profile_id + 1)$new$;
  v_old_eligible constant text := $old$      and v_config.effective_profile_id < 10$old$;
  v_new_eligible constant text := $new$      and v_config.effective_profile_id < least(9, v_config.selected_profile_id)$new$;
begin
  if position(v_old_next in v_definition) = 0
    or position(v_old_eligible in v_definition) = 0
  then
    raise exception 'Contrato inesperado em get_banese_reconciliation_autopilot_progress; migration interrompida.';
  end if;
  v_definition := replace(v_definition, v_old_next, v_new_next);
  v_definition := replace(v_definition, v_old_eligible, v_new_eligible);
  execute v_definition;
end;
$migration$;

-- Altera apenas o retorno de teste manual expirado. O advisory lock, a seleção
-- com SKIP LOCKED e a criação/reserva atômica permanecem na definição vigente.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure
  );
  v_old_expiry constant text := $old$      v_config.effective_profile_id,
      8,
      'MANUAL',
      'AUTOMATIC',
      'Teste temporário expirado; retorno ao P8 com teto automático P10.'
    );

    UPDATE public.banese_reconciliation_config AS config
    SET mode = 'AUTOMATIC',
        selected_profile_id = 10,
        effective_profile_id = 8,
        last_stable_profile_id = 8,$old$;
  v_new_expiry constant text := $new$      v_config.effective_profile_id,
      3,
      'MANUAL',
      'AUTOMATIC',
      'Teste temporário expirado; reinício no P3 com teto automático P9.'
    );

    UPDATE public.banese_reconciliation_config AS config
    SET mode = 'AUTOMATIC',
        selected_profile_id = 9,
        effective_profile_id = 3,
        last_stable_profile_id = 3,$new$;
begin
  if position(v_old_expiry in v_definition) = 0
    or position('pg_catalog.pg_advisory_xact_lock' in v_definition) = 0
    or position('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition) = 0
  then
    raise exception 'Contrato inesperado em prepare_banese_reconciliation_batch_v3; migration interrompida.';
  end if;
  v_definition := replace(v_definition, v_old_expiry, v_new_expiry);
  if position(v_old_expiry in v_definition) > 0 then
    raise exception 'Retorno P8/P10 permaneceu em prepare_banese_reconciliation_batch_v3.';
  end if;
  execute v_definition;
end;
$migration$;

alter function public.update_banese_reconciliation_config(text, integer, bigint, text)
  security definer;
alter function public.update_banese_reconciliation_config(text, integer, bigint, text)
  set search_path = '';
alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  security definer;
alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  set search_path = '';
alter function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  security definer;
alter function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  set search_path = '';
alter function public.get_banese_reconciliation_autopilot_progress()
  security definer;
alter function public.get_banese_reconciliation_autopilot_progress()
  set search_path = '';
alter function public.prepare_banese_reconciliation_batch_v3()
  security invoker;
alter function public.prepare_banese_reconciliation_batch_v3()
  set search_path = '';

revoke all on function public.update_banese_reconciliation_config(text, integer, bigint, text)
  from public, anon, service_role;
grant execute on function public.update_banese_reconciliation_config(text, integer, bigint, text)
  to authenticated;

revoke all on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  to service_role;

revoke all on function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  to service_role;

revoke all on function public.get_banese_reconciliation_autopilot_progress()
  from public, anon;
grant execute on function public.get_banese_reconciliation_autopilot_progress()
  to authenticated, service_role;

revoke all on function public.prepare_banese_reconciliation_batch_v3()
  from public, anon, authenticated;
grant execute on function public.prepare_banese_reconciliation_batch_v3()
  to service_role;

-- Entry points substituídos continuam fechados; a constraint também impede que
-- uma chamada privilegiada antiga restaure P10 no automático.
revoke all on function public.begin_banese_reconciliation_run()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_banese_reconciliation_batch_v2(uuid)
  from public, anon, authenticated, service_role;

comment on function public.get_banese_reconciliation_autopilot_progress() is
  'Exibe a amostra real de promoção automática, limitada à faixa P3-P9.';
comment on function public.prepare_banese_reconciliation_batch_v3() is
  'Reserva atomicamente títulos Banese; teste manual expirado reinicia o automático no P3 com teto P9.';

commit;
