BEGIN;

-- Estas RPCs já são exclusivas de service_role. O endurecimento abaixo remove
-- o search_path legado e reafirma os grants mínimos sem alterar a assinatura.
ALTER FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer,
  uuid, text, text, uuid[], text
) SET search_path TO '';

ALTER FUNCTION public.baixar_emprestimo_parcela_polo_secure(
  uuid, uuid, uuid, uuid, date, text
) SET search_path TO '';

REVOKE ALL ON FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer,
  uuid, text, text, uuid[], text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.baixar_emprestimo_parcela_polo_secure(
  uuid, uuid, uuid, uuid, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_polo_secure(
  uuid, uuid, text, text, numeric, numeric, date, date, integer, integer,
  uuid, text, text, uuid[], text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.baixar_emprestimo_parcela_polo_secure(
  uuid, uuid, uuid, uuid, date, text
) TO service_role;

COMMIT;
