begin;

create table public.portal_realtime_signals (
  id bigint generated always as identity primary key,
  topic text not null check (length(topic) between 1 and 220),
  audience_kind text not null check (
    audience_kind in (
      'GESTOR_ALUNO',
      'PROFESSOR',
      'PROFESSOR_POLO',
      'POLO_CALENDAR'
    )
  ),
  audience_id uuid,
  polo_id uuid,
  created_at timestamptz not null default now(),
  constraint portal_realtime_signals_audience_check check (
    (
      audience_kind in ('GESTOR_ALUNO', 'PROFESSOR')
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
  )
);

create index portal_realtime_signals_topic_id_idx
  on public.portal_realtime_signals (topic, id desc);
create index portal_realtime_signals_created_at_idx
  on public.portal_realtime_signals (created_at);

alter table public.portal_realtime_signals enable row level security;
revoke all on table public.portal_realtime_signals
  from public, anon, authenticated;
revoke all on sequence public.portal_realtime_signals_id_seq
  from public, anon, authenticated;
grant select on table public.portal_realtime_signals to authenticated;

create or replace function public.can_read_portal_realtime_signal(
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
    when 'PROFESSOR' then
      p_audience_id is not null
      and p_audience_id = public.current_professor_id()
    when 'PROFESSOR_POLO' then
      -- A audiência exata continua recebendo o sinal que revoga seu último
      -- vínculo no polo; a consulta canônica então reaplica o escopo atual.
      p_audience_id is not null
      and p_polo_id is not null
      and p_audience_id = public.current_professor_id()
    when 'POLO_CALENDAR' then
      p_polo_id is not null
      and calendar_private.current_professor_can_access_polo(p_polo_id)
    else false
  end;
$function$;

revoke all on function public.can_read_portal_realtime_signal(text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_read_portal_realtime_signal(text, uuid, uuid)
  to authenticated;

create policy portal_realtime_signals_select
on public.portal_realtime_signals
for select
to authenticated
using (
  public.can_read_portal_realtime_signal(
    audience_kind,
    audience_id,
    polo_id
  )
);

create or replace function public.insert_portal_realtime_signal(
  p_topic text,
  p_audience_kind text,
  p_audience_id uuid default null,
  p_polo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_signal_id bigint;
begin
  if p_topic is null then
    return;
  end if;

  insert into public.portal_realtime_signals (
    topic,
    audience_kind,
    audience_id,
    polo_id
  ) values (
    p_topic,
    p_audience_kind,
    p_audience_id,
    p_polo_id
  ) returning id into v_signal_id;

  if v_signal_id % 100 = 0 then
    delete from public.portal_realtime_signals
    where created_at < now() - interval '24 hours';
  end if;
end;
$function$;

revoke all on function public.insert_portal_realtime_signal(
  text, text, uuid, uuid
) from public, anon, authenticated, service_role;

do $block$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'portal_realtime_signals'
  ) then
    alter publication supabase_realtime
      add table public.portal_realtime_signals;
  end if;
end;
$block$;

comment on table public.portal_realtime_signals is
  'Outbox efêmera para ressincronização canônica; payloads de domínio nunca são publicados.';
comment on column public.portal_realtime_signals.topic is
  'Tópico exato e opaco assinado pelo cliente após autorização RLS da audiência estável.';

commit;
