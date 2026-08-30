-- Limita o piloto automático Banese a P3..P6 sem alterar o perfil efetivo,
-- estabilidade, cooldown ou qualquer estado financeiro dos títulos.
begin;

-- Mantém a mesma ordem de lock usada pelo worker antes de consultar perfis.
lock table public.banese_reconciliation_config in exclusive mode;

do $preflight$
begin
  if not exists (
    select 1
    from public.banese_reconciliation_profiles
    where id = 6
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
  ) then
    raise exception 'Perfil P6 automático não está disponível; migration interrompida.';
  end if;

  if exists (
    select 1
    from public.banese_reconciliation_config
    where mode = 'AUTOMATIC'
      and (
        effective_profile_id not between 3 and 6
        or last_stable_profile_id not between 3 and 6
      )
  ) then
    raise exception 'Há perfil automático efetivo ou estável fora de P3..P6; migration interrompida sem rebaixamento silencioso.';
  end if;
end;
$preflight$;

alter table public.banese_reconciliation_profiles
  drop constraint if exists banese_reconciliation_profiles_family_policy_check;

update public.banese_reconciliation_profiles
set
  automatic_selectable = id between 3 and 6,
  source_note = case
    when id = 6 then 'Teto do Piloto Automático em regime moderado e controlado.'
    when id = 9 then 'Teste manual temporário de alto desempenho.'
    else source_note
  end
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
      id between 3 and 6
      and group_name = 'CONSERVATIVE'
      and selectable
      and automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id between 7 and 8
      and group_name = 'CONSERVATIVE'
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is null
    )
    or (
      id between 9 and 12
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
      and selectable
      and not automatic_selectable
      and queue_strategy = 'GENERAL'
      and test_duration_minutes is not null
    )
  );

comment on constraint banese_reconciliation_profiles_family_policy_check
  on public.banese_reconciliation_profiles is
  'P3-P6 compõem o automático; P1-P2 e P7-P20 permanecem disponíveis somente no modo manual.';

comment on table public.banese_reconciliation_profiles is
  'Perfis de consulta Banese: P3-P6 automáticos; os demais perfis selecionáveis operam somente em modo manual.';

alter table public.banese_reconciliation_config
  drop constraint if exists banese_reconciliation_config_automatic_range_check;

