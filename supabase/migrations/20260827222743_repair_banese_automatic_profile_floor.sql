-- Repara o drift do piloto automatico Banese sem alterar a politica manual
-- posterior dos perfis P17..P20. A faixa automatica permanece P3..P9.
begin;

lock table public.banese_reconciliation_config in exclusive mode;

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
  'Drift reparado: faixa automatica Banese restaurada em P3-P9.',
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
  if position(v_old_target in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_target, v_new_target);
  elsif position(v_new_target in v_definition) = 0 then
    raise exception 'Contrato inesperado no teto automatico do RPC administrativo.';
  end if;
  if position(v_old_range in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_range, v_new_range);
  elsif position(v_new_range in v_definition) = 0 then
    raise exception 'Contrato inesperado na faixa automatica do RPC administrativo.';
  end if;
  execute v_definition;
end;
$migration$;

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
  if position(v_old_rollback in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_rollback, v_new_rollback);
  elsif position(v_new_rollback in v_definition) = 0 then
    raise exception 'Contrato inesperado no rollback de finalizacao Banese.';
  end if;
  if position(v_old_selected in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_selected, v_new_selected);
  elsif position(v_new_selected in v_definition) = 0 then
    raise exception 'Contrato inesperado no teto de finalizacao Banese.';
  end if;
  if position(v_old_ceiling in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_ceiling, v_new_ceiling);
  elsif position(v_new_ceiling in v_definition) = 0 then
    raise exception 'Contrato inesperado na promocao de finalizacao Banese.';
  end if;
  if position(v_old_promotion in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_promotion, v_new_promotion);
  elsif position(v_new_promotion in v_definition) = 0 then
    raise exception 'Contrato inesperado no incremento de perfil Banese.';
  end if;
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
  if position(v_old_rollback in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_rollback, v_new_rollback);
  elsif position(v_new_rollback in v_definition) = 0 then
    raise exception 'Contrato inesperado no rollback de falha Banese.';
  end if;
  if position(v_old_selected in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_selected, v_new_selected);
  elsif position(v_new_selected in v_definition) = 0 then
    raise exception 'Contrato inesperado no teto de falha Banese.';
  end if;
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
  if position(v_old_next in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_next, v_new_next);
  elsif position(v_new_next in v_definition) = 0 then
    raise exception 'Contrato inesperado no proximo perfil automatico Banese.';
  end if;
  if position(v_old_eligible in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_eligible, v_new_eligible);
  elsif position(v_new_eligible in v_definition) = 0 then
    raise exception 'Contrato inesperado na elegibilidade automatica Banese.';
  end if;
  execute v_definition;
end;
$migration$;

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
  if position(v_old_expiry in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_expiry, v_new_expiry);
  elsif position(v_new_expiry in v_definition) = 0 then
    raise exception 'Contrato inesperado na expiracao de teste Banese.';
  end if;
  if position('pg_catalog.pg_advisory_xact_lock' in v_definition) = 0
    or position('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition) = 0
  then
    raise exception 'Guardas atomicas ausentes em prepare_banese_reconciliation_batch_v3.';
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

revoke all on function public.begin_banese_reconciliation_run()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_banese_reconciliation_batch_v2(uuid)
  from public, anon, authenticated, service_role;

do $migration$
begin
  if exists (
    select 1
    from public.banese_reconciliation_config as config
    where config.mode = 'AUTOMATIC'
      and (
        config.selected_profile_id <> 9
        or config.effective_profile_id not between 3 and 9
        or config.last_stable_profile_id not between 3 and 9
      )
  ) then
    raise exception 'Faixa automatica Banese permaneceu fora de P3-P9.';
  end if;
end;
$migration$;

commit;
