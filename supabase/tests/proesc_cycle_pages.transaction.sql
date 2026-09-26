-- Run via MCP only after 091000/091100. No HTTP, record, issuance or payment call.
-- Existing authorized identity, synthetic source pages; cache/runtime writes are
-- rolled back in a subtransaction and fingerprinted before the final ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SET LOCAL row_security = off;
SET LOCAL plpgsql.check_asserts = on;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub = '';

CREATE FUNCTION pg_temp.expect_cycle_error(
  p_rpc text, p_action text, p_actor uuid, p_enrollment uuid,
  p_payload jsonb, p_state text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    CASE p_rpc
      WHEN 'pages' THEN PERFORM public.proesc_cycle_review_pages_service(
        p_action,p_actor,p_enrollment,p_payload);
      WHEN 'cache' THEN PERFORM public.proesc_cycle_review_cache_service(
        p_action,p_actor,p_enrollment,p_payload);
      WHEN 'runtime' THEN PERFORM public.proesc_cycle_review_runtime_service(
        p_action,p_actor,p_payload);
      ELSE RAISE EXCEPTION 'Unknown test RPC';
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN RAISE; END IF;
    v_rejected := true;
  END;
  ASSERT v_rejected, 'Expected rejection did not occur';
END;
$$;

CREATE FUNCTION pg_temp.cycle_fixture_fingerprint(p_enrollment uuid,p_context jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'runtime',(SELECT to_jsonb(r) FROM internal_proesc.cycle_review_runtime r WHERE id),
    'cache',(SELECT to_jsonb(c) FROM internal_proesc.cycle_review_cache c
      WHERE unit_id=p_context->>'unitId' AND first_year=(p_context->>'firstYear')::int
        AND last_year=(p_context->>'lastYear')::int),
    'pages',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),''
      ORDER BY token_revision,unit_id,year,month),'')) FROM internal_proesc.cycle_review_pages p),
    'receivables',(SELECT md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id),''))
      FROM public.contas_receber c WHERE matricula_id=p_enrollment),
    'evidence',(SELECT to_jsonb(e) FROM internal_proesc.enrollment_cycle_evidence e
      WHERE matricula_id=p_enrollment)
  );
$$;

DO $contract$
DECLARE
  v_actor uuid; v_enrollment uuid; v_candidate record; v_context jsonb;
  v_revision uuid; v_cache uuid; v_lease jsonb; v_start jsonb; v_result jsonb;
  v_baseline jsonb; v_tuple jsonb; v_rows jsonb; v_payload jsonb; v_manifest jsonb;
  v_periods jsonb; v_complete jsonb; v_replay jsonb; v_claim jsonb;
  v_oldest timestamptz := clock_timestamp()-interval '2 minutes';
  v_newer timestamptz := clock_timestamp()-interval '30 seconds';
  v_year int; v_month int; v_page_count int; v_checks int := 0; v_fault text;
