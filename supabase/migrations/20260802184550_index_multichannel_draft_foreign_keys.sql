begin;

create index if not exists idx_comunicacao_automacao_requisicoes_automation_created
  on public.comunicacao_automacao_requisicoes (automacao_id, created_at desc);

create index if not exists idx_comunicacao_automacoes_published_version_fk
  on public.comunicacao_automacoes (id, versao_publicada)
  where versao_publicada is not null;

commit;
