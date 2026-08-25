begin;

create or replace function public.emit_portal_calendar_scope_signal(
  p_visibility text,
  p_professor_id uuid,
  p_turma_id uuid,
  p_polo_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment record;
begin
  if p_polo_id is null then return; end if;

  if p_visibility = 'GENERAL' then
    perform public.insert_portal_realtime_signal(
      'portal:professor:calendar:polo:' || p_polo_id::text || ':general',
      'POLO_CALENDAR',
      null,
      p_polo_id
    );
  elsif p_visibility in ('PROFESSOR', 'PERSONAL') then
    if p_professor_id is not null then
      perform public.insert_portal_realtime_signal(
        'portal:professor:' || p_professor_id::text
          || ':polo:' || p_polo_id::text || ':calendar',
        'PROFESSOR_POLO',
        p_professor_id,
        p_polo_id
      );
    end if;
  elsif p_visibility = 'TURMA' and p_turma_id is not null then
    for v_assignment in
      select distinct assignment.professor_id
      from public.turmas_disciplinas assignment
      where assignment.turma_id = p_turma_id
        and assignment.professor_id is not null
    loop
      perform public.insert_portal_realtime_signal(
        'portal:professor:' || v_assignment.professor_id::text
          || ':polo:' || p_polo_id::text || ':calendar',
        'PROFESSOR_POLO',
        v_assignment.professor_id,
        p_polo_id
      );
    end loop;
  end if;
end;
$function$;

create or replace function public.emit_portal_calendar_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' then
    perform public.emit_portal_calendar_scope_signal(
      old.visibility,
      old.professor_id,
      old.turma_id,
      old.polo_id
    );
  end if;

  if tg_op <> 'DELETE'
    and (
      tg_op = 'INSERT'
      or new.visibility is distinct from old.visibility
      or new.professor_id is distinct from old.professor_id
      or new.turma_id is distinct from old.turma_id
      or new.polo_id is distinct from old.polo_id
    ) then
    perform public.emit_portal_calendar_scope_signal(
      new.visibility,
      new.professor_id,
      new.turma_id,
      new.polo_id
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_chat_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
    and upper(coalesce(old.remetente_tipo, '')) = 'PROFESSOR' then
    perform public.insert_portal_realtime_signal(
      'portal:comunicacao:professor:' || old.remetente_id::text || ':chats',
      'PROFESSOR',
      old.remetente_id
    );
    if tg_op = 'DELETE' then
      perform public.insert_portal_realtime_signal(
        'portal:comunicacao:professor:' || old.remetente_id::text
          || ':chat:' || old.id::text,
        'PROFESSOR',
        old.remetente_id
      );
    end if;
  end if;

  if tg_op <> 'DELETE'
    and upper(coalesce(new.remetente_tipo, '')) = 'PROFESSOR'
    and (
      tg_op = 'INSERT'
      or new.remetente_id is distinct from old.remetente_id
      or new.remetente_tipo is distinct from old.remetente_tipo
    ) then
    perform public.insert_portal_realtime_signal(
      'portal:comunicacao:professor:' || new.remetente_id::text || ':chats',
      'PROFESSOR',
      new.remetente_id
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.emit_portal_message_for_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_professor_id uuid;
begin
  select chat.remetente_id into v_professor_id
  from public.comunicacao_chats chat
  where chat.id = p_chat_id
    and upper(coalesce(chat.remetente_tipo, '')) = 'PROFESSOR';

  if v_professor_id is null then return; end if;
  perform public.insert_portal_realtime_signal(
    'portal:comunicacao:professor:' || v_professor_id::text
      || ':chat:' || p_chat_id::text,
    'PROFESSOR',
    v_professor_id
  );
end;
$function$;

create or replace function public.emit_portal_message_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' then
    perform public.emit_portal_message_for_chat(old.chat_id);
  end if;
  if tg_op <> 'DELETE'
    and (tg_op = 'INSERT' or new.chat_id is distinct from old.chat_id) then
    perform public.emit_portal_message_for_chat(new.chat_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists portal_signal_calendar_events on public.calendar_events;
create trigger portal_signal_calendar_events before insert or update or delete
on public.calendar_events for each row
execute function public.emit_portal_calendar_signal();

drop trigger if exists portal_signal_comunicacao_chats on public.comunicacao_chats;
create trigger portal_signal_comunicacao_chats before insert or update or delete
on public.comunicacao_chats for each row
execute function public.emit_portal_chat_signal();

drop trigger if exists portal_signal_comunicacao_mensagens on public.comunicacao_mensagens;
create trigger portal_signal_comunicacao_mensagens before insert or update or delete
on public.comunicacao_mensagens for each row
execute function public.emit_portal_message_signal();

revoke all on function public.emit_portal_calendar_scope_signal(text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_calendar_signal()
  from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_chat_signal()
  from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_message_for_chat(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.emit_portal_message_signal()
  from public, anon, authenticated, service_role;

commit;
