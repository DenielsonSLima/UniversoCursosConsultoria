BEGIN;

-- Dedicated API operation; never reserves or changes academic receipts.
-- Series 49998 is an explicit operational reservation for this individual flow.
CREATE TABLE private.nfse_individual_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, context_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id), environment text NOT NULL CHECK(environment='PRODUCAO'),
  month text NOT NULL, request_id uuid NOT NULL, command jsonb NOT NULL, snapshot jsonb NOT NULL,
  configuration_version integer NOT NULL, certificate_fingerprint text NOT NULL,
  series text NOT NULL DEFAULT '49998' CHECK(series='49998'), number bigint GENERATED ALWAYS AS IDENTITY,
  dps_id text, fiscal_input jsonb, signed_dps_xml text,
  state text NOT NULL DEFAULT 'PREVIEWED' CHECK(state IN
    ('PREVIEWED','PROCESSING','AUTHORIZED','REJECTED','AWAITING_CONFIRMATION','BLOCKED')),
  result jsonb, authorized_xml text, created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_id), UNIQUE(polo_id,environment,series,number)
);
ALTER TABLE private.nfse_individual_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_individual_operations FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.nfse_individual_operations_number_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.nfse_individual_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE REFERENCES private.nfse_individual_operations(id),
  reason_code text NOT NULL CHECK(reason_code='1'), justification text NOT NULL CHECK(length(justification) BETWEEN 15 AND 255),
  access_key text NOT NULL CHECK(access_key~'^[0-9]{50}$'), event_reference_id text NOT NULL,
  event_input jsonb, signed_event_xml text, result jsonb, event_xml text,
  state text NOT NULL DEFAULT 'PREVIEWED' CHECK(state IN
    ('PREVIEWED','PROCESSING','CANCELLED','CANCELLATION_PENDING','CANCELLATION_REJECTED','AWAITING_ANALYSIS','BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.nfse_individual_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_individual_cancellations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.authorize_nfse_individual_internal(
  p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_claims text:=current_setting('request.jwt.claims',true); v_sub text:=current_setting('request.jwt.claim.sub',true); v_matrix uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor_id IS NULL OR p_environment IS DISTINCT FROM 'PRODUCAO' THEN
    RAISE EXCEPTION 'Executor individual de produção obrigatório.' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_matrix:=private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  PERFORM set_config('request.jwt.claims',coalesce(v_claims,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  IF p_polo_id IS DISTINCT FROM v_matrix THEN
    RAISE EXCEPTION 'Operação individual restrita à matriz.' USING ERRCODE='42501'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.authorize_nfse_individual_internal(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_individual_projection(p_row private.nfse_individual_operations,p_dispatch boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT jsonb_build_object('previewId',p_row.id,'expiresAt',p_row.expires_at,'state',p_row.state,'dispatch',p_dispatch,
    'snapshot',p_row.snapshot,'series',p_row.series,'number',p_row.number::text,'dpsId',p_row.dps_id,
    'issuedAt',to_char(p_row.created_at AT TIME ZONE 'America/Maceio','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
    'fiscalInput',p_row.fiscal_input,'signedDpsXml',p_row.signed_dps_xml,'result',p_row.result,
    'configurationVersion',p_row.configuration_version,'certificateFingerprint',p_row.certificate_fingerprint,
    'authorizedXml',p_row.authorized_xml)
$function$;
REVOKE ALL ON FUNCTION private.nfse_individual_projection(private.nfse_individual_operations,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
