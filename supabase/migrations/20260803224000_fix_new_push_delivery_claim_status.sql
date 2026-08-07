begin;

-- A entrega criada durante o claim precisa nascer como processing. O worker
-- consulta apenas esse estado ao devolver os itens reclamados; deixar o valor
-- default pending fazia o job ser encerrado como NO_ELIGIBLE_DEVICE.
create or replace function public.mark_claimed_push_delivery_processing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending'
     and exists (
       select 1
       from public.push_notification_jobs job
       where job.id = new.job_id
         and job.status = 'processing'
     ) then
    new.status := 'processing';
  end if;
  return new;
end;
$$;

revoke all on function public.mark_claimed_push_delivery_processing()
  from public, anon, authenticated;

drop trigger if exists push_notification_delivery_claim_status
  on public.push_notification_deliveries;
create trigger push_notification_delivery_claim_status
before insert on public.push_notification_deliveries
for each row
execute function public.mark_claimed_push_delivery_processing();

commit;
