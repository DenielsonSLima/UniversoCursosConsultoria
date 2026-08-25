begin;

alter table public.portal_realtime_signals
  drop constraint portal_realtime_signals_audience_kind_check;
alter table public.portal_realtime_signals
  add constraint portal_realtime_signals_audience_kind_check check (
    audience_kind in (
      'GESTOR_ALUNO',
      'ALUNO',
      'PROFESSOR',
      'PROFESSOR_POLO',
      'POLO_CALENDAR'
    )
  );

alter table public.portal_realtime_signals
  drop constraint portal_realtime_signals_audience_check;
alter table public.portal_realtime_signals
  add constraint portal_realtime_signals_audience_check check (
    (
      audience_kind in ('GESTOR_ALUNO', 'ALUNO', 'PROFESSOR')
      and audience_id is not null
      and polo_id is null
    )
    or (
      audience_kind = 'PROFESSOR_POLO'
      and audience_id is not null
      and polo_id is not null
    )
    or (
      audience_kind = 'POLO_CALENDAR'
      and audience_id is null
      and polo_id is not null
    )
  );

create or replace function portal_private.can_read_portal_realtime_signal(
  p_audience_kind text,
  p_audience_id uuid,
  p_polo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case p_audience_kind
    when 'GESTOR_ALUNO' then
      p_audience_id is not null
      and exists (
        select 1
        from public.parceiros partner
        where partner.id = p_audience_id
          and upper(coalesce(partner.tipo, '')) = 'ALUNO'
          and public.is_partner_in_gestor_read_scope(
            partner.polo_id,
            partner.polo_ids
          )
      )
    when 'ALUNO' then
      p_audience_id is not null
      and p_audience_id = public.current_aluno_id()
    when 'PROFESSOR' then
      p_audience_id is not null
      and p_audience_id = public.current_professor_id()
    when 'PROFESSOR_POLO' then
      p_audience_id is not null
      and p_polo_id is not null
      and p_audience_id = public.current_professor_id()
    when 'POLO_CALENDAR' then
      p_polo_id is not null
      and calendar_private.current_professor_can_access_polo(p_polo_id)
    else false
  end;
$function$;

alter function portal_private.can_read_portal_realtime_signal(text, uuid, uuid)
  security definer
  set search_path = '';
revoke all on function portal_private.can_read_portal_realtime_signal(
  text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function portal_private.can_read_portal_realtime_signal(
  text, uuid, uuid
) to authenticated;

create or replace function public.emit_portal_student_direct_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_aluno_id uuid;
  v_new_aluno_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_aluno_id := old.aluno_id;
    perform public.insert_portal_realtime_signal(
      'portal:gestor:aluno:' || v_old_aluno_id::text || ':' || tg_argv[0],
      'GESTOR_ALUNO',
      v_old_aluno_id
    );
    if tg_argv[0] = 'matricula' then
      perform public.insert_portal_realtime_signal(
        'portal:aluno:' || v_old_aluno_id::text || ':acesso',
        'ALUNO',
        v_old_aluno_id
      );
    end if;
  end if;

  if tg_op <> 'DELETE' then
    v_new_aluno_id := new.aluno_id;
    if tg_op = 'INSERT' or v_new_aluno_id is distinct from v_old_aluno_id then
      perform public.insert_portal_realtime_signal(
        'portal:gestor:aluno:' || v_new_aluno_id::text || ':' || tg_argv[0],
        'GESTOR_ALUNO',
        v_new_aluno_id
      );
      if tg_argv[0] = 'matricula' then
        perform public.insert_portal_realtime_signal(
          'portal:aluno:' || v_new_aluno_id::text || ':acesso',
          'ALUNO',
          v_new_aluno_id
        );
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_student_release_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_aluno_id uuid;
  v_new_aluno_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_aluno_id := old.aluno_id;
    perform public.insert_portal_realtime_signal(
      'portal:gestor:aluno:' || v_old_aluno_id::text || ':matricula',
      'GESTOR_ALUNO',
      v_old_aluno_id
    );
    perform public.insert_portal_realtime_signal(
      'portal:aluno:' || v_old_aluno_id::text || ':acesso',
      'ALUNO',
      v_old_aluno_id
    );
  end if;

  if tg_op <> 'DELETE' then
    v_new_aluno_id := new.aluno_id;
    if tg_op = 'INSERT' or v_new_aluno_id is distinct from v_old_aluno_id then
      perform public.insert_portal_realtime_signal(
        'portal:gestor:aluno:' || v_new_aluno_id::text || ':matricula',
        'GESTOR_ALUNO',
        v_new_aluno_id
      );
      perform public.insert_portal_realtime_signal(
        'portal:aluno:' || v_new_aluno_id::text || ':acesso',
        'ALUNO',
        v_new_aluno_id
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function public.emit_portal_student_direct_signal()
  from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_student_release_signal()
  from public, anon, authenticated, service_role;

comment on function portal_private.can_read_portal_realtime_signal(
  text, uuid, uuid
) is
  'Autoriza sinais mínimos por identidade canônica de Gestor, Aluno ou Professor.';

notify pgrst, 'reload schema';

commit;
