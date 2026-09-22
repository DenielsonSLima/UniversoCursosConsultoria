-- SELECT-only bounded metadata check, before or after the two migrations.
-- The caller should enforce statement_timeout <= 5s. No claims or financial rows.
WITH expected(signature, baseline_sha256, optimized_sha256, authenticated_allowed) AS (
  VALUES
    (
      'public.get_caixa_prestacao_mensal_v2_core(uuid,date,integer)',
      '692e631b234a84079005f1f838ee89e2b15006a1882fe14f0918aa4a5b9cd8b4',
      '5461e95d86de991362d285883e24a8353171221eb7ef05dce2e6471a62ef0180',
      false
    ),
    (
      'public.get_caixa_prestacao_mensal_secure(uuid,date,integer)',
      '614a26b7e75f87f6c284815fdba05280383477a625b8802982950f239a4fd705',
      '5a18342e56fa72f54cfcb7c106f5a5e5de756187ec80d9595b0d30f3498debc0',
      true
    )
), actual AS (
  SELECT expected.*, p.oid, p.prosecdef, p.provolatile, p.proconfig,
    encode(extensions.digest(pg_get_functiondef(p.oid), 'sha256'), 'hex') AS actual_sha256
  FROM expected LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
)
SELECT signature,
  CASE WHEN oid IS NULL THEN 'MISSING'
    WHEN actual_sha256 = baseline_sha256 THEN 'BASELINE'
    WHEN actual_sha256 = optimized_sha256 THEN 'OPTIMIZED'
    ELSE 'UNEXPECTED' END AS definition_state,
  actual_sha256,
  prosecdef AND provolatile = 's' AS stable_definer,
  proconfig = ARRAY['search_path=""'] AS empty_search_path,
  NOT has_function_privilege('anon', oid, 'EXECUTE')
    AND has_function_privilege('authenticated', oid, 'EXECUTE') = authenticated_allowed
    AND has_function_privilege('service_role', oid, 'EXECUTE') AS privileges_valid
FROM actual ORDER BY signature;
