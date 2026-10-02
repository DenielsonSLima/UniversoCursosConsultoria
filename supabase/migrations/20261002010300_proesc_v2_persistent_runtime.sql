BEGIN;

CREATE FUNCTION internal_proesc.v2_run_status(p_run_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT jsonb_build_object('runId',r.id,'mode',r.mode,'status',r.status,
    'createdAt',r.created_at,'finishedAt',r.finished_at,
    'tasks',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM
      (SELECT resource,status,count(*) count,sum(records_seen) records
       FROM internal_proesc.v2_tasks WHERE run_id=r.id GROUP BY resource,status) q),
    'invoices',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM
      (SELECT result,reason,count(*) count FROM internal_proesc.v2_invoice_observations
       WHERE run_id=r.id GROUP BY result,reason) q),
    'people',(SELECT jsonb_build_object('count',count(*),'matched',coalesce(sum(matched),0),
      'review',coalesce(sum(review),0)) FROM internal_proesc.v2_people_observations WHERE run_id=r.id))
  FROM internal_proesc.v2_runs r WHERE r.id=p_run_id;
$function$;

CREATE FUNCTION public.proesc_v2_runtime_service(
  p_action text,p_actor_id uuid,p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE
  v_revision uuid;
  v_run internal_proesc.v2_runs;
  v_task internal_proesc.v2_tasks;
  v_page internal_proesc.v2_pages;
  v_mode text;
  v_id uuid;
  v_hash text;
  v_observed timestamptz;
  v_row jsonb;
  v_observation record;
  v_result text;
  v_counts jsonb:='{}'::jsonb;
  v_count integer:=0;
  v_remaining integer;
  v_page_number integer;
  v_last integer;
  v_total integer;
  v_rows integer;
BEGIN
  PERFORM internal_proesc.authorize_financial_operator(p_actor_id);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_action IS NULL
    OR p_action NOT IN ('start','status','claim','commit','apply','fail','activate') THEN
    RAISE EXCEPTION 'Operação V2 inválida.' USING ERRCODE='22023';
  END IF;
  SELECT revision INTO STRICT v_revision FROM internal_proesc.connection_v2
    WHERE id AND updated_by=p_actor_id;
  -- Every runtime transition is serialized. HTTP fetches happen outside SQL.
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:v2:runtime',0));
  IF p_action='status' THEN
    SELECT * INTO v_run FROM internal_proesc.v2_runs
      WHERE (p_payload->>'runId' IS NULL OR id=(p_payload->>'runId')::uuid)
      ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('enabled',(SELECT enabled FROM internal_proesc.v2_runtime WHERE singleton),
      'run',internal_proesc.v2_run_status(v_run.id));
  END IF;
  IF p_action='start' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('runId','mode','activate'))
      OR NOT coalesce(p_payload->>'runId' ~ '^[0-9a-f-]{36}$',false)
      OR coalesce(p_payload->>'activate','false')<>'false' THEN
      RAISE EXCEPTION 'Início V2 exige runId e ativação posterior à validação.' USING ERRCODE='22023';
    END IF;
    v_id:=(p_payload->>'runId')::uuid;
    v_mode:=coalesce(p_payload->>'mode','FULL');
    IF v_mode NOT IN ('FULL','RECENT') THEN RAISE EXCEPTION 'Escopo V2 inválido.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_run FROM internal_proesc.v2_runs WHERE id=v_id;
    IF FOUND THEN
      IF v_run.actor_id<>p_actor_id OR v_run.credential_revision<>v_revision OR v_run.mode<>v_mode THEN
        RAISE EXCEPTION 'runId reutilizado com outra intenção.' USING ERRCODE='40001';
      END IF;
      RETURN internal_proesc.v2_run_status(v_id)||jsonb_build_object('replayed',true);
    END IF;
    IF EXISTS(SELECT 1 FROM internal_proesc.v2_runs WHERE status='RUNNING') THEN
      RAISE EXCEPTION 'Existe uma consulta V2 em andamento.' USING ERRCODE='40001';
    END IF;
    INSERT INTO internal_proesc.v2_runs(id,actor_id,credential_revision,mode) VALUES(v_id,p_actor_id,v_revision,v_mode);
    IF v_mode='FULL' THEN
      INSERT INTO internal_proesc.v2_tasks(run_id,resource,unit_id,source_year,source_month)
      SELECT DISTINCT v_id,'people',source_unit_id,0,0 FROM internal_proesc.class_scopes WHERE phase='CONFIRMED';
      INSERT INTO internal_proesc.v2_tasks(run_id,resource,unit_id,source_year,source_month)
      SELECT v_id,'invoices',b.unit_id,extract(year FROM d)::integer,extract(month FROM d)::integer
      FROM (SELECT l.source_unit_id unit_id,date_trunc('month',min(c.data_vencimento)) first_due,
        date_trunc('month',max(c.data_vencimento)) last_due
        FROM internal_proesc.obligation_links l JOIN public.contas_receber c ON c.id=l.receivable_id
        GROUP BY l.source_unit_id) b
      CROSS JOIN LATERAL generate_series(b.first_due,b.last_due,interval '1 month') d;
    ELSE
      INSERT INTO internal_proesc.v2_tasks(run_id,resource,unit_id,source_year,source_month)
      SELECT DISTINCT v_id,'invoices',s.source_unit_id,extract(year FROM d)::integer,extract(month FROM d)::integer
      FROM internal_proesc.class_scopes s CROSS JOIN LATERAL generate_series(
        date_trunc('month',now() AT TIME ZONE 'America/Maceio')-interval '1 month',
        date_trunc('month',now() AT TIME ZONE 'America/Maceio'),interval '1 month') d
      WHERE s.phase='CONFIRMED';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM internal_proesc.v2_tasks WHERE run_id=v_id) THEN
      RAISE EXCEPTION 'Nenhum escopo Proesc confirmado.' USING ERRCODE='22023';
    END IF;
    RETURN internal_proesc.v2_run_status(v_id);
  END IF;
  IF p_action='activate' THEN
    SELECT * INTO STRICT v_run FROM internal_proesc.v2_runs WHERE id=(p_payload->>'runId')::uuid;
    IF v_run.status<>'COMPLETE' OR v_run.mode<>'FULL' OR v_run.credential_revision<>v_revision
      OR v_run.actor_id<>p_actor_id OR v_run.finished_at<now()-interval '1 day' THEN
      RAISE EXCEPTION 'Ativação exige inventário V2 completo e atual.' USING ERRCODE='40001';
    END IF;
    IF EXISTS(SELECT 1 FROM internal_proesc.sync_runtime WHERE id AND lease_until>now())
      OR EXISTS(SELECT 1 FROM internal_proesc.cycle_review_runtime WHERE id AND lease_until>now()) THEN
      RAISE EXCEPTION 'Aguarde a conclusão da consulta anterior antes da troca.' USING ERRCODE='40001';
    END IF;
    UPDATE internal_proesc.sync_runtime SET enabled=false WHERE id;
    UPDATE internal_proesc.cycle_review_runtime SET enabled=false WHERE id;
    UPDATE internal_proesc.v2_runtime SET enabled=true,activated_at=now(),activated_by=p_actor_id WHERE singleton;
    -- Confirmed cycle facts, V1 history and all gateway titles are untouched.
    RETURN jsonb_build_object('activated',true,'version','v2','runId',v_run.id);
  END IF;
  IF p_action='claim' THEN
    IF p_payload<>'{}'::jsonb THEN RAISE EXCEPTION 'Claim sem filtros externos.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_run FROM internal_proesc.v2_runs WHERE status='RUNNING';
    IF FOUND AND EXISTS(SELECT 1 FROM internal_proesc.v2_tasks WHERE run_id=v_run.id
      AND status IN ('PENDING','COLLECTED') AND attempts>=5 AND lease_until<=now()) THEN
      UPDATE internal_proesc.v2_tasks SET status='FAILED',error_code='LEASE_EXHAUSTED',
        lease_id=NULL,lease_until=NULL,updated_at=now()
        WHERE run_id=v_run.id AND status IN ('PENDING','COLLECTED') AND attempts>=5 AND lease_until<=now();
      UPDATE internal_proesc.v2_runs SET status='FAILED',finished_at=now() WHERE id=v_run.id;
      RETURN jsonb_build_object('claimed',false,'runFailed',true,'reason','LEASE_EXHAUSTED');
    END IF;
    IF NOT FOUND THEN
      IF NOT (SELECT enabled FROM internal_proesc.v2_runtime WHERE singleton) THEN
        RETURN jsonb_build_object('claimed',false); END IF;
      IF NOT EXISTS(SELECT 1 FROM internal_proesc.v2_runs WHERE mode='FULL' AND status='COMPLETE'
        AND finished_at>now()-interval '24 hours') THEN v_mode:='FULL';
      ELSIF NOT EXISTS(SELECT 1 FROM internal_proesc.v2_runs WHERE created_at>now()-interval '15 minutes') THEN
        v_mode:='RECENT';
      ELSE RETURN jsonb_build_object('claimed',false); END IF;
      v_id:=gen_random_uuid();
      PERFORM public.proesc_v2_runtime_service('start',p_actor_id,jsonb_build_object('runId',v_id,'mode',v_mode));
      SELECT * INTO STRICT v_run FROM internal_proesc.v2_runs WHERE id=v_id;
    END IF;
    IF v_run.credential_revision<>v_revision OR v_run.actor_id<>p_actor_id THEN
      UPDATE internal_proesc.v2_runs SET status='FAILED',finished_at=now() WHERE id=v_run.id;
      RETURN jsonb_build_object('claimed',false,'credentialChanged',true);
    END IF;
    IF EXISTS(SELECT 1 FROM internal_proesc.v2_tasks WHERE run_id=v_run.id AND lease_until>now()) THEN
      RETURN jsonb_build_object('claimed',false); END IF;
    SELECT * INTO v_task FROM internal_proesc.v2_tasks WHERE run_id=v_run.id AND status='PENDING'
      AND retry_after<=now() AND attempts<5
      ORDER BY CASE resource WHEN 'people' THEN 0 ELSE 1 END,source_year,source_month,unit_id LIMIT 1 FOR UPDATE;
    IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM internal_proesc.v2_tasks WHERE run_id=v_run.id AND status IN ('PENDING','FAILED')) THEN
      SELECT * INTO v_task FROM internal_proesc.v2_tasks WHERE run_id=v_run.id AND status='COLLECTED'
        AND retry_after<=now() AND attempts<5 ORDER BY source_year,source_month,unit_id LIMIT 1 FOR UPDATE;
    END IF;
    IF v_task.id IS NULL THEN RETURN jsonb_build_object('claimed',false); END IF;
    UPDATE internal_proesc.v2_tasks SET lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',
      attempts=attempts+1,updated_at=now() WHERE id=v_task.id RETURNING * INTO v_task;
    RETURN jsonb_build_object('claimed',true,'runId',v_run.id,'taskId',v_task.id,'leaseId',v_task.lease_id,
      'resource',CASE WHEN v_task.status='COLLECTED' THEN 'apply' ELSE v_task.resource END,
      'unitId',v_task.unit_id,'year',v_task.source_year,'month',v_task.source_month,
      'page',v_task.next_page,'credentialRevision',v_revision);
  END IF;
  SELECT * INTO STRICT v_task FROM internal_proesc.v2_tasks WHERE id=(p_payload->>'taskId')::uuid FOR UPDATE;
  SELECT * INTO STRICT v_run FROM internal_proesc.v2_runs WHERE id=v_task.run_id;
  IF p_action='fail' AND p_payload->>'errorCode'='CREDENTIAL_CHANGED'
    AND v_run.actor_id=p_actor_id AND v_run.credential_revision::text=p_payload->>'credentialRevision'
    AND v_task.lease_id IS NOT NULL AND v_task.lease_id::text=p_payload->>'leaseId'
    AND v_task.lease_until>now() AND v_run.status='RUNNING' AND v_run.credential_revision<>v_revision THEN
    UPDATE internal_proesc.v2_tasks SET lease_id=NULL,lease_until=NULL,status='FAILED',
      error_code='CREDENTIAL_CHANGED',updated_at=now() WHERE id=v_task.id;
    UPDATE internal_proesc.v2_runs SET status='FAILED',finished_at=now() WHERE id=v_run.id;
    RETURN jsonb_build_object('failed',true,'runFailed',true,'credentialChanged',true);
  END IF;
  IF v_run.actor_id<>p_actor_id OR v_run.credential_revision<>v_revision
    OR v_revision::text IS DISTINCT FROM p_payload->>'credentialRevision' THEN
    RAISE EXCEPTION 'Credencial ou operador V2 alterado.' USING ERRCODE='40001';
  END IF;
  IF p_action='commit' THEN
    v_page_number:=(p_payload->>'page')::integer;
    v_last:=(p_payload->>'lastPage')::integer;
    v_total:=(p_payload->>'total')::integer;
    v_hash:=encode(extensions.digest(jsonb_build_object('records',p_payload->'records',
      'lastPage',v_last,'total',v_total)::text,'sha256'),'hex');
    SELECT * INTO v_page FROM internal_proesc.v2_pages WHERE task_id=v_task.id AND page=v_page_number;
    IF FOUND THEN
      IF v_page.content_hash<>v_hash THEN RAISE EXCEPTION 'Página reapresentada com conteúdo divergente.' USING ERRCODE='40001'; END IF;
      RETURN v_page.results||jsonb_build_object('replayed',true);
    END IF;
  END IF;
  IF v_run.status<>'RUNNING' OR v_task.lease_id IS NULL OR v_task.lease_until<=now()
    OR v_task.lease_id::text IS DISTINCT FROM p_payload->>'leaseId' THEN
    RAISE EXCEPTION 'Concessão V2 inválida.' USING ERRCODE='40001';
  END IF;
  IF p_action='fail' THEN
    IF coalesce(p_payload->>'errorCode','') NOT IN ('TIMEOUT','HTTP_ERROR','RATE_LIMIT','TRANSPORT_ERROR',
      'INVALID_RESPONSE','COMMIT_REJECTED','APPLY_REJECTED','CREDENTIAL_CHANGED') THEN
      RAISE EXCEPTION 'Código de falha V2 inválido.' USING ERRCODE='22023'; END IF;
    UPDATE internal_proesc.v2_tasks SET lease_id=NULL,lease_until=NULL,error_code=p_payload->>'errorCode',
      status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE status END,
      retry_after=now()+make_interval(mins=>least(30,power(2,attempts)::integer)),updated_at=now()
      WHERE id=v_task.id RETURNING * INTO v_task;
    IF v_task.status='FAILED' THEN
      UPDATE internal_proesc.v2_runs SET status='FAILED',finished_at=now() WHERE id=v_run.id;
    END IF;
    RETURN jsonb_build_object('failed',true,'retryAfter',v_task.retry_after,'runFailed',v_task.status='FAILED');
  ELSIF p_action='commit' THEN
    v_observed:=(p_payload->>'observedAt')::timestamptz;
    IF v_task.status<>'PENDING' OR v_page_number IS DISTINCT FROM v_task.next_page
      OR v_last IS NULL OR v_last<v_page_number OR v_last>100000 OR v_total IS NULL OR v_total NOT BETWEEN 0 AND 1000000
      OR jsonb_typeof(p_payload->'records') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'records')>100 OR v_observed IS NULL OR NOT isfinite(v_observed)
      OR v_observed>now()+interval '5 minutes' OR v_observed<now()-interval '1 day'
      OR (v_task.last_page IS NOT NULL AND (v_task.last_page<>v_last OR v_task.expected_total<>v_total)) THEN
      RAISE EXCEPTION 'Página V2 incompleta ou fora do contrato.' USING ERRCODE='22023'; END IF;
    v_rows:=jsonb_array_length(p_payload->'records');
    IF (v_total=0 AND (v_rows<>0 OR v_last<>1 OR v_page_number<>1))
      OR (v_total>0 AND v_rows=0) OR v_task.records_seen+v_rows>v_total
      OR (v_page_number=v_last AND v_task.records_seen+v_rows<>v_total) THEN
      RAISE EXCEPTION 'Total ou paginação V2 divergente.' USING ERRCODE='22023'; END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'records') LOOP
      IF v_task.resource='invoices' THEN PERFORM internal_proesc.v2_stage_invoice(v_task,v_row,v_observed);
      ELSE PERFORM internal_proesc.v2_observe_person(v_task,v_row,v_observed); END IF;
    END LOOP;
    UPDATE internal_proesc.v2_tasks SET records_seen=records_seen+v_rows,next_page=next_page+1,
      last_page=v_last,expected_total=v_total,status=CASE WHEN v_page_number<v_last THEN 'PENDING'
        WHEN resource='invoices' AND v_total>0 THEN 'COLLECTED' ELSE 'COMPLETE' END,
      lease_id=NULL,lease_until=NULL,attempts=0,error_code=NULL,retry_after=now(),updated_at=now()
      WHERE id=v_task.id RETURNING * INTO v_task;
    v_counts:=jsonb_build_object('committed',true,'taskComplete',v_page_number=v_last,
      'runComplete',false,'records',v_rows,'nextPage',v_task.next_page);
    INSERT INTO internal_proesc.v2_pages(task_id,page,last_page,total,row_count,content_hash,observed_at,results)
      VALUES(v_task.id,v_page_number,v_last,v_total,v_rows,v_hash,v_observed,v_counts);
  ELSIF p_action='apply' THEN
    IF v_task.status<>'COLLECTED' OR EXISTS(SELECT 1 FROM internal_proesc.v2_tasks
      WHERE run_id=v_run.id AND status IN ('PENDING','FAILED')) THEN
      RAISE EXCEPTION 'Aplicação exige inventário completo.' USING ERRCODE='40001'; END IF;
    FOR v_observation IN SELECT id FROM internal_proesc.v2_invoice_observations
      WHERE task_id=v_task.id AND result='STAGED' ORDER BY id LIMIT 20 FOR UPDATE LOOP
      BEGIN
        v_result:=internal_proesc.v2_apply_invoice(p_actor_id,v_observation.id);
      EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN
        UPDATE internal_proesc.v2_invoice_observations SET result='REVIEW',reason='PROJECTION_GUARD_REJECTED'
          WHERE id=v_observation.id;
        v_result:='REVIEW';
      END;
      v_counts:=jsonb_set(v_counts,ARRAY[v_result],to_jsonb(coalesce((v_counts->>v_result)::integer,0)+1),true);
      v_count:=v_count+1;
    END LOOP;
    SELECT count(*) INTO v_remaining FROM internal_proesc.v2_invoice_observations WHERE task_id=v_task.id AND result='STAGED';
    UPDATE internal_proesc.v2_tasks SET status=CASE WHEN v_remaining=0 THEN 'COMPLETE' ELSE 'COLLECTED' END,
      lease_id=NULL,lease_until=NULL,attempts=0,error_code=NULL,retry_after=now(),updated_at=now() WHERE id=v_task.id;
    v_counts:=jsonb_build_object('applied',v_count,'remaining',v_remaining,'counts',v_counts);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.v2_tasks WHERE run_id=v_run.id AND status<>'COMPLETE') THEN
    UPDATE internal_proesc.v2_runs SET status='COMPLETE',finished_at=now() WHERE id=v_run.id;
    v_counts:=v_counts||jsonb_build_object('runComplete',true);
  END IF;
  RETURN v_counts;
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.v2_run_status(uuid),public.proesc_v2_runtime_service(text,uuid,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.proesc_v2_runtime_service(text,uuid,jsonb) TO service_role;
COMMIT;
