-- New read-only report; no emission/cancellation/financial mutation.
BEGIN;
CREATE FUNCTION public.get_nfse_accounting_report_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_date_from text,p_date_to text,p_mode text DEFAULT 'POLO'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='30s' AS $function$
DECLARE v_company uuid; v_polo record; v_unit_report jsonb; v_row jsonb; v_rows jsonb:='[]';
  v_raw record; v_fields jsonb; v_ordered jsonb; v_by_code jsonb; v_by_nbs jsonb; v_by_polo jsonb; v_total text;
  v_units jsonb:='[]'; v_is_matrix boolean; v_pages jsonb; v_summary_pages jsonb; v_summary jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_mode IS NULL OR p_mode NOT IN('POLO','GERAL') OR p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'Informe modelo e período de emissão.' USING ERRCODE='22023'; END IF;
  SELECT company_id,is_matriz INTO v_company,v_is_matrix FROM public.polos WHERE id=p_polo_id;
  IF p_mode='GERAL' AND (v_is_matrix IS NOT TRUE OR v_company IS NULL) THEN
    RAISE EXCEPTION 'O consolidado fiscal é exclusivo da matriz.' USING ERRCODE='42501'; END IF;
  -- Authorize EVERY unit before reading any document. No silent partial consolidation.
  FOR v_polo IN SELECT id,nome FROM public.polos WHERE
    (p_mode='POLO' AND id=p_polo_id) OR
    (p_mode='GERAL' AND company_id=v_company AND public.is_active_status(status)) ORDER BY nome,id
  LOOP
    PERFORM private.authorize_nfse_model_scope(p_context_key,v_polo.id,p_environment,p_month);
    v_units:=v_units||jsonb_build_array(jsonb_build_object('poloId',v_polo.id,'poloName',v_polo.nome));
  END LOOP;
  FOR v_polo IN SELECT * FROM jsonb_to_recordset(v_units) AS u("poloId" uuid,"poloName" text)
  LOOP
    v_unit_report:=public.get_nfse_issued_report_secure(p_context_key,v_polo."poloId",p_environment,p_month,
      NULL,p_date_from,p_date_to,NULL,NULL);
    IF jsonb_array_length(v_rows)+(v_unit_report#>>'{data,totalItems}')::integer>10000 THEN
      RAISE EXCEPTION 'O relatório aceita até 10.000 notas. Reduza o período.' USING ERRCODE='22023'; END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_unit_report#>'{data,rows}') LOOP
      SELECT o.authorized_xml,v.snapshot INTO STRICT v_raw
      FROM private.nfse_individual_operations o JOIN private.nfse_operation_source_projection v ON v.operation_id=o.id
      WHERE o.id=(v_row->>'id')::uuid AND v.polo_id=v_polo."poloId" AND v.environment=p_environment;
      v_fields:=private.nfse_accounting_xml_fields(v_raw.authorized_xml);
      v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
        'id',v_row->>'id','number',v_row->>'number','accessKey',v_row->>'accessKey',
        'emittedAt',v_row->>'emittedAt','state',v_row->>'state','origin',v_row->>'origin',
        'poloId',v_polo."poloId",'poloName',v_polo."poloName",
        'recipientName',v_fields->>'recipientName','recipientDocument',v_fields->>'recipientDocument',
        'serviceDate',coalesce(v_raw.snapshot#>>'{command,serviceDate}',v_raw.snapshot->>'serviceDate'),'competenceDate',v_fields->>'competenceDate',
        'nationalServiceCode',v_fields->>'nationalServiceCode','nbsCode',v_fields->>'nbsCode',
        'amount',CASE WHEN (v_fields->>'amount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$'
          THEN ((v_fields->>'amount')::numeric)::numeric(30,2)::text END,
        'issAmount',CASE WHEN (v_fields->>'issAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$'
          THEN ((v_fields->>'issAmount')::numeric)::numeric(30,2)::text END,
        'issRetention',v_fields->>'issRetention','xmlAvailable',v_fields IS NOT NULL));
    END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'emittedAt',value->>'poloName',value->>'id'),'[]'),
    CASE WHEN count(*)=count(value->>'amount') THEN coalesce(sum((value->>'amount')::numeric),0)::numeric(30,2)::text END
    INTO v_ordered,v_total FROM jsonb_array_elements(v_rows);
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'count',n,'amount',amount) ORDER BY code NULLS LAST),'[]')
    INTO v_by_code FROM(SELECT value->>'nationalServiceCode' code,count(*) n,
      CASE WHEN count(*)=count(value->>'amount') THEN sum((value->>'amount')::numeric)::numeric(30,2)::text END amount
      FROM jsonb_array_elements(v_rows) GROUP BY value->>'nationalServiceCode') g;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'count',n,'amount',amount) ORDER BY code NULLS LAST),'[]')
    INTO v_by_nbs FROM(SELECT value->>'nbsCode' code,count(*) n,
      CASE WHEN count(*)=count(value->>'amount') THEN sum((value->>'amount')::numeric)::numeric(30,2)::text END amount
      FROM jsonb_array_elements(v_rows) GROUP BY value->>'nbsCode') g;
  SELECT coalesce(jsonb_agg(jsonb_build_object('poloId',u->>'poloId','poloName',u->>'poloName',
    'count',s.n,'amount',s.amount) ORDER BY u->>'poloName',u->>'poloId'),'[]') INTO v_by_polo
  FROM jsonb_array_elements(v_units) u CROSS JOIN LATERAL(
    SELECT count(*) n,CASE WHEN count(*)=count(r->>'amount')
      THEN coalesce(sum((r->>'amount')::numeric),0)::numeric(30,2)::text END amount
    FROM jsonb_array_elements(v_rows) r WHERE r->>'poloId'=u->>'poloId')s;
  -- Fixed page contract for landscape two-line rows; renderer does not paginate business data.
  SELECT coalesce(jsonb_agg(items ORDER BY page),'[]') INTO v_pages FROM(
    SELECT ((ordinality-1)/8)::integer page,jsonb_agg(value ORDER BY ordinality) items
    FROM jsonb_array_elements(v_ordered) WITH ORDINALITY GROUP BY ((ordinality-1)/8)::integer) p;
  v_summary:=coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','CODE')) FROM jsonb_array_elements(v_by_code)),'[]');
  v_summary:=v_summary||coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','NBS')) FROM jsonb_array_elements(v_by_nbs)),'[]');
  IF p_mode='GERAL' THEN v_summary:=v_summary||coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','POLO')) FROM jsonb_array_elements(v_by_polo)),'[]'); END IF;
  SELECT coalesce(jsonb_agg(items ORDER BY page),'[]') INTO v_summary_pages FROM(
    SELECT ((ordinality-1)/12)::integer page,jsonb_agg(value ORDER BY ordinality) items
    FROM jsonb_array_elements(v_summary) WITH ORDINALITY GROUP BY ((ordinality-1)/12)::integer) p;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object(
      'mode',p_mode,'dateFrom',p_date_from,'dateTo',p_date_to,'generatedAt',statement_timestamp(),
      'pages',v_pages,'totalItems',jsonb_array_length(v_rows),'totalAmount',v_total,
      'byCode',v_by_code,'byNbs',v_by_nbs,'byPolo',v_by_polo,'summaryPages',v_summary_pages,'unitsDescription','Polos ativos autorizados da mesma instituição'));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_accounting_report_secure(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_accounting_report_secure(uuid,uuid,text,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
