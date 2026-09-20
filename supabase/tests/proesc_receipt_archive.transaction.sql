-- SQL contract only: Storage upload/download integrity is covered by the Edge codec tests.
-- Run after the archive migration, with the archive worker idle. Everything rolls back.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $test$
DECLARE
  v_actor uuid; v_request uuid:=gen_random_uuid(); v_batch uuid:=gen_random_uuid();
  v_lease uuid:=gen_random_uuid(); v_payload jsonb:='{"archiveContractFixture":true}'::jsonb;
  v_response jsonb:='{"result":"UNCHANGED","reviewReason":null,"replayed":false}'::jsonb;
  v_row internal_proesc.reconciliation_requests; v_data jsonb; v_text text; v_sha text;
  v_result jsonb; v_prepare jsonb; v_detail text; v_before text; v_after text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('proesc:receipt-archive:prepare',0));
  IF EXISTS(SELECT 1 FROM internal_proesc.receipt_archive_batches WHERE status='PREPARED') THEN
    RAISE EXCEPTION 'Arquivo pendente; repetir teste após conclusão do worker.' USING ERRCODE='40001';
  END IF;
  SELECT updated_by INTO STRICT v_actor FROM internal_proesc.connection WHERE id;
  SELECT md5(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id)) INTO v_before FROM public.contas_receber c;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  -- Prepare exports bounded canonical text without changing any source receipt.
  v_prepare:=public.proesc_prepare_receipt_archive_service(3,now()-interval '24 hours');
  IF v_prepare->>'status'='PREPARED' THEN
    IF v_prepare->>'payloadSha256'<>encode(extensions.digest(v_prepare->>'payloadText','sha256'),'hex')
      OR (v_prepare->>'rowCount')::int NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'Preparação não produziu texto canônico íntegro e limitado.';
    END IF;
    IF public.proesc_prepare_receipt_archive_service(3,now()-interval '24 hours') IS DISTINCT FROM v_prepare THEN
      RAISE EXCEPTION 'Retry de preparação não retornou o mesmo lote.';
    END IF;
    BEGIN
      PERFORM public.proesc_abort_receipt_archive_service((v_prepare->>'batchId')::uuid,gen_random_uuid());
      RAISE EXCEPTION 'Cancelamento com lease divergente aceito.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
    PERFORM public.proesc_abort_receipt_archive_service((v_prepare->>'batchId')::uuid,(v_prepare->>'leaseToken')::uuid);
    v_result:=public.proesc_receipt_archive_status_service((v_prepare->>'batchId')::uuid,(v_prepare->>'leaseToken')::uuid);
    IF v_result->>'status'<>'ABORTED' OR v_result->>'payloadSha256'<>v_prepare->>'payloadSha256'
      OR (SELECT count(*) FROM internal_proesc.reconciliation_requests r JOIN
        jsonb_populate_recordset(NULL::internal_proesc.reconciliation_requests,
          (v_prepare->>'payloadText')::jsonb->'rows') expected USING(request_id))<>(v_prepare->>'rowCount')::int THEN
      RAISE EXCEPTION 'Cancelamento apagou fonte ou metadados de auditoria.';
    END IF;
    IF public.proesc_abort_receipt_archive_service((v_prepare->>'batchId')::uuid,(v_prepare->>'leaseToken')::uuid)
      ->>'aborted'<>'true' THEN RAISE EXCEPTION 'Cancelamento não idempotente.'; END IF;
    BEGIN
      PERFORM public.proesc_commit_receipt_archive_service((v_prepare->>'batchId')::uuid,
        (v_prepare->>'leaseToken')::uuid,v_prepare->>'payloadText',repeat('a',64),200);
      RAISE EXCEPTION 'Lote cancelado confirmado.';
    EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  ELSIF v_prepare->>'status'<>'EMPTY' THEN RAISE EXCEPTION 'Estado de preparação inválido.'; END IF;

  -- A synthetic completed no-op gives us a known original immutable request payload.
  INSERT INTO internal_proesc.reconciliation_requests(request_id,action,actor_id,payload_hash,response,created_at,completed_at)
    VALUES(v_request,'APPLY',v_actor,encode(extensions.digest(v_payload::text,'sha256'),'hex'),
      v_response,now()-interval '2 days',now()-interval '2 days') RETURNING * INTO v_row;
  IF NOT internal_proesc.receipt_archive_eligible(v_row,now()-interval '24 hours') THEN
    RAISE EXCEPTION 'No-op antigo não elegível.';
  END IF;
  v_row.action:='IMPORT_ORIGINAL';
  IF internal_proesc.receipt_archive_eligible(v_row,now()-interval '24 hours') THEN
    RAISE EXCEPTION 'Importação financeira marcada como elegível.';
  END IF;
  SELECT * INTO v_row FROM internal_proesc.reconciliation_requests WHERE request_id=v_request;
  v_data:=jsonb_build_object('formatVersion',1,'rows',jsonb_build_array(to_jsonb(v_row)));
  v_text:=v_data::text; v_sha:=encode(extensions.digest(v_text,'sha256'),'hex');
  INSERT INTO internal_proesc.receipt_archive_batches(id,lease_token,object_path,payload_sha256,payload_text,row_count)
    VALUES(v_batch,v_lease,'receipts/v1/'||v_batch::text||'.json.gz',v_sha,v_text,1);

  BEGIN
    PERFORM public.proesc_commit_receipt_archive_service(v_batch,gen_random_uuid(),v_text,repeat('a',64),200);
    RAISE EXCEPTION 'Lease divergente aceito.';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.proesc_commit_receipt_archive_service(v_batch,v_lease,v_text||' ',repeat('a',64),200);
    RAISE EXCEPTION 'Bytes divergentes do download aceitos.';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    UPDATE internal_proesc.reconciliation_requests SET response=response||'{"changed":true}' WHERE request_id=v_request;
    PERFORM public.proesc_commit_receipt_archive_service(v_batch,v_lease,v_text,repeat('a',64),200);
    RAISE EXCEPTION 'Recibo modificado depois do upload foi removido.';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.reconciliation_requests WHERE request_id=v_request)
    OR EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests WHERE request_id=v_request) THEN
    RAISE EXCEPTION 'Tentativa inválida produziu remoção parcial.';
  END IF;

  v_result:=public.proesc_commit_receipt_archive_service(v_batch,v_lease,v_text,repeat('a',64),200);
  IF v_result->>'status'<>'COMMITTED' OR (v_result->>'archivedCount')::int<>1
    OR EXISTS(SELECT 1 FROM internal_proesc.reconciliation_requests WHERE request_id=v_request)
    OR NOT EXISTS(SELECT 1 FROM internal_proesc.archived_receipt_requests WHERE request_id=v_request AND batch_id=v_batch)
    OR EXISTS(SELECT 1 FROM internal_proesc.receipt_archive_batches WHERE id=v_batch AND payload_text IS NOT NULL) THEN
    RAISE EXCEPTION 'Commit não arquivou atomicamente mantendo localizador.';
  END IF;
  IF public.proesc_commit_receipt_archive_service(v_batch,v_lease,v_text,repeat('a',64),200)->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Commit não idempotente.';
  END IF;
  BEGIN
    PERFORM public.proesc_abort_receipt_archive_service(v_batch,v_lease);
    RAISE EXCEPTION 'Arquivo confirmado cancelado.';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;

  BEGIN
    PERFORM internal_proesc.begin_financial_request('APPLY',v_actor,v_request,v_payload);
    RAISE EXCEPTION 'Request arquivado admitido como nova operação.';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    IF v_detail::jsonb->>'batchId'<>v_batch::text OR v_detail::jsonb->>'payloadSha256'<>v_sha THEN
      RAISE EXCEPTION 'Arquivo não identificado pelo erro de recuperação.';
    END IF;
  END;
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  BEGIN
    PERFORM internal_proesc.begin_financial_request('APPLY',v_actor,v_request,v_payload);
    RAISE EXCEPTION 'Localizador frio exposto antes da autorização.';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  BEGIN
    PERFORM public.proesc_restore_receipt_archive_service(v_request,v_text||' ');
    RAISE EXCEPTION 'Arquivo corrompido restaurado.';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.proesc_restore_receipt_archive_service(gen_random_uuid(),v_text);
    RAISE EXCEPTION 'ID arbitrário inserido a partir do arquivo.';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM public.proesc_restore_receipt_archive_service(v_request,v_text);
  IF (SELECT to_jsonb(r) FROM internal_proesc.reconciliation_requests r WHERE request_id=v_request)
    IS DISTINCT FROM to_jsonb(v_row) THEN RAISE EXCEPTION 'Restauração não preservou o recibo integral.'; END IF;
  IF internal_proesc.begin_financial_request('APPLY',v_actor,v_request,v_payload)
    IS DISTINCT FROM v_response||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Replay original alterado.'; END IF;
  BEGIN
    PERFORM internal_proesc.begin_financial_request('APPLY',v_actor,v_request,v_payload||'{"changed":true}');
    RAISE EXCEPTION 'Colisão de payload aceita após restauração.';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  BEGIN
    PERFORM public.proesc_prepare_receipt_archive_service();
    RAISE EXCEPTION 'Preparação permitida a usuário comum.';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.proesc_restore_receipt_archive_service(v_request,v_text);
    RAISE EXCEPTION 'Restauração permitida a usuário comum.';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  IF has_function_privilege('authenticated','public.proesc_prepare_receipt_archive_service(integer,timestamptz)','EXECUTE')
    OR has_function_privilege('anon','public.proesc_restore_receipt_archive_service(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Permissões públicas indevidas.';
  END IF;
  SELECT md5(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id)) INTO v_after FROM public.contas_receber c;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Financeiro alterado pelo arquivo.'; END IF;
END;
$test$;
ROLLBACK;
