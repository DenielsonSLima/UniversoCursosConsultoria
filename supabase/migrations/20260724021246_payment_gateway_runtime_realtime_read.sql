-- O cliente gestor precisa receber a alteração do singleton pelo Realtime.
-- Escritas continuam exclusivamente via Edge Function/service_role.

grant select on table public.payment_gateway_runtime_config to authenticated;

drop policy if exists payment_gateway_runtime_config_authenticated_read
  on public.payment_gateway_runtime_config;
create policy payment_gateway_runtime_config_authenticated_read
  on public.payment_gateway_runtime_config
  for select
  to authenticated
  using (true);
