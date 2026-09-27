-- Execute only via MCP after the four 20260927011700..03 migrations.
-- Root must set pdv_test.actor_id to the authorized, authenticated operator UUID
-- in this same transaction. No actor is inferred from another integration.
-- The target is an existing payment: no issue/payment/bank/print call is made.
-- All receipt/config/job writes are rolled back. PostgreSQL identity sequences
-- are not transactional: this rehearsal may consume one receipt/audit number.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';
SET LOCAL plpgsql.check_asserts = on;
-- Supply before DO: SELECT set_config('pdv_test.actor_id','<operator UUID>',true);

DO $contract$
DECLARE
  v_actor uuid := nullif(current_setting('pdv_test.actor_id',true),'')::uuid;
  v_target constant uuid := 'cf4e5867-0926-4285-9237-f28944ad1135';
  v_paid public.contas_receber; v_polo uuid; v_before text; v_receipts_before text;
  v_receipt jsonb; v_selected jsonb; v_settings jsonb; v_station jsonb;
  v_printer jsonb; v_input jsonb; v_job jsonb; v_claim jsonb; v_replay jsonb; v_complete jsonb;
  v_register_key uuid := gen_random_uuid(); v_save_key uuid := gen_random_uuid();
  v_prepare_key uuid := gen_random_uuid(); v_claim_key uuid := gen_random_uuid();
  v_checks integer := 0; v_rejected boolean; v_claims text;
