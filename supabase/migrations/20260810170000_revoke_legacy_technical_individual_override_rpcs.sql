begin;

-- Aplicar somente depois que o frontend que usa os wrappers autorizados estiver
-- publicado. A migration de expansão 20260810160000 permanece compatível com o
-- frontend anterior durante a janela de deploy.
revoke execute on function public.salvar_override_financeiro_matricula_tecnica_secure(
  uuid, uuid, integer, text, integer, text, jsonb
) from authenticated;

revoke execute on function public.remover_override_financeiro_matricula_tecnica_secure(
  uuid, uuid, integer, text, integer, text
) from authenticated;

notify pgrst, 'reload schema';

commit;
