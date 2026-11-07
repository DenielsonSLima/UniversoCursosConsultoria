-- Run only through MCP Supabase after the restricted grant is installed.
-- Uses transaction-local claims, restores roles and rolls back all test state.
BEGIN;
DO $test$
DECLARE
  allowed_context uuid;
  allowed_identity uuid;
  other_context uuid;
  other_identity uuid;
  rejected boolean;
BEGIN
  IF (SELECT pg_catalog.count(*) FROM private.nfse_access_grants) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one rollout grant';
  END IF;
  SELECT usuario_id, auth_user_id INTO STRICT allowed_context, allowed_identity
    FROM private.nfse_access_grants;
  SELECT id, auth_user_id INTO STRICT other_context, other_identity
    FROM public.usuarios_sistema
    WHERE auth_user_id <> allowed_identity AND public.is_active_status(status)
      AND pg_catalog.upper(pg_catalog.btrim(perfil)) = 'GESTOR'
    ORDER BY id LIMIT 1;

  IF pg_catalog.has_function_privilege('anon', 'public.get_nfse_access_secure(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers must not execute the access RPC';
  END IF;
  IF pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
    OR pg_catalog.has_table_privilege('authenticated', 'private.nfse_access_grants', 'SELECT')
    OR pg_catalog.has_table_privilege('authenticated', 'private.nfse_access_grants', 'INSERT')
    OR pg_catalog.has_table_privilege('authenticated', 'private.nfse_access_grants', 'UPDATE')
    OR pg_catalog.has_table_privilege('authenticated', 'private.nfse_access_grants', 'DELETE') THEN
    RAISE EXCEPTION 'Client access to rollout grants must be denied';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', allowed_identity::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.json_build_object('sub', allowed_identity, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF public.get_nfse_access_secure(allowed_context) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Authorized manager was denied';
  END IF;
  IF public.get_nfse_access_secure(other_context) IS DISTINCT FROM false
    OR public.get_nfse_access_secure(NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A forged or absent context was authorized';
  END IF;
  RESET ROLE;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', other_identity::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.json_build_object('sub', other_identity, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF public.get_nfse_access_secure(other_context) IS DISTINCT FROM false
    OR public.get_nfse_access_secure(allowed_context) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Another manager accessed the restricted rollout';
  END IF;
  rejected := false;
  BEGIN
    PERFORM 1 FROM private.nfse_access_grants;
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Authenticated caller read private grants';
  END IF;
  RESET ROLE;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  IF public.get_nfse_access_secure(allowed_context) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Missing authenticated identity was authorized';
  END IF;
  RESET ROLE;
END;
$test$;
SELECT 'NFS-e rollout authorization checks passed' AS result;
ROLLBACK;

