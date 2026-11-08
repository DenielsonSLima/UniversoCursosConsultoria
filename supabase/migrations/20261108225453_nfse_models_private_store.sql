BEGIN;

-- Reusable service metadata only. No invoice, queue or provider is enabled here.
CREATE TABLE private.nfse_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO', 'PRODUCAO')),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfse_models_polo_environment_idx ON private.nfse_models(polo_id, environment);
ALTER TABLE private.nfse_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_models FROM PUBLIC, anon, authenticated, service_role;

-- The request is also the immutable audit snapshot of each model revision.
CREATE TABLE private.nfse_model_requests (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  context_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_id)
);
ALTER TABLE private.nfse_model_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_model_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.authorize_nfse_model_scope(
  p_context_key uuid, p_polo_id uuid, p_environment text, p_month text
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_context record;
BEGIN
  IF NOT coalesce(public.get_nfse_access_secure(p_context_key), false) THEN
    RAISE EXCEPTION 'Acesso NFS-e não autorizado.' USING ERRCODE = '42501';
  END IF;
  SELECT context."allPolos", context."poloIds" INTO v_context
  FROM public.portal_listar_perfis() context
  WHERE context.role = 'GESTOR' AND context."contextId" = p_context_key;
  IF NOT FOUND OR p_polo_id IS NULL THEN
    RAISE EXCEPTION 'Contexto e polo NFS-e obrigatórios.' USING ERRCODE = '42501';
  END IF;
  IF NOT (coalesce(v_context."allPolos", false)
    OR p_polo_id = ANY(coalesce(v_context."poloIds", ARRAY[]::uuid[])))
    OR NOT EXISTS (SELECT 1 FROM public.polos polo
      WHERE polo.id = p_polo_id AND public.is_active_status(polo.status)) THEN
    RAISE EXCEPTION 'Polo fora do contexto NFS-e autorizado.' USING ERRCODE = '42501';
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('HOMOLOGACAO', 'PRODUCAO')
    OR p_month IS NULL OR p_month !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Escopo do modelo NFS-e inválido.' USING ERRCODE = '22023';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_nfse_models_secure(
  p_context_key uuid, p_polo_id uuid, p_environment text, p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT coalesce(jsonb_agg(model.definition || jsonb_build_object('id',model.id,'version',model.version)
    ORDER BY lower(model.definition->>'name'),model.id), '[]'::jsonb) INTO v_rows
  FROM private.nfse_models model
  WHERE model.polo_id = p_polo_id AND model.environment = p_environment;
  RETURN jsonb_build_object('version',1,
    'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
      'environment',p_environment,'month',p_month),
    'data',jsonb_build_object('rows',v_rows,'page',1,'pageSize',100,'totalItems',jsonb_array_length(v_rows)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) IS
  'Pilot-only reusable NFS-e service models; scoped by active polo and environment, independent of fiscal emission readiness.';

NOTIFY pgrst, 'reload schema';
COMMIT;
