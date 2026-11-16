-- Run after the new migrations inside the SAME transaction, always ROLLBACK.
-- Uses only synthetic expenses; existing Auth/people/configuration are read only.
CREATE TEMP TABLE estimated_expense_runtime_result(result jsonb) ON COMMIT DROP;
DO $test$
DECLARE
  v_polo constant uuid := '44444444-4444-4444-4444-444444444444';
  v_account constant uuid := '657adb52-a833-41b1-8345-33dedf097acf';
  v_tag constant text := 'FIXTURE ESTIMATIVA 94AB8FA2';
  v_actor uuid;
  v_create uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_source uuid;
  v_rateada uuid;
  v_derived uuid;
  v_version integer;
  v_input jsonb;
  v_preview jsonb;
  v_result jsonb;
  v_before jsonb;
  v_summary jsonb;
  v_closed public.despesas_lancamentos%ROWTYPE;
  v_no_charge uuid;
  v_no_charge_request uuid := gen_random_uuid();
  v_today date := (now() AT TIME ZONE 'America/Maceio')::date;
  v_overdue uuid;
  v_due_today uuid;
  v_bundle jsonb;
  v_count integer;
BEGIN
  SELECT u.auth_user_id INTO v_actor FROM public.usuarios_sistema u
    WHERE internal_financial_payments.actor_allowed(u.auth_user_id,v_polo,'despesas')
    ORDER BY u.auth_user_id LIMIT 1;
  IF v_actor IS NULL OR public.conta_bancaria_disponivel_no_polo(v_account,v_polo) IS NOT TRUE THEN
    RAISE EXCEPTION 'Synthetic estimate test has no authorized actor/account';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  SELECT count(*) INTO v_count FROM public.criar_despesa_estimada_secure(jsonb_build_object(
    'p_request_id',v_create,'p_polo_id',v_polo,'p_tipo','DESPESA_FIXA','p_descricao',v_tag,
    'p_valor_base',100,'p_data_lancamento',CURRENT_DATE,'p_data_vencimento',CURRENT_DATE,
    'p_total_parcelas',12,'p_intervalo_quantidade',1,'p_intervalo_unidade','MESES'),false);
  IF v_count<>12 THEN RAISE EXCEPTION 'Monthly creation count mismatch'; END IF;
  SELECT d.id,d.valor_estimado_versao,to_jsonb(d) INTO v_source,v_version,v_before
    FROM public.despesas_lancamentos d WHERE d.request_id=v_create AND d.parcela_numero=1;
  BEGIN
    UPDATE public.despesas_lancamentos SET valor_estimado=false,valor_estimado_original=NULL WHERE id=v_source;
    RAISE EXCEPTION 'Clearing estimate metadata unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYMENT_ESTIMATE_ORIGINAL_IMMUTABLE' THEN RAISE; END IF;
  END;
  v_input:=jsonb_build_object('requestId',v_request,'sourceId',v_source,'paymentDate',CURRENT_DATE,
    'components',jsonb_build_array(jsonb_build_object('accountId',v_account,'method','DINHEIRO','amount','85.00')),
    'interest','0.00','penalty','0.00','addition','0.00','discount','0.00','notes',v_tag);
  BEGIN
    PERFORM public.preview_financial_payment_secure('EXPENSE',v_source,v_input);
    RAISE EXCEPTION 'Unconfirmed estimate unexpectedly entered ordinary payment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYMENT_ESTIMATE_CONFIRMATION_REQUIRED' THEN RAISE; END IF;
  END;
  v_preview:=public.preview_estimated_expense_payment_secure(v_source,85,v_version,v_input);
  IF v_preview->>'originalAmount'<>'85.00' OR v_preview->>'remainingAfter'<>'0.00'
    OR v_before IS DISTINCT FROM (SELECT to_jsonb(d) FROM public.despesas_lancamentos d WHERE d.id=v_source) THEN
    RAISE EXCEPTION 'Read-only projected preview mismatch';
  END IF;
  v_input:=v_input||jsonb_build_object('fingerprint',v_preview->>'fingerprint');
  v_result:=public.confirm_estimated_expense_payment_secure(v_source,85,v_version,v_input);
  IF v_result->'preview'->>'status'<>'PAGO' OR (SELECT valor_base<>85 OR valor_estimado_original<>100
    FROM public.despesas_lancamentos WHERE id=v_source) THEN
    RAISE EXCEPTION 'Real value/full payment mismatch';
  END IF;
  IF (public.confirm_estimated_expense_payment_secure(v_source,85,v_version,v_input)->>'replayed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirmation replay mismatch';
  END IF;
  BEGIN
    PERFORM public.confirm_estimated_expense_payment_secure(v_source,86,v_version,v_input);
    RAISE EXCEPTION 'Changed replay unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYMENT_REQUEST_REUSED' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.financial_payment_events WHERE source_kind='EXPENSE' AND source_id=v_source)<>1
    OR (SELECT pagamento_unico FROM public.get_despesas_estimativas_secure(ARRAY[v_source])) IS NOT TRUE THEN
    RAISE EXCEPTION 'Single ledger payment proof mismatch';
  END IF;
  SELECT d.id,d.valor_estimado_versao INTO v_rateada,v_version
    FROM public.criar_despesa_estimada_secure(jsonb_build_object(
      'p_request_id',gen_random_uuid(),'p_polo_id',v_polo,'p_tipo','DESPESA_FIXA','p_descricao',v_tag||' RATEADA',
      'p_valor_base',100.01,'p_data_lancamento',CURRENT_DATE,'p_data_vencimento',CURRENT_DATE,
      'p_rateio_modo','TODOS','p_rateio_polo_ids',NULL),true) d;
  v_input:=jsonb_build_object('requestId',gen_random_uuid(),'sourceId',v_rateada,'paymentDate',CURRENT_DATE,
    'components',jsonb_build_array(jsonb_build_object('accountId',v_account,'method','DINHEIRO','amount','50.00')),
    'interest','0.00','penalty','0.00','addition','0.00','discount','0.00','notes',v_tag);
  v_preview:=public.preview_estimated_expense_payment_secure(v_rateada,120.03,v_version,v_input);
  v_input:=v_input||jsonb_build_object('fingerprint',v_preview->>'fingerprint');
  v_result:=public.confirm_estimated_expense_payment_secure(v_rateada,120.03,v_version,v_input);
  IF v_result->'preview'->>'remainingAfter'<>'70.03'
    OR (SELECT sum(valor_base) FROM public.despesas_lancamentos_rateios WHERE despesa_lancamento_id=v_rateada)<>120.03 THEN
    RAISE EXCEPTION 'Real-value allocation/partial payment mismatch';
  END IF;
  SELECT r.id INTO v_derived FROM public.despesas_lancamentos_rateios r
    WHERE r.despesa_lancamento_id=v_rateada AND r.polo_id=v_polo;
  IF (SELECT pagamento_unico FROM public.get_despesas_estimativas_secure(ARRAY[v_derived])) IS NOT FALSE THEN
    RAISE EXCEPTION 'Derived expense cannot project a physical account';
  END IF;
  v_summary:=public.get_despesas_estimativas_resumo_secure(
    'DESPESA_FIXA',NULL,NULL,v_tag,NULL,NULL,'todos',NULL,'mes');
  IF (v_summary->>'estimated_count')::integer<>11 OR (v_summary->>'estimated_value')::numeric<>1100
    OR (v_summary->>'confirmed_pending_value')::numeric<>70.03 THEN
    RAISE EXCEPTION 'Estimated/confirmed summary mismatch: %',v_summary;
  END IF;
  SELECT d.id,d.valor_estimado_versao INTO v_no_charge,v_version
    FROM public.despesas_lancamentos d WHERE d.request_id=v_create AND d.parcela_numero=2;
  v_closed:=public.resolve_estimated_expense_without_charge_secure(v_no_charge,v_version,v_no_charge_request,NULL);
  IF v_closed.status<>'CANCELADO' OR v_closed.valor_base<>100 OR v_closed.valor_estimado_original<>100
    OR v_closed.valor_sem_cobranca_em IS NULL OR v_closed.valor_confirmado_em IS NOT NULL
    OR v_closed.data_pagamento IS NOT NULL OR v_closed.valor_pago IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.financial_payment_events WHERE source_kind='EXPENSE' AND source_id=v_no_charge) THEN
    RAISE EXCEPTION 'No-charge state/history mismatch';
  END IF;
  v_closed:=public.resolve_estimated_expense_without_charge_secure(v_no_charge,v_version,v_no_charge_request,NULL);
  BEGIN
    PERFORM public.resolve_estimated_expense_without_charge_secure(v_no_charge,v_version,v_no_charge_request,'Outro motivo');
    RAISE EXCEPTION 'Changed no-charge replay unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'PAYMENT_REQUEST_REUSED' THEN RAISE; END IF;
  END;
  IF (SELECT is_estimativa_pendente FROM public.get_despesas_estimativas_secure(ARRAY[v_no_charge])) IS NOT FALSE THEN
    RAISE EXCEPTION 'No-charge expense is still presented as an open estimate';
  END IF;
  v_summary:=public.get_despesas_estimativas_resumo_secure(
    'DESPESA_FIXA',NULL,NULL,v_tag,NULL,NULL,'em_aberto',NULL,'categoria');
  IF (v_summary->>'estimated_count')::integer<>10 OR (v_summary->>'estimated_value')::numeric<>1000
    OR (v_summary->>'confirmed_pending_value')::numeric<>70.03 THEN
    RAISE EXCEPTION 'No-charge expense remains in open totals: %',v_summary;
  END IF;
  SELECT d.id,d.valor_estimado_versao INTO v_overdue,v_version
    FROM public.criar_despesa_estimada_secure(jsonb_build_object(
      'p_request_id',gen_random_uuid(),'p_polo_id',v_polo,'p_tipo','DESPESA_FIXA',
      'p_descricao',v_tag||' VENCIDA','p_valor_base',100,'p_data_lancamento',v_today-1,
      'p_data_vencimento',v_today-1),false) d;
  v_input:=jsonb_build_object('requestId',gen_random_uuid(),'sourceId',v_overdue,'paymentDate',v_today,
    'components',jsonb_build_array(jsonb_build_object('accountId',v_account,'method','DINHEIRO','amount','50.00')),
    'interest','0.00','penalty','0.00','addition','0.00','discount','0.00','notes',v_tag);
  v_preview:=public.preview_estimated_expense_payment_secure(v_overdue,120,v_version,v_input);
  PERFORM public.confirm_estimated_expense_payment_secure(v_overdue,120,v_version,
    v_input||jsonb_build_object('fingerprint',v_preview->>'fingerprint'));
  SELECT d.id,d.valor_estimado_versao INTO v_due_today,v_version
    FROM public.criar_despesa_estimada_secure(jsonb_build_object(
      'p_request_id',gen_random_uuid(),'p_polo_id',v_polo,'p_tipo','DESPESA_FIXA',
      'p_descricao',v_tag||' HOJE','p_valor_base',100,'p_data_lancamento',v_today,
      'p_data_vencimento',v_today),false) d;
  PERFORM public.confirm_estimated_expense_value_secure(v_due_today,90,v_version,gen_random_uuid());
  PERFORM public.criar_despesa_estimada_secure(jsonb_build_object(
    'p_request_id',gen_random_uuid(),'p_polo_id',v_polo,'p_tipo','DESPESA_FIXA',
    'p_descricao',v_tag||' PREVISTA ATRASADA','p_valor_base',100,'p_data_lancamento',v_today-1,
    'p_data_vencimento',v_today-1),false);
  v_bundle:=public.get_despesas_vencidas_secure('DESPESA_FIXA',v_polo,NULL,v_tag,NULL,NULL,NULL,'categoria');
  IF jsonb_array_length(v_bundle->'items')<>1
    OR v_bundle->'items'->0->>'id'<>v_overdue::text
    OR (v_bundle->'summary'->>'pending_value')::numeric<>70
    OR (v_bundle->'summary'->>'paid_value')::numeric<>50
    OR jsonb_array_length(v_bundle->'groups')<>1 THEN
    RAISE EXCEPTION 'Confirmed overdue/Maceio/remaining balance mismatch: %',v_bundle;
  END IF;
  v_bundle:=public.get_despesas_vencidas_secure('DESPESA_FIXA',v_polo,NULL,v_tag,v_today,NULL,NULL,'mes');
  IF jsonb_array_length(v_bundle->'items')<>0 THEN RAISE EXCEPTION 'Overdue lower date filter ignored'; END IF;
  v_summary:=public.get_despesas_estimativas_resumo_secure(
    'DESPESA_FIXA',NULL,NULL,v_tag,NULL,NULL,'todos',NULL,'mes');
  IF (v_summary->>'vencidos_count')::integer<>1 THEN
    RAISE EXCEPTION 'Overdue count differs from the Maceio overdue tab: %',v_summary;
  END IF;
  INSERT INTO estimated_expense_runtime_result VALUES (jsonb_build_object(
    'monthly_estimates',12,'estimated_remaining',10,'real_value_and_payment_atomic',true,
    'replay',true,'guards',true,'partial_and_rateio',true,'single_payment_proof',true,
    'no_charge_without_payment',true,'no_charge_replay',true,
    'overdue_bundle_filters_balance_and_local_date',true,
    'summary_estimated',1000,'summary_confirmed_pending',70.03,'permanent_changes',false));
END $test$;
SELECT result FROM estimated_expense_runtime_result;
