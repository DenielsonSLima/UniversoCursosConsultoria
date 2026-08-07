begin;

create table if not exists public.aluno_notificacoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  source_job_id uuid unique references public.push_notification_jobs(id) on delete set null,
  source_type text not null,
  category text not null,
  title text not null,
  body text not null,
  deep_link text not null,
  visible_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aluno_notificacoes_source_type_check
    check (source_type in ('campaign', 'financial', 'academic', 'calendar', 'institutional')),
  constraint aluno_notificacoes_category_check
    check (category in ('service', 'financial', 'academic', 'calendar', 'institutional', 'marketing')),
  constraint aluno_notificacoes_title_length
    check (char_length(btrim(title)) between 1 and 80),
  constraint aluno_notificacoes_body_length
    check (char_length(btrim(body)) between 1 and 180),
  constraint aluno_notificacoes_deep_link_check
    check (deep_link ~ '^/aluno(?:/|$)'),
  constraint aluno_notificacoes_read_after_creation
    check (read_at is null or read_at >= created_at),
  constraint aluno_notificacoes_archive_after_creation
    check (archived_at is null or archived_at >= created_at)
);

comment on table public.aluno_notificacoes is
  'Caixa de entrada persistente de avisos do aluno. Conversas permanecem em comunicacao_chats e nao sao duplicadas aqui.';

create index if not exists idx_aluno_notificacoes_feed
  on public.aluno_notificacoes (aluno_id, visible_at desc, id desc)
  where archived_at is null;

create index if not exists idx_aluno_notificacoes_unread
  on public.aluno_notificacoes (aluno_id, visible_at desc)
  where read_at is null and archived_at is null;

create index if not exists idx_aluno_notificacoes_category
  on public.aluno_notificacoes (aluno_id, category, visible_at desc)
  where archived_at is null;

alter table public.aluno_notificacoes enable row level security;

revoke all on table public.aluno_notificacoes from public, anon, authenticated;
grant select on table public.aluno_notificacoes to authenticated;

drop policy if exists aluno_notificacoes_select_own on public.aluno_notificacoes;
create policy aluno_notificacoes_select_own
on public.aluno_notificacoes
for select
to authenticated
using (aluno_id = (select public.current_aluno_id()));

drop trigger if exists aluno_notificacoes_touch on public.aluno_notificacoes;
create trigger aluno_notificacoes_touch
before update on public.aluno_notificacoes
for each row execute function public.push_notification_touch_updated_at();

create or replace function public.sync_aluno_notificacao_from_push_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_type = 'chat' or new.category = 'chat' then
    return new;
  end if;

  insert into public.aluno_notificacoes (
    aluno_id,
    source_job_id,
    source_type,
    category,
    title,
    body,
    deep_link,
    visible_at,
    created_at
  )
  values (
    new.aluno_id,
    new.id,
    new.source_type,
    new.category,
    new.title,
    new.body,
    new.deep_link,
    greatest(new.available_at, new.created_at),
    new.created_at
  )
  on conflict (source_job_id) do nothing;

  return new;
end;
$$;

revoke all on function public.sync_aluno_notificacao_from_push_job()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_sync_aluno_inbox
on public.push_notification_jobs;

create trigger push_notification_jobs_sync_aluno_inbox
after insert on public.push_notification_jobs
for each row execute function public.sync_aluno_notificacao_from_push_job();

insert into public.aluno_notificacoes (
  aluno_id,
  source_job_id,
  source_type,
  category,
  title,
  body,
  deep_link,
  visible_at,
  created_at
)
select
  job.aluno_id,
  job.id,
  job.source_type,
  job.category,
  job.title,
  job.body,
  job.deep_link,
  greatest(job.available_at, job.created_at),
  job.created_at
from public.push_notification_jobs job
where job.source_type <> 'chat'
  and job.category <> 'chat'
on conflict (source_job_id) do nothing;

