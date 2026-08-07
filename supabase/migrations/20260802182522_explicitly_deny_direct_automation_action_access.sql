begin;

-- A tabela é append-only e acessada somente pelas RPCs SECURITY DEFINER e pelo
-- service_role. A política explícita documenta a negação e evita depender
-- apenas da ausência de grants/policies para bloquear clientes.
drop policy if exists comunicacao_automacao_acoes_direct_deny
  on public.comunicacao_automacao_acoes;
create policy comunicacao_automacao_acoes_direct_deny
  on public.comunicacao_automacao_acoes
  for all
  to public
  using (false)
  with check (false);

commit;
