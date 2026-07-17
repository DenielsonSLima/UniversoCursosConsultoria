alter table public.contas_receber
  add column if not exists gateway_boleto_issued_at timestamptz;

update public.contas_receber
set gateway_boleto_issued_at = coalesce(
  gateway_financial_terms_confirmed_at,
  gateway_synced_at,
  created_at
)
where gateway_provider = 'banese_card'
  and gateway_boleto_issued_at is null
  and gateway_boleto_linha_digitavel is not null
  and gateway_boleto_codigo_barras is not null;

create or replace function public.snapshot_banese_boleto_issued_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.gateway_provider = 'banese_card'
     and new.gateway_boleto_issued_at is null
     and new.gateway_boleto_linha_digitavel is not null
     and new.gateway_boleto_codigo_barras is not null then
    new.gateway_boleto_issued_at := coalesce(
      new.gateway_financial_terms_confirmed_at,
      new.gateway_synced_at,
      now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.snapshot_banese_boleto_issued_at() from public;

drop trigger if exists snapshot_banese_boleto_issued_at
  on public.contas_receber;

create trigger snapshot_banese_boleto_issued_at
before insert or update of
  gateway_provider,
  gateway_boleto_linha_digitavel,
  gateway_boleto_codigo_barras,
  gateway_boleto_issued_at
on public.contas_receber
for each row
execute function public.snapshot_banese_boleto_issued_at();
