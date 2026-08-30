-- O verificador temporário não é necessário: o worker já valida o segredo
-- exclusivamente por RPC interna. Remove a superfície criada no diagnóstico.
begin;

revoke all on function public.verify_banese_reconciliation_worker_token(text)
  from public, anon, authenticated, service_role;

drop function if exists public.verify_banese_reconciliation_worker_token(text);

commit;