BEGIN
  SELECT updated_by,revision INTO STRICT v_actor,v_revision
    FROM internal_proesc.connection WHERE id FOR SHARE;
  PERFORM internal_proesc.authorize_financial_operator(v_actor);
  FOR v_candidate IN
    SELECT m.id FROM public.matriculas m
      JOIN internal_proesc.class_scopes s ON s.turma_id=m.turma_id
      WHERE s.phase='CONFIRMED' AND (s.batch_id IS NOT NULL OR s.financial_mode='CICLO1_PROESC')
      ORDER BY m.id LIMIT 20
  LOOP
    BEGIN
      PERFORM internal_proesc.authorize_cycle_review(v_actor,v_candidate.id);
      v_context := internal_proesc.cycle_review_context(v_candidate.id);
      v_enrollment := v_candidate.id;
      EXIT;
    EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR no_data_found THEN
      CONTINUE;
    END;
  END LOOP;
  ASSERT v_enrollment IS NOT NULL, 'Authorized cycle fixture unavailable; defer test';
  -- Never take over a real running worker or source lease.
  PERFORM 1 FROM internal_proesc.cycle_review_runtime WHERE id FOR UPDATE NOWAIT;
  ASSERT NOT EXISTS(SELECT 1 FROM internal_proesc.cycle_review_runtime
    WHERE id AND lease_until>clock_timestamp()), 'A cycle worker is active; defer test';
  PERFORM 1 FROM internal_proesc.cycle_review_cache
    WHERE unit_id=v_context->>'unitId' AND first_year=(v_context->>'firstYear')::int
      AND last_year=(v_context->>'lastYear')::int FOR UPDATE NOWAIT;
  ASSERT NOT EXISTS(SELECT 1 FROM internal_proesc.cycle_review_cache
    WHERE unit_id=v_context->>'unitId' AND first_year=(v_context->>'firstYear')::int
      AND last_year=(v_context->>'lastYear')::int
      AND state='FETCHING' AND lease_until>clock_timestamp()), 'Source lease active; defer test';
  -- Keep fingerprint/cleanup stable against another page writer, without retrying.
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:cycle-pages:quota',0));
  v_baseline := pg_temp.cycle_fixture_fingerprint(v_enrollment,v_context);

  BEGIN
    UPDATE internal_proesc.cycle_review_cache SET state='COMPLETE',
      observed_at=clock_timestamp()-interval '10 minutes',lease_until=clock_timestamp()-interval '1 second'
      WHERE unit_id=v_context->>'unitId' AND first_year=(v_context->>'firstYear')::int
        AND last_year=(v_context->>'lastYear')::int;
    DELETE FROM internal_proesc.cycle_review_pages WHERE unit_id=v_context->>'unitId'
      AND year BETWEEN (v_context->>'firstYear')::int AND (v_context->>'lastYear')::int;
    v_start := public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment);
    ASSERT v_start->'cached'='false' AND v_start->>'tokenRevision'=v_revision::text;
    v_cache := (v_start->>'cacheId')::uuid;
    v_lease := jsonb_build_object('cacheId',v_cache,'lease',v_start->>'lease');
    v_tuple := jsonb_build_array('90000000000001',true,1000,v_context->>'classId',NULL,
      '2026-01-15','2026-01-01',false,false,true);
    v_rows := jsonb_build_array(v_tuple);
    v_payload := v_lease||jsonb_build_object('year',(v_context->>'firstYear')::int,
      'month',1,'observedAt',v_oldest,'rows',v_rows);

    ASSERT internal_proesc.valid_cycle_page_rows(v_rows), 'Valid synthetic tuple rejected';
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('rows',jsonb_build_array(v_tuple-9)),'22023');
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('rows',jsonb_build_array(v_tuple||'false'::jsonb)),'22023');
    FOR v_result IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
      jsonb_set(v_rows,'{0,4}','"12345678901"'),
      jsonb_set(v_rows,'{0,2}','0.5'),
      jsonb_set(v_rows,'{0,5}','"2026-02-30"')
    )) LOOP
      PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
        v_payload||jsonb_build_object('rows',v_result),'22023');
    END LOOP;
    SELECT jsonb_agg('["1",false,0,null,null,"2000-01-01",null,null,null,false]'::jsonb)
      INTO v_result FROM generate_series(1,20000);
    ASSERT octet_length(v_result::text)<2000000, 'Row-limit fixture must remain below the byte limit';
    ASSERT NOT internal_proesc.valid_cycle_page_rows(v_result), '20,000 rows imply possible source truncation';
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('rows',v_result),'22023');
    v_checks := v_checks+7;

    ASSERT NOT has_function_privilege('anon',
      'public.proesc_cycle_review_pages_service(text,uuid,uuid,jsonb)','EXECUTE');
    ASSERT NOT has_function_privilege('authenticated',
      'public.proesc_cycle_review_pages_service(text,uuid,uuid,jsonb)','EXECUTE');
    ASSERT NOT has_table_privilege('service_role','internal_proesc.cycle_review_pages','SELECT');
    PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
    PERFORM set_config('request.jwt.claim.role','anon',true);
    PERFORM pg_temp.expect_cycle_error('pages','read',v_actor,v_enrollment,v_lease,'42501');
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,v_payload,'42501');
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    PERFORM set_config('request.jwt.claim.role','service_role',true);
    v_checks := v_checks+2;

    v_result := public.proesc_cycle_review_pages_service('append',v_actor,v_enrollment,v_payload);
    ASSERT v_result->'saved'='true' AND v_result->'reused'='false';
    v_replay := public.proesc_cycle_review_pages_service('append',v_actor,v_enrollment,v_payload);
    ASSERT v_replay->'saved'='false' AND v_replay->'reused'='true'
      AND v_replay->>'hash'=v_result->>'hash', 'Replay must reuse the exact hash';
    v_result := public.proesc_cycle_review_pages_service('read',v_actor,v_enrollment,v_lease);
    ASSERT v_result->>'unitId'=v_context->>'unitId' AND v_result->>'tokenRevision'=v_revision::text
      AND jsonb_array_length(v_result->'pages')=1 AND v_result#>'{pages,0,rows}'=v_rows;
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('rows','[]'::jsonb),'PT409');
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('observedAt',v_oldest+interval '1 second'),'PT409');
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('month',2,'observedAt',clock_timestamp()-interval '6 minutes'),'22023');
    PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,
      v_payload||jsonb_build_object('year',(v_context->>'firstYear')::int-1),'22023');
    v_checks := v_checks+7;

    FOREACH v_fault IN ARRAY ARRAY['credential','context','lease','expired','state'] LOOP
      BEGIN
        CASE v_fault
          WHEN 'credential' THEN UPDATE internal_proesc.cycle_review_cache
            SET token_revision=gen_random_uuid() WHERE id=v_cache;
          WHEN 'context' THEN UPDATE internal_proesc.cycle_review_cache SET class_ids='[]' WHERE id=v_cache;
          WHEN 'lease' THEN UPDATE internal_proesc.cycle_review_cache SET lease=gen_random_uuid() WHERE id=v_cache;
          WHEN 'expired' THEN UPDATE internal_proesc.cycle_review_cache
            SET lease_until=clock_timestamp()-interval '1 second' WHERE id=v_cache;
          WHEN 'state' THEN UPDATE internal_proesc.cycle_review_cache SET state='COMPLETE' WHERE id=v_cache;
        END CASE;
        PERFORM pg_temp.expect_cycle_error('pages','read',v_actor,v_enrollment,v_lease,'PT409');
        PERFORM pg_temp.expect_cycle_error('pages','append',v_actor,v_enrollment,v_payload,'PT409');
        v_checks := v_checks+2;
        RAISE EXCEPTION 'Restore guard fixture' USING ERRCODE='ZP001';
      EXCEPTION WHEN SQLSTATE 'ZP001' THEN NULL;
      END;
    END LOOP;

    FOR v_year IN (v_context->>'firstYear')::int..(v_context->>'lastYear')::int LOOP
      FOR v_month IN 1..12 LOOP
        IF v_year=(v_context->>'firstYear')::int AND v_month=1 THEN CONTINUE; END IF;
        PERFORM public.proesc_cycle_review_pages_service('append',v_actor,v_enrollment,
          v_lease||jsonb_build_object('year',v_year,'month',v_month,'observedAt',v_newer,'rows','[]'::jsonb));
      END LOOP;
    END LOOP;
    v_page_count := ((v_context->>'lastYear')::int-(v_context->>'firstYear')::int+1)*12;
    SELECT jsonb_agg(jsonb_build_object('year',year,'month',month,'hash',content_hash) ORDER BY year,month),
      jsonb_agg(jsonb_build_object('year',year,'month',month,'complete',true) ORDER BY year,month)
      INTO v_manifest,v_periods FROM internal_proesc.cycle_review_pages
      WHERE token_revision=v_revision AND unit_id=v_context->>'unitId'
        AND year BETWEEN (v_context->>'firstYear')::int AND (v_context->>'lastYear')::int;
    ASSERT jsonb_array_length(v_manifest)=v_page_count;
    -- No classification is recorded: complete only writes a synthetic unsafe cache.
    v_complete := v_lease||jsonb_build_object('resumeVersion',1,'sourceObservedAt',clock_timestamp(),
      'pageHashes',v_manifest,'periods',v_periods,'obligations',jsonb_build_array(jsonb_build_object(
        'key','90000000000001','classId',v_context->>'classId','personHash',NULL,
        'amountCents',1000,'dueDate','2026-01-15','createdDate','2026-01-01','unsafe',true)));
    PERFORM pg_temp.expect_cycle_error('cache','complete',v_actor,v_enrollment,
      v_complete||jsonb_build_object('pageHashes',v_manifest-0),'22023');
    PERFORM pg_temp.expect_cycle_error('cache','complete',v_actor,v_enrollment,
      v_complete||jsonb_build_object('pageHashes',jsonb_set(v_manifest,'{1}',v_manifest->0)),'22023');
    PERFORM pg_temp.expect_cycle_error('cache','complete',v_actor,v_enrollment,
      v_complete||jsonb_build_object('pageHashes',jsonb_set(v_manifest,'{0,hash}',to_jsonb(repeat('0',64)))),'PT409');
    PERFORM pg_temp.expect_cycle_error('cache','complete',v_actor,v_enrollment,
      v_complete||jsonb_build_object('lease',gen_random_uuid()),'PT409');
    BEGIN
      UPDATE internal_proesc.cycle_review_pages SET observed_at=clock_timestamp()-interval '6 minutes'
        WHERE token_revision=v_revision AND unit_id=v_context->>'unitId'
          AND year=(v_context->>'firstYear')::int AND month=1;
      v_result := public.proesc_cycle_review_pages_service('read',v_actor,v_enrollment,v_lease);
      ASSERT jsonb_array_length(v_result->'pages')=v_page_count-1, 'Read must exclude stale pages';
      PERFORM pg_temp.expect_cycle_error('cache','complete',v_actor,v_enrollment,v_complete,'PT409');
      RAISE EXCEPTION 'Restore TTL fixture' USING ERRCODE='ZP001';
    EXCEPTION WHEN SQLSTATE 'ZP001' THEN NULL;
    END;
    v_checks := v_checks+5;

    PERFORM public.proesc_cycle_review_cache_service('abort',v_actor,v_enrollment,v_lease);
    -- Even an older COMPLETE cache must not short-circuit this continuation test.
    UPDATE internal_proesc.cycle_review_cache SET observed_at=clock_timestamp()-interval '10 minutes'
      WHERE id=v_cache;
    v_start := public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment);
    ASSERT v_start->'cached'='false';
    v_lease := jsonb_build_object('cacheId',v_start->>'cacheId','lease',v_start->>'lease');
    v_result := public.proesc_cycle_review_pages_service('read',v_actor,v_enrollment,v_lease);
    ASSERT jsonb_array_length(v_result->'pages')=v_page_count, 'Abort lost resumable evidence';
    PERFORM public.proesc_cycle_review_cache_service('complete',v_actor,v_enrollment,v_complete||v_lease);
    ASSERT (SELECT state='COMPLETE' AND observed_at=v_oldest AND verified_observed_at=v_oldest
      FROM internal_proesc.cycle_review_cache WHERE id=v_cache), 'Completion renewed the oldest observation';
    v_checks := v_checks+2;

    FOREACH v_fault IN ARRAY ARRAY['progress','source_failure','no_progress'] LOOP
      UPDATE internal_proesc.cycle_review_runtime SET enabled=true,next_due_at=now()-interval '1 second',
        lease_id=NULL,lease_until=NULL,round_active=false,completed_ids=ARRAY[]::uuid[] WHERE id;
      v_claim := public.proesc_cycle_review_runtime_service('claim',v_actor);
      ASSERT v_claim->'claimed'='true';
      v_result := jsonb_build_object('reviewed',CASE WHEN v_fault='source_failure' THEN 1 ELSE 0 END,
        'pending',1,'progressiveCount',CASE WHEN v_fault='no_progress' THEN 0 ELSE 3 END,
        'sourceFailed',v_fault='source_failure');
      PERFORM public.proesc_cycle_review_runtime_service('finish',v_actor,
        jsonb_build_object('leaseId',v_claim->>'leaseId','success',false,'result',v_result));
      ASSERT (SELECT next_due_at=now()+CASE WHEN v_fault='progress' THEN interval '0 seconds'
        ELSE interval '15 minutes' END AND lease_id IS NULL AND lease_until IS NULL AND round_active
        AND last_result->'success'='false' FROM internal_proesc.cycle_review_runtime WHERE id),
        'Runtime backoff/progress policy diverged';
      IF v_fault<>'progress' THEN
        ASSERT public.proesc_cycle_review_runtime_service('claim',v_actor)->'claimed'='false',
          'Backoff must prevent another immediate claim';
      END IF;
      v_checks := v_checks+1;
    END LOOP;
    RAISE EXCEPTION 'Rollback all synthetic cache/runtime state' USING ERRCODE='ZP999';
  EXCEPTION WHEN SQLSTATE 'ZP999' THEN NULL;
  END;
  ASSERT pg_temp.cycle_fixture_fingerprint(v_enrollment,v_context)=v_baseline,
    'Rollback did not preserve cache, pages, runtime, receivables or classification';
  RAISE NOTICE 'PASS cycle page RPC contract: checks=%, periods=%, rollback preserved=true',v_checks,v_page_count;
END;
$contract$;
SELECT 'PASS: source page RPC, complete manifest, TTL, replay, authorization and runtime backoff; all fixture changes reverted' AS result;
ROLLBACK;
