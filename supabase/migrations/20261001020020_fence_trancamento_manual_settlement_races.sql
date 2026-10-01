-- Serializa baixa manual e cancelamento por trancamento no mesmo recebível.
begin;

create or replace function internal_academic.guard_trancamento_manual_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.contas_receber
  where id = new.receivable_id
  for update;

  if exists (
    select 1
    from public.banese_cancellation_outbox job
    where job.receivable_id = new.receivable_id
      and job.reason = 'TRANCAMENTO_FUTURO'
      and job.state in ('PENDING', 'RETRY', 'PROCESSING', 'REVIEW_REQUIRED')
  ) and not (
    tg_op = 'UPDATE'
    and new.state in (
      'FAILED_SAFE', 'REVIEW_REQUIRED', 'CANCELED_AFTER_REVIEW', 'REVERSED'
    )
  ) then
    raise exception using
      errcode = 'PT409',
      message = 'Baixa manual bloqueada enquanto o cancelamento Banese do trancamento está em andamento.';
  end if;

  return new;
end;
$$;

revoke all on function internal_academic.guard_trancamento_manual_settlement()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_trancamento_manual_settlement
  on public.receivable_manual_settlements;
create trigger guard_trancamento_manual_settlement
before insert or update on public.receivable_manual_settlements
for each row execute function
  internal_academic.guard_trancamento_manual_settlement();

comment on function internal_academic.guard_trancamento_manual_settlement() is
  'Evita corrida entre baixa manual e baixa Banese por trancamento; ambas serializam contas_receber.';

commit;
