BEGIN;

-- Compatibility with the currently deployed UI parser. API_SCHEDULE_REVIEW is
-- its response discriminator, not a claim of a new request to the Proesc API.
-- observedAt/validUntil describe this authorized read of canonical eligibility.
-- They never replace or expire durable cycle evidence or its original timestamp.
CREATE OR REPLACE FUNCTION public.proesc_v2_cycle_review_service(p_actor_id uuid,p_matricula_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_evidence internal_proesc.enrollment_cycle_evidence;
  v_state jsonb;
  v_observed timestamptz;
  v_eligible boolean;
  v_response jsonb;
BEGIN
  PERFORM internal_proesc.authorize_cycle_review(p_actor_id,p_matricula_id);
  v_observed:=clock_timestamp();
  SELECT * INTO v_evidence FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=p_matricula_id;
  v_response:=jsonb_build_object('source','API_SCHEDULE_REVIEW','version','v2',
    'observedAt',v_observed,'validUntil',NULL,'evidenceObservedAt',v_evidence.source_observed_at);
  IF v_evidence.has_external_cycle2 IS TRUE THEN
    RETURN v_response||jsonb_build_object('classification','FULL','eligible',false,
      'evidenceSource','CONFIRMED_LOCAL_HISTORY',
      'reason','Segundo ciclo externo já comprovado e protegido.');
  END IF;
  IF internal_proesc.has_confirmed_first_cycle_only(p_matricula_id) THEN
    v_state:=internal_academic.technical_manual_cycle_state(p_matricula_id);
    v_eligible:=coalesce((v_state->>'podeGerar')::boolean,false);
    RETURN v_response||jsonb_build_object('classification','C1','eligible',v_eligible,
      'evidenceSource','CONFIRMED_LOCAL_HISTORY',
      'reason','Passagem de ciclo já comprovada; regras de emissão permanecem no contrato local.',
      'validUntil',CASE WHEN v_eligible THEN v_observed+interval '5 minutes' END);
  END IF;
  RETURN v_response||jsonb_build_object('classification','UNKNOWN','eligible',false,
    'evidenceSource','PROESC_V2_REVIEW',
    'reason','A classificação individual do ciclo ainda requer conferência. A consulta financeira V2 não presume primeiro ciclo.');
END;
$function$;

REVOKE ALL ON FUNCTION public.proesc_v2_cycle_review_service(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.proesc_v2_cycle_review_service(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
