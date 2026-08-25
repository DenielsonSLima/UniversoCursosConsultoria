BEGIN;

-- O compositor autorizado permanece SECURITY DEFINER em schema não exposto,
-- inclusive para recibos históricos de polos que venham a ficar inativos.
-- A API pública recebe somente um wrapper INVOKER sem bypass próprio.
ALTER FUNCTION public.portal_aluno_financeiro_preparar_recibo(uuid, uuid)
  SET SCHEMA portal_private;

ALTER FUNCTION portal_private.portal_aluno_financeiro_preparar_recibo(uuid, uuid)
  SECURITY DEFINER
  SET search_path = '';

REVOKE ALL ON FUNCTION portal_private.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION portal_private.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_aluno_financeiro_preparar_recibo(
  p_aluno_id uuid,
  p_lancamento_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT portal_private.portal_aluno_financeiro_preparar_recibo(
    p_aluno_id,
    p_lancamento_id
  );
$function$;

REVOKE ALL ON FUNCTION public.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION portal_private.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) IS 'Compositor autorizado interno do recibo do Aluno; não exposto como RPC pública.';
COMMENT ON FUNCTION public.portal_aluno_financeiro_preparar_recibo(uuid, uuid)
IS 'Wrapper INVOKER do snapshot autorizado do recibo vetorial do Aluno.';

NOTIFY pgrst, 'reload schema';

COMMIT;
