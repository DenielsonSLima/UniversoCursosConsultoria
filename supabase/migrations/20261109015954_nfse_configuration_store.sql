BEGIN;

-- Metadata only. This migration neither receives nor stores certificate material.
CREATE TABLE private.nfse_configurations (
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  credential_polo_id uuid NOT NULL REFERENCES public.polos(id),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
  version integer NOT NULL CHECK (version > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (polo_id,environment)
);
ALTER TABLE private.nfse_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_configurations FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.nfse_configuration_requests (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id,request_id)
);
ALTER TABLE private.nfse_configuration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_configuration_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.authorize_nfse_configuration_scope(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_matrix uuid; v_company uuid; v_permissions jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT CASE WHEN u.perfil_acesso_id IS NOT NULL
      AND NOT coalesce(u.personalizar_permissoes,false) AND profile.id IS NOT NULL
    THEN profile.permissoes ELSE u.permissoes END INTO v_permissions
  FROM public.usuarios_sistema u LEFT JOIN public.perfis_acesso profile ON profile.id=u.perfil_acesso_id
  WHERE u.id=p_context_key AND u.auth_user_id=auth.uid();
  IF NOT coalesce((v_permissions->'modules') @> '["configuracoes"]'::jsonb,false) THEN
    RAISE EXCEPTION 'Configuração fiscal exige permissão administrativa.' USING ERRCODE='42501';
  END IF;
  SELECT company_id INTO v_company FROM public.polos WHERE id=p_polo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Vínculo institucional do estabelecimento indisponível.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM public.polos WHERE company_id=v_company AND is_matriz
      AND public.is_active_status(status)) <> 1 THEN
    RAISE EXCEPTION 'Matriz institucional não identificada de forma única.' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_matrix FROM public.polos WHERE company_id=v_company AND is_matriz
    AND public.is_active_status(status);
  -- A caller allowed only in a filial cannot configure credentials through its ID.
  PERFORM private.authorize_nfse_model_scope(p_context_key,v_matrix,p_environment,p_month);
  RETURN v_matrix;
END;
$function$;
REVOKE ALL ON FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_configuration_metadata(p_polo_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_config private.nfse_configurations%ROWTYPE; v_cnpj text;
BEGIN
  SELECT * INTO v_config FROM private.nfse_configurations WHERE polo_id=p_polo_id AND environment=p_environment;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_cnpj FROM public.polos WHERE id=p_polo_id;
  RETURN jsonb_build_object('poloId',p_polo_id,'environment',p_environment,'cnpj',v_cnpj,
    'version',v_config.version,'configured',v_config.version IS NOT NULL,
    'municipalityCode',v_config.definition->>'municipalityCode',
    'municipalRegistration',nullif(v_config.definition->>'municipalRegistration',''),
    'portalAccess',coalesce(v_config.definition->>'portalAccess','CERTIFICATE'),
    'credentialSource',coalesce(v_config.definition->>'credentialSource','MATRIZ'),
    'opSimpNac',v_config.definition->>'opSimpNac','regEspTrib',v_config.definition->>'regEspTrib',
    'regApTribSN',v_config.definition->>'regApTribSN',
    'certificate',jsonb_build_object('configured',false,'subject',null,'expiresAt',null),
    'portalLoginConfigured',false,'canManage',true,
    'readiness',jsonb_build_object('status','BLOCKED',
      'message','Parâmetros fiscais não comprovam habilitação. Certificado, representação e conexão fiscal aguardam validação.'));
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_configuration_metadata(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
