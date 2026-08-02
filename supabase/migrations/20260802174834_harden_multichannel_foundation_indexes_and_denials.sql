begin;

create index if not exists idx_comunicacao_automacao_rotas_canal_fk
  on public.comunicacao_automacao_rotas (automacao_id, canal);

create index if not exists idx_comunicacao_eventos_outbox_automacao_versao
  on public.comunicacao_eventos_outbox (automacao_versao_id);

create policy comunicacao_eventos_outbox_client_deny
  on public.comunicacao_eventos_outbox
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy comunicacao_entregas_client_deny
  on public.comunicacao_entregas
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy comunicacao_preferencias_client_deny
  on public.comunicacao_preferencias
  for all
  to anon, authenticated
  using (false)
  with check (false);

commit;
