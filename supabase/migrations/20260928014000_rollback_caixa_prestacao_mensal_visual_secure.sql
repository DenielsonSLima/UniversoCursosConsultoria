begin;

revoke all on function public.get_caixa_prestacao_mensal_visual_secure(uuid, date)
  from public, anon, authenticated, service_role;

drop function if exists public.get_caixa_prestacao_mensal_visual_secure(uuid, date);

commit;
