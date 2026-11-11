BEGIN;

-- Bound presentation-only names to the DTO limit; references keep their original identity.
CREATE OR REPLACE FUNCTION private.nfse_model_partner_label(p_polo_id uuid,p_partner_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT left(nullif(btrim(p.nome),''),300) FROM public.parceiros p WHERE p.id=p_partner_id
    AND public.is_active_status(p.status)
    AND (p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
      OR (p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO'));
$function$;
REVOKE ALL ON FUNCTION private.nfse_model_partner_label(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.search_nfse_model_partners_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_search text,p_partner_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='8s' AS $function$
DECLARE v_rows jsonb:='[]'; v_search text:=btrim(coalesce(p_search,''));
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF length(v_search)>100 THEN RAISE EXCEPTION 'Busca de parceiro inválida.' USING ERRCODE='22023'; END IF;
  IF p_partner_id IS NOT NULL OR length(v_search)>=2 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',left(p.nome,300)) ORDER BY lower(p.nome),p.id),'[]')
    INTO v_rows FROM (SELECT p.id,p.nome FROM public.parceiros p
      WHERE public.is_active_status(p.status) AND nullif(btrim(p.nome),'') IS NOT NULL
        AND (p.polo_id=p_polo_id OR p_polo_id=ANY(coalesce(p.polo_ids,ARRAY[]::uuid[]))
          OR (p.polo_id IS NULL AND upper(btrim(p.tipo))<>'ALUNO'))
        AND ((p_partner_id IS NOT NULL AND p.id=p_partner_id)
          OR (p_partner_id IS NULL AND position(lower(v_search) IN lower(p.nome))>0))
      ORDER BY lower(p.nome),p.id LIMIT 20) p;
  END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('rows',v_rows,
    'page',1,'pageSize',20,'totalItems',jsonb_array_length(v_rows)));
END;
$function$;
REVOKE ALL ON FUNCTION public.search_nfse_model_partners_secure(uuid,uuid,text,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.search_nfse_model_partners_secure(uuid,uuid,text,text,text,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
