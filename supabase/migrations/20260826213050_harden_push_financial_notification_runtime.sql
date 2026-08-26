begin;

create index if not exists idx_push_notification_jobs_financial_open_source
on public.push_notification_jobs (source_id)
where source_type = 'financial'
  and status in ('pending', 'processing', 'failed', 'partial');

create or replace function public.guard_financial_push_job_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  if new.status <> 'processing' or old.status = 'processing'
     or old.source_type <> 'financial' then
    return new;
  end if;

  v_reason := public.financial_push_job_block_reason(old.id);
  if v_reason is not null then
    new.status := 'cancelled';
    new.processed_at := now();
    new.locked_at := null;
    new.locked_by := null;
    new.last_error := v_reason;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_financial_push_job_claim()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_00_financial_revalidate_claim
on public.push_notification_jobs;
create trigger push_notification_jobs_00_financial_revalidate_claim
before update of status on public.push_notification_jobs
for each row
when (new.status = 'processing' and old.status is distinct from new.status)
execute function public.guard_financial_push_job_claim();

create or replace function public.cancel_invalid_financial_push_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_notification_jobs job
  set status = 'cancelled',
      processed_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = public.financial_push_job_block_reason(job.id)
  where job.source_type = 'financial'
    and job.source_id = new.id
    and job.status in ('pending', 'processing', 'failed', 'partial')
    and public.financial_push_job_block_reason(job.id) is not null;
  return new;
end;
$$;

revoke all on function public.cancel_invalid_financial_push_jobs()
from public, anon, authenticated;

drop trigger if exists contas_receber_cancel_invalid_push_jobs
on public.contas_receber;
create trigger contas_receber_cancel_invalid_push_jobs
after update of status, data_pagamento, data_vencimento, cliente_id
on public.contas_receber
for each row
when (
  old.status is distinct from new.status
  or old.data_pagamento is distinct from new.data_pagamento
  or old.data_vencimento is distinct from new.data_vencimento
  or old.cliente_id is distinct from new.cliente_id
)
execute function public.cancel_invalid_financial_push_jobs();

create or replace function public.archive_cancelled_financial_push_inbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from new.status
     and new.source_type = 'financial' then
    update public.aluno_notificacoes inbox
    set archived_at = coalesce(inbox.archived_at, now()),
        read_at = coalesce(inbox.read_at, now())
    where inbox.source_job_id = new.id
      and inbox.archived_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.archive_cancelled_financial_push_inbox()
from public, anon, authenticated;

drop trigger if exists push_notification_jobs_archive_cancelled_financial_inbox
on public.push_notification_jobs;
create trigger push_notification_jobs_archive_cancelled_financial_inbox
after update of status on public.push_notification_jobs
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.archive_cancelled_financial_push_inbox();

update public.push_notification_jobs job
set status = 'cancelled',
    processed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = public.financial_push_job_block_reason(job.id)
where job.source_type = 'financial'
  and job.status in ('pending', 'processing', 'failed', 'partial')
  and public.financial_push_job_block_reason(job.id) is not null;

create or replace function public.revalidate_push_notification_delivery_before_send(
  p_delivery_id uuid,
  p_worker text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_job_id uuid;
  v_snapshot_source_type text;
  v_snapshot_source_id uuid;
  v_receivable_locked boolean := false;
  v_job public.push_notification_jobs%rowtype;
  v_reason text;
begin
  select delivery.job_id, job.source_type, job.source_id
  into v_snapshot_job_id, v_snapshot_source_type, v_snapshot_source_id
  from public.push_notification_deliveries delivery
  join public.push_notification_jobs job on job.id = delivery.job_id
  where delivery.id = p_delivery_id;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'PUSH_DELIVERY_CLAIM_INVALID'
    );
  end if;

  -- Ordem canônica: conta -> job -> delivery. A leitura inicial não trava
  -- linhas e sua identidade é obrigatoriamente revalidada após os locks.
  if v_snapshot_source_type = 'financial'
     and v_snapshot_source_id is not null then
    perform 1
    from public.contas_receber receivable
    where receivable.id = v_snapshot_source_id
    for share;
    v_receivable_locked := found;
  end if;

  select job.* into v_job
  from public.push_notification_jobs job
  where job.id = v_snapshot_job_id
    and job.status = 'processing'
    and job.locked_by = left(coalesce(p_worker, ''), 120)
  for update;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'PUSH_DELIVERY_CLAIM_INVALID'
    );
  end if;

  perform 1
  from public.push_notification_deliveries delivery
  where delivery.id = p_delivery_id
    and delivery.job_id = v_job.id
    and delivery.status = 'processing'
  for update;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'PUSH_DELIVERY_CLAIM_INVALID'
    );
  end if;

  if v_job.source_type is distinct from v_snapshot_source_type
     or v_job.source_id is distinct from v_snapshot_source_id then
    v_reason := 'PUSH_DELIVERY_IDENTITY_CHANGED';
  elsif v_job.source_type <> 'financial' then
    return jsonb_build_object('eligible', true, 'reason', null);
  elsif v_job.source_id is null or not v_receivable_locked then
    v_reason := 'FINANCIAL_RECEIVABLE_NOT_FOUND';
  else
    v_reason := public.financial_push_job_block_reason(v_job.id);
  end if;

  if v_reason is null then
    return jsonb_build_object('eligible', true, 'reason', null);
  end if;

  update public.push_notification_jobs
  set status = 'cancelled',
      processed_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = v_reason
  where id = v_job.id;

  return jsonb_build_object('eligible', false, 'reason', v_reason);
end;
$$;

revoke all on function public.revalidate_push_notification_delivery_before_send(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.revalidate_push_notification_delivery_before_send(
  uuid, text
) to service_role;

revoke execute on function public.complete_push_notification_delivery(
  uuid, boolean, text, text, boolean
) from public, anon, authenticated, service_role;

commit;