with before as materialized (
  select config.*
  from public.banese_reconciliation_config as config
  where config.mode = 'AUTOMATIC'
    and config.selected_profile_id <> 6
  order by config.environment
  for update
), changed as (
  update public.banese_reconciliation_config as config
  set selected_profile_id = 6,
      version = before.version + 1,
      updated_at = now()
  from before
  where config.environment = before.environment
  returning
    config.environment,
    before.effective_profile_id,
    before.mode
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
  changed.environment,
  'SYSTEM_POLICY',
  changed.effective_profile_id,
  changed.effective_profile_id,
  changed.mode,
  changed.mode,
  'Teto automático Banese reduzido de P9 para P6 sem alterar o perfil efetivo.',
  null
from changed;

alter table public.banese_reconciliation_config
  add constraint banese_reconciliation_config_automatic_range_check check (
    mode <> 'AUTOMATIC'
    or (
      selected_profile_id = 6
      and effective_profile_id between 3 and 6
      and last_stable_profile_id between 3 and 6
    )
  );

comment on constraint banese_reconciliation_config_automatic_range_check
  on public.banese_reconciliation_config is
  'No automático, P3 é o piso e P6 é o teto fixo; o perfil efetivo avança gradualmente dentro da faixa.';

do $patch_update_config$
declare
  v_definition text := pg_get_functiondef(
    'public.update_banese_reconciliation_config(text,integer,bigint,text)'::regprocedure
  );
  v_old_target constant text := $old$v_target_profile := case when v_mode = 'AUTOMATIC' then 9 else p_profile_id end;$old$;
  v_new_target constant text := $new$v_target_profile := case when v_mode = 'AUTOMATIC' then 6 else p_profile_id end;$new$;
  v_old_effective constant text := $old$greatest(3, least(9, effective_profile_id))$old$;
  v_new_effective constant text := $new$greatest(3, least(6, effective_profile_id))$new$;
  v_old_stable constant text := $old$greatest(3, least(9, last_stable_profile_id))$old$;
  v_new_stable constant text := $new$greatest(3, least(6, last_stable_profile_id))$new$;
  v_hits integer;
begin
  v_hits := (length(v_definition) - length(replace(v_definition, v_old_target, ''))) / length(v_old_target);
  if v_hits = 1 then
    v_definition := replace(v_definition, v_old_target, v_new_target);
  elsif v_hits <> 0 or position(v_new_target in v_definition) = 0 then
    raise exception 'Contrato inesperado no teto do RPC administrativo Banese.';
  end if;

  v_hits := (length(v_definition) - length(replace(v_definition, v_old_effective, ''))) / length(v_old_effective);
  if v_hits = 1 then
    v_definition := replace(v_definition, v_old_effective, v_new_effective);
  elsif v_hits <> 0 or position(v_new_effective in v_definition) = 0 then
    raise exception 'Contrato inesperado no limite efetivo do RPC administrativo Banese.';
  end if;

  v_hits := (length(v_definition) - length(replace(v_definition, v_old_stable, ''))) / length(v_old_stable);
  if v_hits = 1 then
    v_definition := replace(v_definition, v_old_stable, v_new_stable);
  elsif v_hits <> 0 or position(v_new_stable in v_definition) = 0 then
    raise exception 'Contrato inesperado no limite estável do RPC administrativo Banese.';
  end if;

  execute v_definition;
end;
$patch_update_config$;

do $patch_finish$
declare
  v_definition text := pg_get_functiondef(
    'public.finish_banese_reconciliation_run(uuid,integer,boolean,integer)'::regprocedure
  );
  v_old_selected constant text := $old$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 9 end,$old$;
  v_new_selected constant text := $new$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 6 end,$new$;
  v_old_ceiling constant text := $old$v_from_profile < least(9, v_config.selected_profile_id)$old$;
  v_new_ceiling constant text := $new$v_from_profile < least(6, v_config.selected_profile_id)$new$;
  v_old_promotion constant text := $old$v_to_profile := least(9, v_config.selected_profile_id, v_from_profile + 1);$old$;
  v_new_promotion constant text := $new$v_to_profile := least(6, v_config.selected_profile_id, v_from_profile + 1);$new$;
  v_hits integer;
begin
  v_hits := (length(v_definition) - length(replace(v_definition, v_old_selected, ''))) / length(v_old_selected);
  if v_hits = 2 then
    v_definition := replace(v_definition, v_old_selected, v_new_selected);
  elsif v_hits <> 0 or (
    length(v_definition) - length(replace(v_definition, v_new_selected, ''))
  ) / length(v_new_selected) <> 2 then
    raise exception 'Contrato inesperado nos fallbacks da finalização Banese.';
  end if;

  if position(v_old_ceiling in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_ceiling, v_new_ceiling);
  elsif position(v_new_ceiling in v_definition) = 0 then
    raise exception 'Contrato inesperado no teto da promoção Banese.';
  end if;

  if position(v_old_promotion in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_promotion, v_new_promotion);
  elsif position(v_new_promotion in v_definition) = 0 then
    raise exception 'Contrato inesperado no incremento automático Banese.';
  end if;

  execute v_definition;
end;
$patch_finish$;

do $patch_fail$
declare
  v_definition text := pg_get_functiondef(
    'public.fail_banese_reconciliation_run(uuid,text,text,integer)'::regprocedure
  );
  v_old_selected constant text := $old$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 9 end,$old$;
  v_new_selected constant text := $new$set selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 6 end,$new$;
  v_hits integer;
begin
  v_hits := (length(v_definition) - length(replace(v_definition, v_old_selected, ''))) / length(v_old_selected);
  if v_hits = 1 then
    v_definition := replace(v_definition, v_old_selected, v_new_selected);
  elsif v_hits <> 0 or position(v_new_selected in v_definition) = 0 then
    raise exception 'Contrato inesperado no fallback de falha Banese.';
  end if;

  execute v_definition;
end;
$patch_fail$;

do $patch_progress$
declare
  v_definition text := pg_get_functiondef(
    'public.get_banese_reconciliation_autopilot_progress()'::regprocedure
  );
  v_old_ceiling constant text := $old$least(9, v_config.selected_profile_id)$old$;
  v_new_ceiling constant text := $new$least(6, v_config.selected_profile_id)$new$;
  v_old_next constant text := $old$least(9, v_config.selected_profile_id, v_config.effective_profile_id + 1)$old$;
  v_new_next constant text := $new$least(6, v_config.selected_profile_id, v_config.effective_profile_id + 1)$new$;
  v_hits integer;
begin
  v_hits := (length(v_definition) - length(replace(v_definition, v_old_ceiling, ''))) / length(v_old_ceiling);
  if v_hits = 2 then
    v_definition := replace(v_definition, v_old_ceiling, v_new_ceiling);
  elsif v_hits <> 0 or (
    length(v_definition) - length(replace(v_definition, v_new_ceiling, ''))
  ) / length(v_new_ceiling) <> 2 then
    raise exception 'Contrato inesperado no progresso automático Banese.';
  end if;

  if position(v_old_next in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_next, v_new_next);
  elsif position(v_new_next in v_definition) = 0 then
    raise exception 'Contrato inesperado no próximo perfil automático Banese.';
  end if;

  execute v_definition;
end;
$patch_progress$;

do $patch_prepare$
declare
  v_definition text := pg_get_functiondef(
    'public.prepare_banese_reconciliation_batch_v3()'::regprocedure
  );
  v_old_selected constant text := $old$selected_profile_id = 9,$old$;
  v_new_selected constant text := $new$selected_profile_id = 6,$new$;
  v_old_reason constant text := $old$teto automático P9$old$;
  v_new_reason constant text := $new$teto automático P6$new$;
  v_hits integer;
begin
  v_hits := (length(v_definition) - length(replace(v_definition, v_old_selected, ''))) / length(v_old_selected);
  if v_hits = 1 then
    v_definition := replace(v_definition, v_old_selected, v_new_selected);
  elsif v_hits <> 0 or position(v_new_selected in v_definition) = 0 then
    raise exception 'Contrato inesperado no retorno automático do worker Banese.';
  end if;

  if position(v_old_reason in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_reason, v_new_reason);
  elsif position(v_new_reason in v_definition) = 0 then
    raise exception 'Contrato inesperado no motivo do retorno automático Banese.';
  end if;

  execute v_definition;
end;
$patch_prepare$;

alter function public.update_banese_reconciliation_config(text, integer, bigint, text)
  owner to postgres;
alter function public.update_banese_reconciliation_config(text, integer, bigint, text)
  security definer;
alter function public.update_banese_reconciliation_config(text, integer, bigint, text)
  set search_path = '';
revoke all on function public.update_banese_reconciliation_config(text, integer, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_banese_reconciliation_config(text, integer, bigint, text)
  to authenticated;

alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  owner to postgres;
alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  security definer;
alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  set search_path = '';
alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  set lock_timeout = '2s';
alter function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  set statement_timeout = '7s';
revoke all on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_banese_reconciliation_run(uuid, integer, boolean, integer)
  to service_role;

alter function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  owner to postgres;
alter function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  security definer;
alter function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  set search_path = '';
revoke all on function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_banese_reconciliation_run(uuid, text, text, integer)
  to service_role;

alter function public.get_banese_reconciliation_autopilot_progress()
  owner to postgres;
alter function public.get_banese_reconciliation_autopilot_progress()
  security definer;
alter function public.get_banese_reconciliation_autopilot_progress()
  set search_path = '';
revoke all on function public.get_banese_reconciliation_autopilot_progress()
  from public, anon, authenticated, service_role;
grant execute on function public.get_banese_reconciliation_autopilot_progress()
  to authenticated, service_role;

alter function public.prepare_banese_reconciliation_batch_v3()
  owner to postgres;
alter function public.prepare_banese_reconciliation_batch_v3()
  security invoker;
alter function public.prepare_banese_reconciliation_batch_v3()
  set search_path = '';
alter function public.prepare_banese_reconciliation_batch_v3()
  set lock_timeout = '2s';
alter function public.prepare_banese_reconciliation_batch_v3()
  set statement_timeout = '7s';
revoke all on function public.prepare_banese_reconciliation_batch_v3()
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_banese_reconciliation_batch_v3()
  to service_role;

do $verify$
begin
  if exists (
    select 1
    from public.banese_reconciliation_config
    where mode = 'AUTOMATIC'
      and (
        selected_profile_id <> 6
        or effective_profile_id not between 3 and 6
        or last_stable_profile_id not between 3 and 6
      )
  ) then
    raise exception 'Invariante final P3..P6 não foi satisfeita.';
  end if;

  if exists (
    select 1
    from public.banese_reconciliation_profiles
    where (id between 3 and 6 and not automatic_selectable)
       or (id between 7 and 9 and automatic_selectable)
  ) then
    raise exception 'Elegibilidade automática dos perfis não corresponde a P3..P6.';
  end if;
end;
$verify$;

commit;
