BEGIN;

-- Projection and frontend use these exact result fields for fiscal identity.
-- Any supplied identity, including an empty string, prevents error archiving.
CREATE OR REPLACE FUNCTION private.nfse_error_archivable(p_operation private.nfse_individual_operations)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT coalesce(CASE WHEN p_operation.state='REJECTED' AND p_operation.result->>'state'='REJECTED'
    AND p_operation.result->>'number' IS NULL AND p_operation.result->>'accessKey' IS NULL
    AND p_operation.authorized_xml IS NULL AND nullif(p_operation.dps_id,'') IS NOT NULL
    AND nullif(p_operation.signed_dps_xml,'') IS NOT NULL
    AND p_operation.result->>'dpsId'=p_operation.dps_id AND jsonb_typeof(p_operation.result->'codes')='array'
    THEN jsonb_array_length(p_operation.result->'codes') BETWEEN 1 AND 100 AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_operation.result->'codes') code
      WHERE jsonb_typeof(code)<>'string' OR (code#>>'{}') !~ '^[A-Z0-9_-]{1,32}$')
    ELSE false END,false)
$function$;

COMMIT;
