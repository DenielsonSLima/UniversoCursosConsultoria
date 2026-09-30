-- Corrige o contrato da RPC global sem alterar a migration já aplicada.
-- `polos.estado` é varchar(2), enquanto a saída pública é text.

BEGIN;

DO $migration$
DECLARE
  v_function regprocedure := 'public.search_gestor_global_entities_secure(text,integer)'::regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(v_function) INTO v_definition;
  v_rewritten := replace(
    v_definition,
    'matched.scoped_polo_state AS polo_state',
    'matched.scoped_polo_state::text AS polo_state'
  );

  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Contrato de polo_state não encontrado na busca global.';
  END IF;

  EXECUTE v_rewritten;
END;
$migration$;

REVOKE ALL ON FUNCTION public.search_gestor_global_entities_secure(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_gestor_global_entities_secure(text, integer)
  TO authenticated, service_role;

COMMIT;
