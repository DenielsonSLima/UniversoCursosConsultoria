BEGIN;

-- A separate technical ledger: no receipt, reservation or academic queue is changed.
CREATE TABLE private.nfse_homologation_pilots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  context_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL DEFAULT 'HOMOLOGACAO' CHECK (environment='HOMOLOGACAO'),
  month text NOT NULL,
  request_id uuid NOT NULL,
  configuration_version integer NOT NULL,
  certificate_fingerprint text NOT NULL,
  series text NOT NULL DEFAULT '49999' CHECK (series='49999'),
  number bigint GENERATED ALWAYS AS IDENTITY,
  fiscal_input jsonb NOT NULL,
  preview jsonb NOT NULL,
  state text NOT NULL DEFAULT 'PREVIEWED' CHECK (state IN
    ('PREVIEWED','PROCESSING','AUTHORIZED','REJECTED','AWAITING_CONFIRMATION','BLOCKED')),
  result jsonb,
  authorized_xml text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_id),
  UNIQUE(polo_id,environment,series,number)
);
ALTER TABLE private.nfse_homologation_pilots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_homologation_pilots FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.nfse_homologation_pilots_number_seq FROM PUBLIC,anon,authenticated,service_role;

-- Deliberately unavailable to browsers: an authenticated Edge reauthorizes every command.
CREATE FUNCTION public.nfse_homologation_pilot_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_action text,p_preview_id uuid DEFAULT NULL,p_input jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_claims text:=current_setting('request.jwt.claims',true);
  v_sub text:=current_setting('request.jwt.claim.sub',true);
  v_matrix uuid; v_config private.nfse_configurations%ROWTYPE;
  v_cert private.nfse_certificates%ROWTYPE;
  v_row private.nfse_homologation_pilots%ROWTYPE;
  v_issuer text; v_payload jsonb; v_dispatch boolean:=false; v_dps text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Canal interno obrigatório.' USING ERRCODE='42501';
  END IF;
  IF p_environment IS DISTINCT FROM 'HOMOLOGACAO' OR p_request_id IS NULL
    OR p_action IS NULL OR p_action NOT IN ('PREVIEW','CLAIM','READ','FINISH') THEN
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
  SELECT * INTO v_config FROM private.nfse_configurations
    WHERE polo_id=p_polo_id AND environment=p_environment;
  SELECT * INTO v_cert FROM private.nfse_certificates
    WHERE polo_id=v_config.credential_polo_id AND environment=p_environment;
  SELECT regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') INTO v_issuer FROM public.polos WHERE id=p_polo_id;
  IF v_config.version IS NULL OR v_cert.fingerprint IS NULL OR v_cert.not_before>now()
    OR v_cert.expires_at<=now() OR v_cert.cnpj IS DISTINCT FROM v_issuer THEN
    RAISE EXCEPTION 'Configuração ou certificado de homologação indisponível.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-pilot:'||p_actor_id::text||':'||p_request_id::text,0));
  IF p_action='PREVIEW' THEN
    IF p_preview_id IS NOT NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
      OR octet_length(p_input::text)>24000
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_input) key)
        IS DISTINCT FROM ARRAY['fiscalInput','preview']::text[]
      OR p_input#>'{preview,synthetic}' IS DISTINCT FROM 'true'::jsonb
      OR p_input#>>'{fiscalInput,environment}' IS DISTINCT FROM 'HOMOLOGACAO'
      OR p_input#>>'{fiscalInput,issuer,taxId,type}' IS DISTINCT FROM 'CNPJ'
      OR p_input#>>'{fiscalInput,issuer,taxId,value}' IS DISTINCT FROM v_issuer
      OR p_input#>>'{fiscalInput,recipient,taxId,value}' IS DISTINCT FROM v_issuer
      OR p_input#>>'{fiscalInput,recipient,name}' IS DISTINCT FROM 'TOMADOR SINTETICO - TESTE SEM VALOR FISCAL'
      OR p_input#>>'{fiscalInput,values,serviceAmount}' IS DISTINCT FROM '1.00'
      OR p_input#>>'{fiscalInput,review,ibscbs}' IS DISTINCT FROM 'SYNTHETIC_PILOT_OMISSION'
      OR p_input#>>'{fiscalInput,issuer,simpleNationalOption}' IS DISTINCT FROM v_config.definition->>'opSimpNac'
      OR p_input#>>'{fiscalInput,issuer,specialTaxRegime}' IS DISTINCT FROM v_config.definition->>'regEspTrib'
      OR p_input#>>'{fiscalInput,issuerMunicipalityCode}' IS DISTINCT FROM v_config.definition->>'municipalityCode' THEN
      RAISE EXCEPTION 'Cenário técnico sintético inválido.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_row FROM private.nfse_homologation_pilots
      WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE;
    IF FOUND THEN
      IF v_row.context_id IS DISTINCT FROM p_context_key OR v_row.polo_id IS DISTINCT FROM p_polo_id
        OR v_row.month IS DISTINCT FROM p_month OR v_row.fiscal_input IS DISTINCT FROM p_input->'fiscalInput'
        OR v_row.preview IS DISTINCT FROM p_input->'preview' THEN
        RAISE EXCEPTION 'Requisição de piloto divergente.' USING ERRCODE='22023';
      END IF;
    ELSE
      INSERT INTO private.nfse_homologation_pilots(actor_id,context_id,polo_id,month,request_id,
        configuration_version,certificate_fingerprint,fiscal_input,preview)
      VALUES(p_actor_id,p_context_key,p_polo_id,p_month,p_request_id,v_config.version,v_cert.fingerprint,
        p_input->'fiscalInput',p_input->'preview') RETURNING * INTO v_row;
    END IF;
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
  v_payload:=v_row.fiscal_input||jsonb_build_object('series',v_row.series,'number',v_row.number::text,
    'issuedAt',to_char(v_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00');
  RETURN jsonb_build_object('previewId',v_row.id,'expiresAt',v_row.expires_at,
    'state',v_row.state,'dispatch',v_dispatch,'fiscalInput',v_payload,'preview',v_row.preview,
    'result',v_row.result,'configurationVersion',v_row.configuration_version,
    'certificateFingerprint',v_row.certificate_fingerprint);
END;
$function$;
REVOKE ALL ON FUNCTION public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.nfse_homologation_pilot_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb)
  TO service_role;
COMMIT;
