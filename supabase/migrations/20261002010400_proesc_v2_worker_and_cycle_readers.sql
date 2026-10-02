BEGIN;

CREATE FUNCTION public.proesc_v2_worker_service(p_action text,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor uuid; v_secret text; v_expected bytea; v_received bytea;
  v_difference integer:=0; i integer; v_request bigint;
BEGIN
  IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'
    IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso interno Proesc não autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT updated_by INTO STRICT v_actor FROM internal_proesc.connection_v2 WHERE id;
  PERFORM internal_proesc.authorize_financial_operator(v_actor);
  IF p_action IS NULL OR p_action NOT IN ('authorize','enqueue')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Operação interna V2 inválida.' USING ERRCODE='22023'; END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='proesc_sync_worker_secret';
  IF v_secret IS NULL THEN RAISE EXCEPTION 'Worker V2 indisponível.' USING ERRCODE='42501'; END IF;
  IF p_action='authorize' THEN
    IF NOT coalesce(p_payload->>'key' ~ '^[0-9a-f]{64}$',false) THEN
      RAISE EXCEPTION 'Credencial interna inválida.' USING ERRCODE='42501'; END IF;
    v_expected:=extensions.digest(v_secret,'sha256');
    v_received:=extensions.digest(p_payload->>'key','sha256');
    FOR i IN 0..31 LOOP
      v_difference:=v_difference | (get_byte(v_expected,i) # get_byte(v_received,i));
    END LOOP;
    IF v_difference<>0 THEN RAISE EXCEPTION 'Credencial interna inválida.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('actorId',v_actor);
  END IF;
  IF p_payload<>'{}'::jsonb THEN RAISE EXCEPTION 'Agendamento sem parâmetros externos.' USING ERRCODE='22023'; END IF;
  IF NOT (SELECT enabled FROM internal_proesc.v2_runtime WHERE singleton)
    OR EXISTS(SELECT 1 FROM internal_proesc.v2_tasks t JOIN internal_proesc.v2_runs r ON r.id=t.run_id
      WHERE r.status='RUNNING' AND t.lease_until>now()) THEN
    RETURN jsonb_build_object('scheduled',false);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.v2_runs WHERE status='RUNNING')
    AND EXISTS(SELECT 1 FROM internal_proesc.v2_runs WHERE created_at>now()-interval '15 minutes') THEN
    RETURN jsonb_build_object('scheduled',false);
  END IF;
  v_request:=net.http_post(url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-api',
    body:='{"action":"internal_v2_sync"}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','X-Proesc-Sync-Secret',v_secret),
    timeout_milliseconds:=120000);
  RETURN jsonb_build_object('scheduled',true,'requestId',v_request);
END;
$function$;

CREATE FUNCTION public.proesc_v2_cycle_review_service(p_actor_id uuid,p_matricula_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_evidence internal_proesc.enrollment_cycle_evidence; v_state jsonb;
BEGIN
  PERFORM internal_proesc.authorize_cycle_review(p_actor_id,p_matricula_id);
  SELECT * INTO v_evidence FROM internal_proesc.enrollment_cycle_evidence WHERE matricula_id=p_matricula_id;
  IF v_evidence.has_external_cycle2 IS TRUE THEN
    RETURN jsonb_build_object('classification','FULL','eligible',false,'source','CONFIRMED_LOCAL_HISTORY',
      'reason','Segundo ciclo externo já comprovado e protegido.',
      'observedAt',v_evidence.source_observed_at,'validUntil',NULL);
  END IF;
  IF internal_proesc.has_confirmed_first_cycle_only(p_matricula_id) THEN
    v_state:=internal_academic.technical_manual_cycle_state(p_matricula_id);
    RETURN jsonb_build_object('classification','C1','eligible',coalesce((v_state->>'podeGerar')::boolean,false),
      'source','CONFIRMED_LOCAL_HISTORY',
      'reason','Passagem de ciclo já comprovada; regras de emissão permanecem no contrato local.',
      'observedAt',v_evidence.source_observed_at,'validUntil',NULL);
  END IF;
  RETURN jsonb_build_object('classification','UNKNOWN','eligible',false,'source','PROESC_V2_REVIEW',
    'reason','A classificação individual do ciclo ainda requer conferência. A consulta financeira V2 não presume primeiro ciclo.',
    'observedAt',v_evidence.source_observed_at,'validUntil',NULL);
END;
$function$;

CREATE FUNCTION public.proesc_v2_class_cycle_review_service(p_actor_id uuid,p_turma_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_id uuid; v_result jsonb; v_reviewed integer:=0; v_c1 integer:=0; v_full integer:=0;
  v_unknown integer:=0; v_protected integer:=0; v_eligible integer:=0;
BEGIN
  SELECT m.id INTO v_id FROM public.matriculas m JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
    WHERE m.turma_id=p_turma_id AND s.phase='CONFIRMED' ORDER BY m.id LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Turma Proesc confirmada não encontrada.' USING ERRCODE='22023'; END IF;
  PERFORM internal_proesc.authorize_cycle_review(p_actor_id,v_id);
  FOR v_id IN SELECT m.id FROM public.matriculas m WHERE m.turma_id=p_turma_id ORDER BY m.id LOOP
    v_result:=public.proesc_v2_cycle_review_service(p_actor_id,v_id);
    v_reviewed:=v_reviewed+1;
    IF EXISTS(SELECT 1 FROM internal_academic.technical_manual_cycle_runs WHERE matricula_id=v_id)
      OR EXISTS(SELECT 1 FROM internal_academic.technical_external_cycle_coverage WHERE matricula_id=v_id) THEN
      v_protected:=v_protected+1;
    ELSIF v_result->>'classification'='C1' THEN v_c1:=v_c1+1;
    ELSIF v_result->>'classification'='FULL' THEN v_full:=v_full+1;
    ELSE v_unknown:=v_unknown+1; END IF;
    IF v_result->'eligible'='true'::jsonb THEN v_eligible:=v_eligible+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('success',v_unknown=0,'turmaId',p_turma_id,'reviewed',v_reviewed,'failed',0,
    'c1',v_c1,'full',v_full,'unknown',v_unknown,'protected',v_protected,'eligible',v_eligible,
    'pending',v_unknown,'sourceRequests',0,'progressiveCount',0,'sourceFailed',false,
    'observedAt',now(),'errors','[]'::jsonb,'message',CASE WHEN v_unknown>0
      THEN 'A classificação individual de algumas matrículas ainda requer conferência; os fatos confirmados foram preservados.' END);
END;
$function$;
REVOKE ALL ON FUNCTION public.proesc_v2_worker_service(text,jsonb),public.proesc_v2_cycle_review_service(uuid,uuid),
  public.proesc_v2_class_cycle_review_service(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.proesc_v2_worker_service(text,jsonb),public.proesc_v2_cycle_review_service(uuid,uuid),
  public.proesc_v2_class_cycle_review_service(uuid,uuid)
TO service_role;

-- The new scheduler is inert until runtime.activate accepts a complete FULL run.
SELECT cron.schedule('proesc-v2-observations','*/2 * * * *',
  $job$SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT public.proesc_v2_worker_service('enqueue');$job$);
NOTIFY pgrst,'reload schema';
COMMIT;
