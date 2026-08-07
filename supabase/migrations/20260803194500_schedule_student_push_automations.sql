begin;

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
begin
  select * into v_policy
  from public.push_notification_policies
  where id is true;

  if not found or not v_policy.enabled then
    return jsonb_build_object(
      'enabled', false,
      'financial', 0,
      'academic', 0,
      'calendar', 0
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
      c.id,
      'financial',
      c.cliente_id,
      reminder.title,
      reminder.body,
      '/aluno/?module=financeiro',
      jsonb_build_object(
        'receivable_id', c.id,
        'days_before_due', reminder.days_before_due,
        'collapse_key', 'financial:' || c.id::text
      ),
      format('financial:due:%s:%s:%s', c.id, c.data_vencimento, reminder.days_before_due)
    from public.contas_receber c
    cross join (
      values
        (3, 'Lembrete de vencimento'::text, 'Você tem uma cobrança com vencimento em 3 dias. Consulte o Financeiro no app.'::text),
        (0, 'Vencimento hoje'::text, 'Você tem uma cobrança com vencimento hoje. Consulte o Financeiro no app.'::text)
    ) as reminder(days_before_due, title, body)
    where c.cliente_id is not null
      and c.data_pagamento is null
      and c.data_vencimento = v_today + reminder.days_before_due
      and upper(coalesce(c.status, '')) not in ('PAGO', 'CANCELADO', 'CANCELADA', 'RECEBIDO')
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
      a.id,
      'academic',
      m.aluno_id,
      'Aula amanhã',
      'Há uma aula programada para amanhã. Consulte o calendário no app.',
      '/aluno/?module=calendario',
      jsonb_build_object(
        'class_id', a.id,
        'class_date', a.data_aula,
        'turma_id', a.turma_id,
        'collapse_key', 'academic:' || a.id::text
      ),
      format('academic:class:%s:%s:d-1', a.id, m.aluno_id)
    from public.aulas_turma a
    join public.matriculas m on m.turma_id = a.turma_id
    where a.data_aula = v_today + 1
      and m.status = 'ATIVO'
    on conflict (idempotency_key) do nothing;

    get diagnostics v_academic = row_count;
  end if;

  if coalesce((v_policy.categories ->> 'calendar')::boolean, false) then
    with recipients as (
      select distinct e.id as event_id, e.event_date, e.type_id, m.aluno_id
      from public.calendar_events e
      join public.turmas t on t.polo_id = e.polo_id
      join public.matriculas m on m.turma_id = t.id and m.status = 'ATIVO'
      where e.event_date = v_today + 1
        and e.visibility = 'GENERAL'

      union

      select distinct e.id as event_id, e.event_date, e.type_id, m.aluno_id
      from public.calendar_events e
      join public.matriculas m on m.turma_id = e.turma_id and m.status = 'ATIVO'
      where e.event_date = v_today + 1
        and e.visibility = 'TURMA'
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
      r.event_id,
      'calendar',
      r.aluno_id,
      case when lower(r.type_id) like '%feriad%' then 'Feriado amanhã' else 'Evento amanhã' end,
      case
        when lower(r.type_id) like '%feriad%' then 'Confira no app como o feriado afeta o calendário acadêmico.'
        else 'Há uma atualização no calendário de amanhã. Consulte os detalhes no app.'
      end,
      '/aluno/?module=calendario',
      jsonb_build_object(
        'calendar_event_id', r.event_id,
        'event_date', r.event_date,
        'collapse_key', 'calendar:' || r.event_id::text
      ),
      format('calendar:event:%s:%s:d-1', r.event_id, r.aluno_id)
    from recipients r
    on conflict (idempotency_key) do nothing;

    get diagnostics v_calendar = row_count;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'financial', v_financial,
    'academic', v_academic,
    'calendar', v_calendar
  );
end;
$$;

revoke all on function public.enqueue_scheduled_push_notifications() from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_push_notifications() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'enqueue-student-push-automations'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'enqueue-student-push-automations',
    '0 11 * * *',
    'select public.enqueue_scheduled_push_notifications()'
  );
end;
$$;

commit;
