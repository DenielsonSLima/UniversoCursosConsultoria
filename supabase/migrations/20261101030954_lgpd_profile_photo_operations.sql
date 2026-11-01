BEGIN;

-- Canal operacional exclusivo do proprietário do banco. Nunca recebe segredo
-- administrativo: o gateway usa a chave pública anon e a Edge valida a capability.
CREATE TABLE internal_privacy.profile_photo_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 12),
  dry_run boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  request_id bigint
);
ALTER TABLE internal_privacy.profile_photo_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal_privacy.profile_photo_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_profile_photo_migration_operation(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_operation internal_privacy.profile_photo_operations%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR p_token IS NULL
    OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Operação não autorizada.' USING ERRCODE = '42501';
  END IF;
  UPDATE internal_privacy.profile_photo_operations
  SET claimed_at = clock_timestamp()
  WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    AND claimed_at IS NULL AND expires_at > clock_timestamp()
  RETURNING * INTO v_operation;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operação não autorizada.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('actorId', v_operation.id, 'reason', v_operation.reason,
    'dryRun', v_operation.dry_run);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_profile_photo_migration_operation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_profile_photo_migration_operation(text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_profile_photo_migration_operation(p_operation_id uuid, p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Operação não autorizada.' USING ERRCODE = '42501';
  END IF;
  UPDATE internal_privacy.profile_photo_operations SET finished_at = clock_timestamp(), result = (
    SELECT coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    FROM jsonb_each(coalesce(p_result, '{}'::jsonb)) entry
    WHERE entry.key = ANY(ARRAY['pending', 'quarantineCandidates', 'completed', 'publicSourcesRemaining',
      'examined', 'quarantined', 'pendingPublicCache', 'failed'])
      AND jsonb_typeof(entry.value) = 'number' AND entry.value::text ~ '^[0-9]{1,9}$'
  ) WHERE id = p_operation_id AND claimed_at IS NOT NULL AND finished_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operação não autorizada.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_profile_photo_migration_operation(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_profile_photo_migration_operation(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION internal_privacy.dispatch_profile_photo_migration_operation(
  p_dry_run boolean, p_reason text, p_gateway_jwt text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid; v_token text; v_request bigint;
BEGIN
  IF p_dry_run IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) < 12
    OR p_gateway_jwt IS NULL OR length(p_gateway_jwt) > 2048
    OR p_gateway_jwt !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Solicitação operacional inválida.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lgpd-profile-photo-operation', 0));
  IF EXISTS (SELECT 1 FROM internal_privacy.profile_photo_operations
    WHERE finished_at IS NULL AND expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'Há operação em andamento; confira seu resultado antes de repetir.' USING ERRCODE = '55000';
  END IF;
  -- Duas UUIDs aleatórias fornecem 244 bits de entropia; só o SHA-256 é retido.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO internal_privacy.profile_photo_operations(token_hash, reason, dry_run)
  VALUES (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), btrim(p_reason), p_dry_run)
  RETURNING id INTO v_id;
  SELECT net.http_post(
    url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/profile-photo-migration',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_gateway_jwt, 'x-lgpd-operation-token', v_token),
    body := '{}'::jsonb, timeout_milliseconds := 90000
  ) INTO v_request;
  UPDATE internal_privacy.profile_photo_operations SET request_id = v_request WHERE id = v_id;
  RETURN jsonb_build_object('operationId', v_id, 'requestId', v_request, 'dryRun', p_dry_run);
END;
$$;
REVOKE ALL ON FUNCTION internal_privacy.dispatch_profile_photo_migration_operation(boolean, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE internal_privacy.profile_photo_operations IS
  'Solicitações administrativas MCP: capability de uso único por cinco minutos, gerada somente pelo proprietário do banco. Não representa sessão ou identidade de gestor.';
COMMENT ON COLUMN internal_privacy.profile_photo_migration_jobs.requested_by IS
  'UUID do gestor autenticado ou da operação administrativa MCP registrada em internal_privacy.profile_photo_operations.';

COMMIT;