BEGIN
  ASSERT v_actor IS NOT NULL, 'Explicit authenticated operator is required';
  v_claims := jsonb_build_object('sub',v_actor,'role','authenticated')::text;
  PERFORM set_config('request.jwt.claims',v_claims,true);
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  SELECT * INTO STRICT v_paid FROM public.contas_receber WHERE id=v_target FOR SHARE NOWAIT;
  v_polo := v_paid.polo_id;
  -- Both actual financial and configuration authorization must pass.
  PERFORM internal_pdv.assert_scope(v_polo);
  PERFORM internal_pdv.assert_scope(v_polo,true);
  ASSERT v_paid.status='PAGO' AND v_paid.valor_pago>0
    AND v_paid.data_pagamento IS NOT NULL, 'Target is not a confirmed paid receivable';
  v_before := md5(to_jsonb(v_paid)::text);
  SELECT md5(coalesce(jsonb_agg(r ORDER BY id)::text,'[]')) INTO v_receipts_before
    FROM internal_pdv.receipts r WHERE receivable_id=v_target;

  BEGIN
    v_settings := public.get_pdv_printer_settings(v_polo,NULL);
    ASSERT v_settings->>'context'='OUTROS_CREDITOS'
      AND (v_settings->>'canUse')::boolean AND (v_settings->>'canManage')::boolean;
    v_checks := v_checks+1;
    v_receipt := public.prepare_pdv_receipt(v_target,NULL,NULL);
    ASSERT (v_receipt->>'receivableId')::uuid=v_target
      AND (v_receipt->>'totalCents')::bigint=round(v_paid.valor_pago*100)::bigint
      AND v_receipt->>'paidAtDisplay'=to_char(v_paid.data_pagamento,'DD/MM/YYYY')
      AND v_receipt->'issuer' ?& ARRAY['id','name','cnpj','address','number','complement',
        'neighborhood','city','state','postalCode','phone','email','isHeadquarters',
        'logoUrl','watermarkUrl','watermarkOpacity','watermarkScale','watermarkRotate']
      AND NOT (v_receipt->>'automaticReady')::boolean;
    v_checks := v_checks+1;
    v_station := public.register_pdv_workstation(v_polo,'Ensaio transacional PDV',v_register_key);
    ASSERT public.register_pdv_workstation(v_polo,'Ensaio transacional PDV',v_register_key)=v_station;
    v_checks := v_checks+1;
    v_input := jsonb_build_object('poloId',v_polo,'workstationId',v_station->>'id',
      'name','Impressora de ensaio sem despacho','model','BROWSER',
      'transport','BROWSER','behavior','PERGUNTAR','isDefault',true,'active',true,'expectedVersion',0,
      'template',jsonb_build_object('widthMm',58,'showLogo',false,'footer','Ensaio revertido',
        'marginMm',4,'fontSize',10));
    v_printer := public.save_pdv_printer(v_input,v_save_key);
    ASSERT public.save_pdv_printer(v_input,v_save_key)=v_printer
      AND (v_printer->>'transportReady')::boolean AND NOT (v_printer->>'automaticReady')::boolean;
    v_checks := v_checks+1;
    v_selected := public.prepare_pdv_receipt(v_target,NULL,(v_station->>'id')::uuid);
    ASSERT v_selected->>'id'=v_receipt->>'id'
      AND v_selected->'issuer'=v_receipt->'issuer'
      AND v_selected->'payer'=v_receipt->'payer'
      AND v_selected->'totalCents'=v_receipt->'totalCents'
      AND v_selected->>'printerId'=v_printer->>'id'
      AND v_selected->'template'->>'widthMm'='58';
    v_checks := v_checks+1;
    v_job := public.prepare_pdv_print_job((v_receipt->>'id')::uuid,(v_station->>'id')::uuid,
      (v_printer->>'id')::uuid,v_prepare_key,'REPRINT','Ensaio transacional sem despacho físico');
    ASSERT public.prepare_pdv_print_job((v_receipt->>'id')::uuid,(v_station->>'id')::uuid,
      (v_printer->>'id')::uuid,v_prepare_key,'REPRINT','Ensaio transacional sem despacho físico')=v_job;
    ASSERT v_job->'receipt'->'template'=v_selected->'template';
    v_checks := v_checks+1;
    v_claim := public.claim_pdv_print_job((v_job->>'id')::uuid,v_claim_key);
    ASSERT (v_claim->>'canDispatch')::boolean AND v_claim->>'status'='CLAIMED'
      AND v_claim->>'token' IS NOT NULL;
    v_replay := public.claim_pdv_print_job((v_job->>'id')::uuid,v_claim_key);
    ASSERT NOT (v_replay->>'canDispatch')::boolean AND NOT (v_replay ? 'token');
    v_checks := v_checks+1;
    v_complete := public.complete_pdv_print_job((v_job->>'id')::uuid,
      (v_claim->>'token')::uuid,'UNKNOWN');
    ASSERT v_complete->>'status'='UNKNOWN'
      AND public.complete_pdv_print_job((v_job->>'id')::uuid,(v_claim->>'token')::uuid,'UNKNOWN')=v_complete;
    v_checks := v_checks+1;
    v_rejected := false;
    BEGIN
      PERFORM public.prepare_pdv_print_job((v_receipt->>'id')::uuid,
        (v_station->>'id')::uuid,(v_printer->>'id')::uuid,gen_random_uuid(),'AUTO',NULL);
    EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected := true;
    END;
    ASSERT v_rejected, 'Automatic dispatch must remain blocked';
    v_checks := v_checks+1;
    v_rejected := false;
    BEGIN
      PERFORM public.save_pdv_printer(v_input||jsonb_build_object('id',v_printer->>'id',
        'expectedVersion',0),gen_random_uuid());
    EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected := true;
    END;
    ASSERT v_rejected, 'Stale configuration must be rejected';
    v_checks := v_checks+1;
    PERFORM set_config('request.jwt.claim.sub','',true);
    PERFORM set_config('request.jwt.claims','{}',true);
    v_rejected := false;
    BEGIN
      PERFORM public.claim_pdv_print_job((v_job->>'id')::uuid,v_claim_key);
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    ASSERT v_rejected, 'Authorization must precede claim replay';
    v_checks := v_checks+1;
    RAISE EXCEPTION 'Rollback rehearsal artifacts' USING ERRCODE='ZP001';
  EXCEPTION WHEN SQLSTATE 'ZP001' THEN NULL;
  END;

  ASSERT v_checks=11, 'Incomplete contract rehearsal';
  ASSERT NOT EXISTS(SELECT 1 FROM internal_pdv.workstations WHERE id=(v_station->>'id')::uuid);
  ASSERT NOT EXISTS(SELECT 1 FROM internal_pdv.printers WHERE id=(v_printer->>'id')::uuid);
  ASSERT NOT EXISTS(SELECT 1 FROM internal_pdv.print_jobs WHERE id=(v_job->>'id')::uuid);
  ASSERT NOT EXISTS(SELECT 1 FROM internal_pdv.requests WHERE actor_id=v_actor
    AND request_id=ANY(ARRAY[v_register_key,v_save_key,v_prepare_key,v_claim_key]));
  ASSERT (SELECT md5(coalesce(jsonb_agg(r ORDER BY id)::text,'[]'))
    FROM internal_pdv.receipts r WHERE receivable_id=v_target)=v_receipts_before;
  ASSERT (SELECT md5(to_jsonb(c)::text) FROM public.contas_receber c WHERE id=v_target)=v_before;
  PERFORM set_config('pdv_test.result',jsonb_build_object('checks',v_checks,
    'financial_row_preserved',true,'receipt_config_job_writes_rolled_back',true,
    'external_dispatches',0,'sequence_gaps_possible',true)::text,true);
END
$contract$;
SELECT current_setting('pdv_test.result')::jsonb AS contract_result;
ROLLBACK;