create or replace function public.aluno_notificacao_marcar_lida(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  update public.aluno_notificacoes
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and aluno_id = v_aluno_id
    and archived_at is null;

  return found;
end;
$$;

create or replace function public.aluno_notificacoes_marcar_todas_lidas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_updated integer := 0;
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  update public.aluno_notificacoes
  set read_at = now()
  where aluno_id = v_aluno_id
    and read_at is null
    and archived_at is null
    and visible_at <= now();

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.aluno_notificacao_arquivar(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
begin
  if v_aluno_id is null then
    raise exception 'ALUNO_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  update public.aluno_notificacoes
  set archived_at = coalesce(archived_at, now()),
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and aluno_id = v_aluno_id;

  return found;
end;
$$;

revoke all on function public.aluno_notificacao_marcar_lida(uuid)
from public, anon, authenticated;
revoke all on function public.aluno_notificacoes_marcar_todas_lidas()
from public, anon, authenticated;
revoke all on function public.aluno_notificacao_arquivar(uuid)
from public, anon, authenticated;

grant execute on function public.aluno_notificacao_marcar_lida(uuid)
to authenticated;
grant execute on function public.aluno_notificacoes_marcar_todas_lidas()
to authenticated;
grant execute on function public.aluno_notificacao_arquivar(uuid)
to authenticated;

create or replace function public.enqueue_payment_confirmation_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean := false;
  v_new_paid boolean;
  v_old_paid boolean;
begin
  if new.cliente_id is null then
    return new;
  end if;

  v_new_paid := new.data_pagamento is not null
    or upper(coalesce(new.status, '')) in ('PAGO', 'RECEBIDO', 'RECEBIDA');
  v_old_paid := old.data_pagamento is not null
    or upper(coalesce(old.status, '')) in ('PAGO', 'RECEBIDO', 'RECEBIDA');

  if not v_new_paid or v_old_paid then
    return new;
  end if;

  select policy.enabled
      and coalesce((policy.categories ->> 'financial')::boolean, false)
  into v_allowed
  from public.push_notification_policies policy
  where policy.id is true;

  if not coalesce(v_allowed, false) then
    return new;
  end if;

  insert into public.push_notification_jobs (
    source_type,
    source_id,
    category,
    aluno_id,
    title,
    body,
    deep_link,
    data,
    idempotency_key
  )
  values (
    'financial',
    new.id,
    'financial',
    new.cliente_id,
    'Pagamento confirmado',
    'Recebemos seu pagamento. Consulte os detalhes no Financeiro do app.',
    '/aluno/?module=financeiro',
    jsonb_build_object(
      'receivable_id', new.id,
      'event', 'payment_confirmed',
      'collapse_key', 'financial:' || new.id::text
    ),
    'financial:payment-confirmed:' || new.id::text
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_payment_confirmation_push_notification()
from public, anon, authenticated;

drop trigger if exists contas_receber_enqueue_payment_confirmation_push
on public.contas_receber;

create trigger contas_receber_enqueue_payment_confirmation_push
after update of data_pagamento, status on public.contas_receber
for each row execute function public.enqueue_payment_confirmation_push_notification();

create or replace function public.enqueue_scheduled_push_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_policy public.push_notification_policies%rowtype;
  v_today date := timezone('America/Maceio', now())::date;
  v_financial integer := 0;
  v_academic integer := 0;
  v_calendar integer := 0;
  v_birthday integer := 0;
begin
  select * into v_policy
  from public.push_notification_policies
  where id is true;

  if not found or not v_policy.enabled then
    return jsonb_build_object(
      'enabled', false,
      'financial', 0,
      'academic', 0,
      'calendar', 0,
      'birthday', 0
    );
  end if;

  if coalesce((v_policy.categories ->> 'financial')::boolean, false) then
    insert into public.push_notification_jobs (
      source_type,
      source_id,
      category,
      aluno_id,
      title,
      body,
      deep_link,
      data,
      idempotency_key
    )
    select
      'financial',
      receivable.id,
      'financial',
      receivable.cliente_id,
      reminder.title,
      reminder.body,
      '/aluno/?module=financeiro',
      jsonb_build_object(
        'receivable_id', receivable.id,
        'days_before_due', reminder.days_before_due,
        'event', 'payment_due',
        'collapse_key', 'financial:' || receivable.id::text
      ),
      format(
        'financial:due:%s:%s:%s',
        receivable.id,
        receivable.data_vencimento,
        reminder.days_before_due
      )
    from public.contas_receber receivable
    cross join (
      values
        (3, 'Lembrete de vencimento'::text, 'Você tem uma cobrança com vencimento em 3 dias. Consulte o Financeiro no app.'::text),
        (0, 'Vencimento hoje'::text, 'Você tem uma cobrança com vencimento hoje. Consulte o Financeiro no app.'::text)
    ) as reminder(days_before_due, title, body)
    where receivable.cliente_id is not null
      and receivable.data_pagamento is null
      and receivable.data_vencimento = v_today + reminder.days_before_due
      and upper(coalesce(receivable.status, '')) not in ('PAGO', 'CANCELADO', 'CANCELADA', 'RECEBIDO')
    on conflict (idempotency_key) do nothing;

    get diagnostics v_financial = row_count;
  end if;

  if coalesce((v_policy.categories ->> 'academic')::boolean, false) then
    insert into public.push_notification_jobs (
      source_type,
      source_id,
      category,
      aluno_id,
      title,
      body,
      deep_link,
      data,
      idempotency_key
    )
    select
      'academic',
      class.id,
      'academic',
      enrollment.aluno_id,
      'Aula amanhã',
      'Há uma aula programada para amanhã. Consulte o calendário no app.',
      '/aluno/?module=calendario',
      jsonb_build_object(
        'class_id', class.id,
        'class_date', class.data_aula,
        'turma_id', class.turma_id,
        'event', 'class_reminder',
        'collapse_key', 'academic:' || class.id::text
      ),
      format('academic:class:%s:%s:d-1', class.id, enrollment.aluno_id)
    from public.aulas_turma class
    join public.matriculas enrollment on enrollment.turma_id = class.turma_id
    where class.data_aula = v_today + 1
      and enrollment.status = 'ATIVO'
    on conflict (idempotency_key) do nothing;

    get diagnostics v_academic = row_count;
  end if;

  if coalesce((v_policy.categories ->> 'calendar')::boolean, false) then
    with recipients as (
      select distinct event.id as event_id, event.event_date, event.type_id, enrollment.aluno_id
      from public.calendar_events event
      join public.turmas class_group on class_group.polo_id = event.polo_id
      join public.matriculas enrollment
        on enrollment.turma_id = class_group.id
       and enrollment.status = 'ATIVO'
      where event.event_date = v_today + 1
        and event.visibility = 'GENERAL'

      union

      select distinct event.id as event_id, event.event_date, event.type_id, enrollment.aluno_id
      from public.calendar_events event
      join public.matriculas enrollment
        on enrollment.turma_id = event.turma_id
       and enrollment.status = 'ATIVO'
      where event.event_date = v_today + 1
        and event.visibility = 'TURMA'
    )
    insert into public.push_notification_jobs (
      source_type,
      source_id,
      category,
      aluno_id,
      title,
      body,
      deep_link,
      data,
      idempotency_key
    )
    select
      'calendar',
      recipient.event_id,
      'calendar',
      recipient.aluno_id,
      case
        when lower(recipient.type_id) like '%feriad%' then 'Feriado amanhã'
        else 'Evento amanhã'
      end,
      case
        when lower(recipient.type_id) like '%feriad%'
          then 'Confira no app como o feriado afeta o calendário acadêmico.'
        else 'Há uma atualização no calendário de amanhã. Consulte os detalhes no app.'
      end,
      '/aluno/?module=calendario',
      jsonb_build_object(
        'calendar_event_id', recipient.event_id,
        'event_date', recipient.event_date,
        'event', 'calendar_reminder',
        'collapse_key', 'calendar:' || recipient.event_id::text
      ),
      format('calendar:event:%s:%s:d-1', recipient.event_id, recipient.aluno_id)
    from recipients recipient
    on conflict (idempotency_key) do nothing;

    get diagnostics v_calendar = row_count;
  end if;

  if coalesce((v_policy.categories ->> 'institutional')::boolean, false) then
    insert into public.push_notification_jobs (
      source_type,
      source_id,
      category,
      aluno_id,
      title,
      body,
      deep_link,
      data,
      idempotency_key
    )
    select
      'institutional',
      null,
      'institutional',
      student.id,
      '🎉 Feliz aniversário!',
      'A Universo deseja a você um dia muito especial e um novo ciclo de muitas conquistas.',
      '/aluno/?module=inicio',
      jsonb_build_object(
        'event', 'birthday',
        'birthday_date', v_today,
        'collapse_key', 'birthday:' || student.id::text || ':' || extract(year from v_today)::integer
      ),
      format(
        'institutional:birthday:%s:%s',
        student.id,
        extract(year from v_today)::integer
      )
    from public.parceiros student
    where student.tipo = 'Aluno'
      and student.status = 'ATIVO'
      and student.data_nascimento is not null
      and extract(month from student.data_nascimento) = extract(month from v_today)
      and extract(day from student.data_nascimento) = extract(day from v_today)
    on conflict (idempotency_key) do nothing;

    get diagnostics v_birthday = row_count;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'financial', v_financial,
    'academic', v_academic,
    'calendar', v_calendar,
    'birthday', v_birthday
  );
end;
$$;

revoke all on function public.enqueue_scheduled_push_notifications()
from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_push_notifications()
to service_role;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aluno_notificacoes'
  ) then
    alter publication supabase_realtime add table public.aluno_notificacoes;
  end if;
end;
$$;

commit;
