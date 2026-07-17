create or replace function public.enforce_universo_banese_fixed_banking_data()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.provider_code = 'banese_card'
     and new.environment in ('sandbox', 'production') then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'baneseBeneficiarioNome', 'UNIVERSO CURSOS E CONSULTORIA LTDA',
      'baneseBeneficiarioInscricao', '13.278.137/0001-54',
      'baneseAgencia', '033',
      'baneseConta', '03/100649-0',
      'baneseContaDisplay', '03/100649-0',
      'baneseCodigoBeneficiario', '03/100649-0',
      'baneseConvenio', '15528',
      'baneseBoletoConvenio', '15528'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_universo_banese_fixed_banking_data() from public;

drop trigger if exists enforce_universo_banese_fixed_banking_data
  on public.payment_gateway_credentials;

create trigger enforce_universo_banese_fixed_banking_data
before insert or update of provider_code, environment, metadata
on public.payment_gateway_credentials
for each row
execute function public.enforce_universo_banese_fixed_banking_data();
