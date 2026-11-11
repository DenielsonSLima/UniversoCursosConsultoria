BEGIN;

-- Replay intent is resolved before mutable credentials or party data. A claimed
-- identity retains its existing one-dispatch lease and GET-only recovery path.
CREATE FUNCTION private.nfse_homologation_pilot_projection(p_row private.nfse_homologation_pilots)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('previewId',p_row.id,'expiresAt',p_row.expires_at,'state',p_row.state,'dispatch',false,
    'fiscalInput',p_row.fiscal_input||jsonb_build_object('series',p_row.series,'number',p_row.number::text,
      'issuedAt',to_char(p_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00'),
    'preview',p_row.preview,'result',p_row.result,'configurationVersion',p_row.configuration_version,
    'certificateFingerprint',p_row.certificate_fingerprint);
$function$;
REVOKE ALL ON FUNCTION private.nfse_homologation_pilot_projection(private.nfse_homologation_pilots)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nfse_homologation_pilot_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_claims text:=current_setting('request.jwt.claims',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_matrix uuid; v_config private.nfse_configurations%ROWTYPE;
  v_cert private.nfse_certificates%ROWTYPE;
  v_row private.nfse_homologation_pilots%ROWTYPE;
  v_issuer text; v_dispatch boolean:=false; v_dps text; v_partner uuid; v_recipient jsonb; v_expected jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501';
  END IF;
  IF p_environment IS DISTINCT FROM 'HOMOLOGACAO' OR p_request_id IS NULL
    OR p_action IS NULL OR p_action NOT IN ('PREVIEW','READ_BY_REQUEST','CLAIM','READ','FINISH') THEN
    RAISE EXCEPTION 'Piloto exclusivo de homologação.' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  IF p_polo_id IS DISTINCT FROM v_matrix THEN
    RAISE EXCEPTION 'Piloto disponível somente na matriz.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-pilot:'||p_actor_id::text||':'||p_request_id::text,0));
  IF p_action IN ('PREVIEW','READ_BY_REQUEST') THEN
    IF p_preview_id IS NOT NULL THEN RAISE EXCEPTION 'Identidade de prévia não permitida.' USING ERRCODE='22023'; END IF;
    IF p_action='PREVIEW' THEN
      IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>24000
        OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
          IS DISTINCT FROM ARRAY['fiscalInput','preview']::text[] THEN
        RAISE EXCEPTION 'Cenário técnico inválido.' USING ERRCODE='22023'; END IF;
    ELSIF p_input IS NOT NULL THEN
      IF jsonb_typeof(p_input)<>'object' OR (SELECT array_agg(key) FROM jsonb_object_keys(p_input) key)
        IS DISTINCT FROM ARRAY['recipientPartnerId']::text[]
        OR jsonb_typeof(p_input->'recipientPartnerId') IS DISTINCT FROM 'string'
        OR coalesce(p_input->>'recipientPartnerId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Referência de tomador inválida.' USING ERRCODE='22023'; END IF;
      v_partner:=(p_input->>'recipientPartnerId')::uuid;
    END IF;
    SELECT * INTO v_row FROM private.nfse_homologation_pilots WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE;
    IF FOUND THEN
      IF v_row.context_id IS DISTINCT FROM p_context_key OR v_row.polo_id IS DISTINCT FROM p_polo_id
        OR v_row.environment IS DISTINCT FROM p_environment OR v_row.month IS DISTINCT FROM p_month THEN
        RAISE EXCEPTION 'Requisição de piloto divergente.' USING ERRCODE='22023'; END IF;
      IF p_action='PREVIEW' THEN
        IF v_row.fiscal_input IS DISTINCT FROM p_input->'fiscalInput' OR v_row.preview IS DISTINCT FROM p_input->'preview' THEN
          RAISE EXCEPTION 'Requisição de piloto divergente.' USING ERRCODE='22023'; END IF;
      ELSIF (v_partner IS NULL AND (v_row.preview->>'recipientPartnerId' IS NOT NULL OR v_row.preview->>'recipientSource' IS NOT NULL))
        OR (v_partner IS NOT NULL AND (v_row.preview->>'recipientSource' IS DISTINCT FROM 'PARTNER'
          OR (v_row.preview->>'recipientPartnerId')::uuid IS DISTINCT FROM v_partner)) THEN
        RAISE EXCEPTION 'Requisição de piloto pertence a outro tomador.' USING ERRCODE='22023';
      END IF;
      RETURN private.nfse_homologation_pilot_projection(v_row);
    END IF;
    IF p_action='READ_BY_REQUEST' THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO v_config FROM private.nfse_configurations
    WHERE polo_id=p_polo_id AND environment=p_environment;
  SELECT * INTO v_cert FROM private.nfse_certificates
    WHERE polo_id=v_config.credential_polo_id AND environment=p_environment;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_issuer FROM public.polos WHERE id=p_polo_id;
  IF v_config.version IS NULL OR v_cert.fingerprint IS NULL OR v_cert.not_before>now()
    OR v_cert.expires_at<=now() OR v_cert.cnpj IS DISTINCT FROM v_issuer THEN
    RAISE EXCEPTION 'Configuração ou certificado de homologação indisponível.' USING ERRCODE='22023';
  END IF;
  IF p_action='PREVIEW' THEN
    IF jsonb_typeof(p_input->'preview') IS DISTINCT FROM 'object' OR jsonb_typeof(p_input->'fiscalInput') IS DISTINCT FROM 'object'
      OR p_input#>>'{fiscalInput,environment}' IS DISTINCT FROM 'HOMOLOGACAO'
      OR p_input#>>'{fiscalInput,issuer,taxId,type}' IS DISTINCT FROM 'CNPJ'
      OR p_input#>>'{fiscalInput,issuer,taxId,value}' IS DISTINCT FROM v_issuer
      OR p_input#>>'{fiscalInput,values,serviceAmount}' IS DISTINCT FROM '1.00'
      OR p_input#>>'{fiscalInput,review,ibscbs}' IS DISTINCT FROM 'SYNTHETIC_PILOT_OMISSION'
      OR p_input#>>'{fiscalInput,issuer,simpleNationalOption}' IS DISTINCT FROM v_config.definition->>'opSimpNac'
      OR p_input#>>'{fiscalInput,issuer,simpleNationalAssessment}' IS DISTINCT FROM v_config.definition->>'regApTribSN'
      OR p_input#>>'{fiscalInput,issuer,specialTaxRegime}' IS DISTINCT FROM v_config.definition->>'regEspTrib'
      OR p_input#>>'{fiscalInput,issuerMunicipalityCode}' IS DISTINCT FROM v_config.definition->>'municipalityCode' THEN
      RAISE EXCEPTION 'Cenário técnico inválido.' USING ERRCODE='22023'; END IF;
    IF (p_input->'preview') ?| ARRAY['technicalTest','recipientSource','recipientPartnerId'] THEN
      IF p_input#>'{preview,technicalTest}' IS DISTINCT FROM 'true'::jsonb
        OR p_input#>>'{preview,recipientSource}' IS DISTINCT FROM 'PARTNER'
        OR (p_input->'preview') ? 'synthetic'
        OR jsonb_typeof(p_input#>'{preview,recipientPartnerId}') IS DISTINCT FROM 'string'
        OR coalesce(p_input#>>'{preview,recipientPartnerId}','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Origem do tomador de teste inválida.' USING ERRCODE='22023'; END IF;
      v_partner:=(p_input#>>'{preview,recipientPartnerId}')::uuid;
      v_recipient:=public.get_nfse_homologation_recipient_internal(p_actor_id,p_context_key,p_polo_id,p_environment,p_month,v_partner);
      v_expected:=jsonb_build_object('taxId',jsonb_build_object('type',CASE WHEN length(v_recipient->>'document')=11
        THEN 'CPF' ELSE 'CNPJ' END,'value',v_recipient->>'document'),'name',v_recipient->>'name');
      IF p_input#>'{fiscalInput,recipient}' IS DISTINCT FROM v_expected
        OR p_input#>>'{preview,recipientName}' IS DISTINCT FROM v_recipient->>'name'
        OR p_input#>>'{preview,recipientDocument}' IS DISTINCT FROM v_recipient->>'document' THEN
        RAISE EXCEPTION 'Snapshot do tomador diverge do cadastro autorizado.' USING ERRCODE='22023'; END IF;
    ELSIF p_input#>'{preview,synthetic}' IS DISTINCT FROM 'true'::jsonb
      OR p_input#>>'{fiscalInput,recipient,taxId,value}' IS DISTINCT FROM v_issuer
      OR p_input#>>'{fiscalInput,recipient,name}' IS DISTINCT FROM 'TOMADOR SINTETICO - TESTE SEM VALOR FISCAL' THEN
      RAISE EXCEPTION 'Cenário sintético legado inválido.' USING ERRCODE='22023';
    END IF;
    INSERT INTO private.nfse_homologation_pilots(actor_id,context_id,polo_id,month,request_id,
      configuration_version,certificate_fingerprint,fiscal_input,preview)
    VALUES(p_actor_id,p_context_key,p_polo_id,p_month,p_request_id,v_config.version,v_cert.fingerprint,
      p_input->'fiscalInput',p_input->'preview') RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM private.nfse_homologation_pilots
      WHERE id=p_preview_id AND actor_id=p_actor_id AND context_id=p_context_key
        AND polo_id=p_polo_id AND environment=p_environment AND month=p_month
        AND request_id=p_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Piloto fora do contexto autorizado.' USING ERRCODE='42501'; END IF;
    IF p_action='CLAIM' THEN
      IF p_input IS NOT NULL THEN RAISE EXCEPTION 'Payload não permitido.' USING ERRCODE='22023'; END IF;
      IF v_row.state='PREVIEWED' THEN
        IF v_row.expires_at<=now() OR v_row.configuration_version<>v_config.version
          OR v_row.certificate_fingerprint<>v_cert.fingerprint THEN
          RAISE EXCEPTION 'Revise novamente o piloto; a configuração mudou ou a prévia expirou.' USING ERRCODE='40001';
        END IF;
        UPDATE private.nfse_homologation_pilots SET state='PROCESSING',updated_at=now()
          WHERE id=v_row.id RETURNING * INTO v_row;
        v_dispatch:=true;
      END IF;
    ELSIF p_action='READ' THEN
      IF p_input IS NOT NULL THEN RAISE EXCEPTION 'Payload não permitido.' USING ERRCODE='22023'; END IF;
    ELSE
      IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>4500000
        OR p_input->>'state' IS NULL
        OR p_input->>'state' NOT IN ('AUTHORIZED','REJECTED','AWAITING_CONFIRMATION','BLOCKED')
        OR coalesce(p_input->>'message','')='' OR length(p_input->>'message')>500 THEN
        RAISE EXCEPTION 'Resultado técnico inválido.' USING ERRCODE='22023';
      END IF;
      IF v_row.state='AUTHORIZED' THEN
        IF v_row.result->>'accessKey' IS DISTINCT FROM p_input->>'accessKey' THEN
          RAISE EXCEPTION 'Autorização já preservada.' USING ERRCODE='40001';
        END IF;
      ELSIF v_row.state IN ('PROCESSING','AWAITING_CONFIRMATION') THEN
        v_dps:='DPS'||(v_row.fiscal_input->>'issuerMunicipalityCode')||'2'||v_issuer||
          v_row.series||lpad(v_row.number::text,15,'0');
        IF p_input->>'dpsId' IS DISTINCT FROM v_dps THEN
          RAISE EXCEPTION 'Identidade DPS divergente.' USING ERRCODE='22023';
        END IF;
        IF p_input->>'state'='AUTHORIZED' AND
          (coalesce(p_input->>'accessKey','') !~ '^[0-9]{50}$'
            OR coalesce(p_input->>'authorizedXml','') NOT LIKE '%<%NFSe%'
            OR coalesce(p_input->>'authorizedXml','') LIKE '%<!DOCTYPE%') THEN
          RAISE EXCEPTION 'Prova de autorização ausente.' USING ERRCODE='22023';
        END IF;
        UPDATE private.nfse_homologation_pilots SET state=p_input->>'state',
          result=p_input-'authorizedXml'-'signedDpsXml',
          authorized_xml=CASE WHEN p_input->>'state'='AUTHORIZED' THEN p_input->>'authorizedXml' ELSE NULL END,
          updated_at=now() WHERE id=v_row.id RETURNING * INTO v_row;
      ELSIF v_row.state IS DISTINCT FROM p_input->>'state' THEN
        RAISE EXCEPTION 'Transição de piloto inválida.' USING ERRCODE='40001';
      END IF;
    END IF;
  END IF;
  RETURN private.nfse_homologation_pilot_projection(v_row)||jsonb_build_object('dispatch',v_dispatch);
END;
$function$;
REVOKE ALL ON FUNCTION public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
