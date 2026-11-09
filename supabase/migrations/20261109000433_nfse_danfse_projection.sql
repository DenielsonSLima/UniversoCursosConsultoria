BEGIN;

-- Presentation projection only; no raw XML, identifiers, invoice persistence or issuance.
-- Sources: NT 008 v1.02, 14/07/2026, pp.19-20; official production XSD v1.01.
-- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf
-- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip
-- XSD ZIP SHA256: e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072
CREATE FUNCTION public.get_nfse_danfse_projection_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_components jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET statement_timeout = '8s' AS $function$
DECLARE
  v_keys text[] := ARRAY['vDescIncond','vCalcReeRepRes','vISSQN','vPis','vCofins','vIBSTot','vCBS','vRetCSLL'];
  v_key text; v_raw jsonb; v_amounts numeric[] := ARRAY[]::numeric[];
  v_retention text; v_has_ibs boolean;
  v_exclusions numeric(18,2); v_ibs_total numeric(18,2);
  v_social numeric(18,2); v_pis_own numeric(18,2); v_cofins_own numeric(18,2);
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_components IS NULL OR jsonb_typeof(p_components) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_components) k
      WHERE k <> ALL(v_keys || ARRAY['tpRetPisCofins','hasIbsCbs']))
    OR jsonb_typeof(p_components->'hasIbsCbs') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Componentes da projeção DANFSe inválidos.' USING ERRCODE = '22023';
  END IF;
  v_has_ibs := (p_components->>'hasIbsCbs')::boolean;
  FOREACH v_key IN ARRAY v_keys LOOP
    v_raw := p_components->v_key;
    IF v_raw IS NULL OR v_raw = 'null'::jsonb THEN
      v_amounts := array_append(v_amounts,NULL::numeric);
    ELSE
      -- Exact TSDec15V2 grammar. Never accept floats, signs, exponent or rounded decimals.
      IF jsonb_typeof(v_raw) <> 'string'
        OR (p_components->>v_key) !~ '^(0|0\.[0-9]{2}|[1-9][0-9]{0,14}(\.[0-9]{2})?)$' THEN
        RAISE EXCEPTION 'Valor monetário incompatível com o esquema NFS-e.' USING ERRCODE = '22023';
      END IF;
      v_amounts := array_append(v_amounts,(p_components->>v_key)::numeric);
    END IF;
  END LOOP;
  v_retention := p_components->>'tpRetPisCofins';
  IF v_retention IS NOT NULL AND (jsonb_typeof(p_components->'tpRetPisCofins') <> 'string'
    OR v_retention !~ '^[0-9]$') THEN
    RAISE EXCEPTION 'Tipo de retenção inválido.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_has_ibs AND (v_amounts[2] IS NOT NULL OR v_amounts[6] IS NOT NULL OR v_amounts[7] IS NOT NULL) THEN
    RAISE EXCEPTION 'Componentes IBS/CBS sem o respectivo grupo.' USING ERRCODE = '22023';
  END IF;
  IF v_has_ibs THEN
    -- Each of these five XML elements has minOccurs=0. SUM ignores absent optional
    -- parcels (neutral element), but ALL absent stays NULL, not an invented XML zero.
    SELECT sum(value) INTO v_exclusions FROM unnest(v_amounts[1:5]) AS item(value);
    -- gIBS/gCBS and their totals are mandatory within the corresponding XSD groups.
    -- A partial total cannot be safely presented as the combined total.
    IF v_amounts[6] IS NOT NULL AND v_amounts[7] IS NOT NULL THEN
      v_ibs_total := v_amounts[6] + v_amounts[7];
    END IF;
  END IF;
  IF v_retention = '1' THEN
    -- Legacy retention representation: vRetCSLL, vPis and vCofins are all optional.
    SELECT sum(value) INTO v_social FROM unnest(ARRAY[v_amounts[8],v_amounts[4],v_amounts[5]]) AS item(value);
    v_pis_own := 0;
    v_cofins_own := 0;
  ELSE
    -- vRetCSLL is an explicit retained amount even if the optional retention code
    -- is absent. Without that code PIS/COFINS cannot be classified as own debits.
    v_social := v_amounts[8];
    IF v_retention IS NOT NULL THEN
      v_pis_own := v_amounts[4];
      v_cofins_own := v_amounts[5];
    END IF;
  END IF;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
    'exclusions',v_exclusions::text,'totalIBSCBS',v_ibs_total::text,
    'socialRetentions',v_social::text,'pisOwn',v_pis_own::text,'cofinsOwn',v_cofins_own::text));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_danfse_projection_secure(uuid,uuid,text,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_danfse_projection_secure(uuid,uuid,text,text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_danfse_projection_secure(uuid,uuid,text,text,jsonb) IS
  'Read-only pilot-scoped DANFSe numeric projection per NT008 v1.02. Whitelisted decimal components only; no XML, PII, persistence, tax-rate calculation or issuance.';

NOTIFY pgrst,'reload schema';
COMMIT;
