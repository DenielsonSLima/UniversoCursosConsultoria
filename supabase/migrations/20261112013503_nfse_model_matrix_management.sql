BEGIN;

-- Emission presets are managed centrally; destination scopes retain read/use access.
CREATE FUNCTION private.nfse_model_management_allowed(p_polo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT EXISTS(SELECT 1 FROM public.polos p WHERE p.id=p_polo_id AND p.is_matriz IS TRUE
    AND p.company_id IS NOT NULL AND public.is_active_status(p.status)
    AND (SELECT count(*) FROM public.polos matrix WHERE matrix.company_id=p.company_id
      AND matrix.is_matriz IS TRUE AND public.is_active_status(matrix.status))=1)
$function$;
REVOKE ALL ON FUNCTION private.nfse_model_management_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.authorize_nfse_model_management_scope(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF NOT private.nfse_model_management_allowed(p_polo_id) THEN
    RAISE EXCEPTION 'Os modelos de emissão são gerenciados somente na matriz.' USING ERRCODE='42501'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.authorize_nfse_model_management_scope(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

-- Preserve all validators, snapshots and immutable historical replay payloads.
-- The new authorization precedes calling those cores, including their replay lookup.
ALTER FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)
  RENAME TO save_nfse_model_core_20261112;
REVOKE ALL ON FUNCTION public.save_nfse_model_core_20261112(uuid,uuid,text,text,uuid,uuid,integer,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.save_nfse_model_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,
  p_id uuid,p_expected_version integer,p_definition jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $function$
BEGIN
  PERFORM private.authorize_nfse_model_management_scope(p_context_key,p_polo_id,p_environment,p_month);
  RETURN public.save_nfse_model_core_20261112(p_context_key,p_polo_id,p_environment,p_month,
    p_request_id,p_id,p_expected_version,p_definition);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb) TO authenticated;

ALTER FUNCTION public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer)
  RENAME TO mutate_nfse_model_core_20261112;
REVOKE ALL ON FUNCTION public.mutate_nfse_model_core_20261112(uuid,uuid,text,text,uuid,text,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mutate_nfse_model_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,
  p_action text,p_id uuid,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $function$
BEGIN
  PERFORM private.authorize_nfse_model_management_scope(p_context_key,p_polo_id,p_environment,p_month);
  RETURN public.mutate_nfse_model_core_20261112(p_context_key,p_polo_id,p_environment,p_month,
    p_request_id,p_action,p_id,p_expected_version);
END;
$function$;
REVOKE ALL ON FUNCTION public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.nfse_model_projection(p_model private.nfse_models,p_destination uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT private.nfse_model_extended_option_labels(private.nfse_model_people_option_labels(
    private.nfse_model_service_option_labels(p_model.definition),p_destination),p_destination)
    ||jsonb_build_object('id',p_model.id,'version',p_model.version,'sourcePoloId',p_model.polo_id,
      'sourcePoloName',origin.nome,'inherited',p_model.polo_id<>p_destination,
      'canManage',p_model.polo_id=p_destination AND private.nfse_model_management_allowed(p_destination))
  FROM public.polos origin WHERE origin.id=p_model.polo_id;
$function$;
REVOKE ALL ON FUNCTION private.nfse_model_projection(private.nfse_models,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_models_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  SELECT coalesce(jsonb_agg(private.nfse_model_projection(model,p_polo_id)
    ORDER BY lower(model.definition->>'name'),model.id),'[]'::jsonb) INTO v_rows
  FROM private.nfse_models model WHERE private.nfse_model_visible_to_polo(model.polo_id,p_polo_id,model.definition)
    AND model.environment=p_environment
    -- Keep legacy branch rows for fiscal history, outside the central model list.
    AND EXISTS(SELECT 1 FROM public.polos origin JOIN public.polos destination
      ON destination.company_id=origin.company_id
      WHERE origin.id=model.polo_id AND destination.id=p_polo_id AND origin.company_id IS NOT NULL
        AND origin.is_matriz IS TRUE AND public.is_active_status(origin.status)
        AND public.is_active_status(destination.status));
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,'page',1,
    'pageSize',greatest(100,jsonb_array_length(v_rows)),'totalItems',jsonb_array_length(v_rows),
    'canManage',private.nfse_model_management_allowed(p_polo_id)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_models_secure(uuid,uuid,text,text) TO authenticated;

-- A shared model's existence is not a management grant in a branch workspace.
ALTER FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) RENAME TO get_nfse_workspace_core_20261112;
REVOKE ALL ON FUNCTION public.get_nfse_workspace_core_20261112(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_nfse_workspace_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_response jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  v_response:=public.get_nfse_workspace_core_20261112(p_context_key,p_polo_id,p_environment,p_month);
  RETURN jsonb_set(v_response,'{data,capabilities,manageModels}',to_jsonb(private.nfse_model_management_allowed(p_polo_id)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
