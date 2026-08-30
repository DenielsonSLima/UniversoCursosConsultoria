-- A função Edge só precisa validar o token recebido; ela jamais precisa ler
-- o valor do cofre. O verificador não expõe o segredo e aceita somente uma
-- credencial de tamanho plausível antes de comparar no banco.
begin;

create or replace function public.verify_banese_reconciliation_worker_token(
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret text;
begin
  if length(coalesce(p_token, '')) not between 32 and 512 then
    return false;
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'payment_gateway_banese_card_reconciliation_worker_secret'
  limit 1;

  return length(coalesce(v_secret, '')) >= 32 and p_token = v_secret;
end;
$function$;

revoke all on function public.verify_banese_reconciliation_worker_token(text)
  from public;
grant execute on function public.verify_banese_reconciliation_worker_token(text)
  to anon, authenticated, service_role;

comment on function public.verify_banese_reconciliation_worker_token(text) is
  'Valida o token do worker Banese sem expor segredo do Vault.';

commit;
