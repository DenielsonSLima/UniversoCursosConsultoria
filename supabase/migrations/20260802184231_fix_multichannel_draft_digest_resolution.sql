begin;

alter function public.comunicacao_automacao_salvar_rascunho(uuid, integer, uuid, text, jsonb)
  set search_path = pg_catalog, extensions;

commit;
