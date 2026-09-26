create or replace function public.guard_banese_pdv_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid; j public.banese_pdv_cancellation_jobs;
begin
  rid := (to_jsonb(old)->>case when tg_table_name='contas_receber' then 'id' else 'receivable_id' end)::uuid;
  select * into j from public.banese_pdv_cancellation_jobs where receivable_id=rid;
  if j.state='FENCED' and current_setting('app.pdv_cancel_lease',true) is distinct from j.lease_token::text then
    raise exception using errcode='P0001', message='Titulo PDV em substituicao autorizada.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
