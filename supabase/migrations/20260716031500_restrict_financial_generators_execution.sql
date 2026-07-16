-- As funções são chamadas por triggers e pela Edge Function administrativa.
-- Não precisam ficar expostas diretamente a usuários do portal.

REVOKE ALL ON FUNCTION public.gerar_cobranca_matricula(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_parcelas_matricula(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gerar_cobranca_matricula(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_parcelas_matricula(uuid)
  TO service_role;
