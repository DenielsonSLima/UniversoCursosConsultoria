-- A preparação canônica mantém o bloqueio compartilhado do modelo e gera o
-- instante de emissão. Ambos exigem uma função VOLATILE no PostgreSQL.
-- A alteração preserva corpo, segurança, search_path e grants da RPC.
alter function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid)
  volatile;
