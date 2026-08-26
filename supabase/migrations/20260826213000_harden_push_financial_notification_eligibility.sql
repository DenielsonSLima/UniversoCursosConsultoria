begin;

create or replace function public.financial_receivable_is_notifiable(
  p_status text,
  p_data_pagamento date
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_data_pagamento is null
    and coalesce(p_status in ('PENDENTE', 'VENCIDO'), false);
$$;

revoke all on function public.financial_receivable_is_notifiable(text, date)
from public, anon, authenticated;

create or replace function public.financial_receivable_is_paid_confirmed(
  p_status text,
  p_data_pagamento date
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_data_pagamento is not null
    and upper(btrim(coalesce(p_status, ''))) in ('PAGO', 'RECEBIDO', 'RECEBIDA');
$$;

revoke all on function public.financial_receivable_is_paid_confirmed(text, date)
from public, anon, authenticated;

create or replace function public.financial_receivable_notification_block_reason(
  p_receivable_id uuid,
  p_event text,
  p_reference_date date,
  p_window_days integer default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receivable public.contas_receber%rowtype;
  v_event text := lower(btrim(coalesce(p_event, '')));
  v_days integer := greatest(coalesce(p_window_days, 0), 0);
begin
  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id;

  if not found then
    return 'FINANCIAL_RECEIVABLE_NOT_FOUND';
  end if;
  if p_reference_date is null then
    return 'FINANCIAL_NOTIFICATION_CONTEXT_INVALID';
  end if;

  if v_event in ('receipt', 'payment_receipt', 'payment_confirmed') then
    if not public.financial_receivable_is_paid_confirmed(
      v_receivable.status,
      v_receivable.data_pagamento
    ) then
      return 'FINANCIAL_PAYMENT_NOT_CONFIRMED';
    end if;
    if v_receivable.data_pagamento <> p_reference_date then
      return 'FINANCIAL_NOTIFICATION_WINDOW_CHANGED';
    end if;
    return null;
  end if;

  if not public.financial_receivable_is_notifiable(
    v_receivable.status,
    v_receivable.data_pagamento
  ) then
    return 'FINANCIAL_RECEIVABLE_NOT_ACTIONABLE';
  end if;

  if v_event in ('due', 'payment_due') then
    if v_receivable.data_vencimento is distinct from p_reference_date + v_days then
      return 'FINANCIAL_NOTIFICATION_WINDOW_CHANGED';
    end if;
  elsif v_event in ('overdue', 'payment_overdue') then
    if v_receivable.data_vencimento is distinct from p_reference_date - v_days then
      return 'FINANCIAL_NOTIFICATION_WINDOW_CHANGED';
    end if;
  elsif v_event = 'multiple' then
    if v_receivable.data_vencimento is null
       or v_receivable.data_vencimento >= p_reference_date then
      return 'FINANCIAL_NOTIFICATION_WINDOW_CHANGED';
    end if;
  else
    return 'FINANCIAL_NOTIFICATION_EVENT_UNSUPPORTED';
  end if;

  return null;
end;
$$;

revoke all on function public.financial_receivable_notification_block_reason(
  uuid, text, date, integer
) from public, anon, authenticated;

create or replace function public.financial_push_job_block_reason(p_job_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job public.push_notification_jobs%rowtype;
  v_reference_text text;
  v_reference_date date;
  v_days_text text;
  v_days integer;
  v_receivable_client_id uuid;
  v_payment_date date;
begin
  select job.* into v_job
  from public.push_notification_jobs job
  where job.id = p_job_id;

  if not found then
    return 'PUSH_JOB_NOT_FOUND';
  end if;
  if v_job.source_type <> 'financial' then
    return null;
  end if;
  if v_job.source_id is null then
    return 'FINANCIAL_RECEIVABLE_NOT_FOUND';
  end if;

  select receivable.cliente_id, receivable.data_pagamento
  into v_receivable_client_id, v_payment_date
  from public.contas_receber receivable
  where receivable.id = v_job.source_id;

  if not found then
    return 'FINANCIAL_RECEIVABLE_NOT_FOUND';
  end if;
  if v_receivable_client_id is distinct from v_job.aluno_id then
    return 'FINANCIAL_RECEIVABLE_OWNER_CHANGED';
  end if;

  v_reference_text := v_job.data ->> 'reference_date';
  if v_reference_text is null
     and v_job.data ->> 'event' = 'payment_confirmed' then
    v_reference_text := v_payment_date::text;
  end if;
  v_reference_text := coalesce(
    v_reference_text,
    (pg_catalog.timezone('America/Maceio', v_job.created_at))::date::text
  );
  v_days_text := coalesce(v_job.data ->> 'days_before_due', '0');
  if v_reference_text is null
     or v_reference_text !~ '^\d{4}-\d{2}-\d{2}$'
     or v_days_text !~ '^\d+$' then
    return 'FINANCIAL_NOTIFICATION_CONTEXT_INVALID';
  end if;

  begin
    v_reference_date := v_reference_text::date;
    v_days := v_days_text::integer;
  exception
    when invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range then
      return 'FINANCIAL_NOTIFICATION_CONTEXT_INVALID';
  end;

  if v_job.data ->> 'event' = 'payment_due'
     and v_reference_date <>
       (pg_catalog.timezone('America/Maceio', now()))::date then
    return 'FINANCIAL_NOTIFICATION_WINDOW_EXPIRED';
  end if;

  return public.financial_receivable_notification_block_reason(
    v_job.source_id,
    v_job.data ->> 'event',
    v_reference_date,
    v_days
  );
end;
$$;

revoke all on function public.financial_push_job_block_reason(uuid)
from public, anon, authenticated;

create or replace function public.guard_financial_push_job_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference_text text;
  v_reference_date date;
  v_days_text text;
  v_days integer;
  v_reason text;
  v_payment_date date;
  v_receivable_client_id uuid;
  v_receivable_status text;
begin
  if new.source_type <> 'financial' then
    return new;
  end if;

  select receivable.data_pagamento, receivable.cliente_id, receivable.status
  into v_payment_date, v_receivable_client_id, v_receivable_status
  from public.contas_receber receivable
  where receivable.id = new.source_id
  for share;

  if not found or v_receivable_client_id is distinct from new.aluno_id then
    return null;
  end if;
  if new.data ->> 'event' in ('receipt', 'payment_receipt', 'payment_confirmed')
     and not public.financial_receivable_is_paid_confirmed(
       v_receivable_status,
       v_payment_date
     ) then
    return null;
  end if;

  v_reference_text := coalesce(
    new.data ->> 'reference_date',
    case
      when new.data ->> 'event' = 'payment_confirmed'
        then v_payment_date::text
      else (pg_catalog.timezone('America/Maceio', now()))::date::text
    end
  );
  v_days_text := coalesce(new.data ->> 'days_before_due', '0');
  if v_reference_text is null
     or v_reference_text !~ '^\d{4}-\d{2}-\d{2}$'
     or v_days_text !~ '^\d+$' then
    return null;
  end if;

  begin
    v_reference_date := v_reference_text::date;
    v_days := v_days_text::integer;
  exception
    when invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range then
      return null;
  end;

  if new.data ->> 'event' = 'payment_due'
     and v_reference_date <>
       (pg_catalog.timezone('America/Maceio', now()))::date then
    return null;
  end if;

  v_reason := public.financial_receivable_notification_block_reason(
    new.source_id,
    new.data ->> 'event',
    v_reference_date,
    v_days
  );
  if v_reason is not null then
    return null;
  end if;

  new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
    'reference_date',
    v_reference_date::text
  );
  return new;
end;
$$;

revoke all on function public.guard_financial_push_job_insert()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_guard_financial_insert
on public.push_notification_jobs;
create trigger push_notification_jobs_guard_financial_insert
before insert on public.push_notification_jobs
for each row execute function public.guard_financial_push_job_insert();

create or replace function public.enqueue_payment_confirmation_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_new_paid boolean;
  v_old_paid boolean;
begin
  if new.cliente_id is null then
    return new;
  end if;

  v_new_paid := public.financial_receivable_is_paid_confirmed(
    new.status,
    new.data_pagamento
  );
  v_old_paid := public.financial_receivable_is_paid_confirmed(
    old.status,
    old.data_pagamento
  );
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
    source_type, source_id, category, aluno_id, title, body,
    deep_link, data, idempotency_key
  ) values (
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

commit;
