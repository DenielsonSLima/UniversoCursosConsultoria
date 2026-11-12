-- New read-only report; no emission/cancellation/financial mutation.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_nfse_accounting_report_v2_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_date_from text,p_date_to text,p_mode text DEFAULT 'POLO'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='30s' AS $function$
DECLARE v_company uuid; v_polo record; v_rows jsonb:='[]'; v_valid_rows jsonb; v_from date; v_to date;
  v_raw record; v_fields jsonb; v_ordered jsonb; v_by_code jsonb; v_by_nbs jsonb; v_by_polo jsonb; v_total text;
  v_units jsonb:='[]'; v_is_matrix boolean; v_pages jsonb; v_summary_pages jsonb; v_summary jsonb; v_column_pages jsonb;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_mode IS NULL OR p_mode NOT IN('POLO','GERAL') OR p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'Informe modelo e período de emissão.' USING ERRCODE='22023'; END IF;
  BEGIN
    IF p_date_from !~ '^\d{4}-\d{2}-\d{2}$' OR p_date_to !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Datas de emissão inválidas.' USING ERRCODE='22023'; END IF;
    v_from:=p_date_from::date; v_to:=p_date_to::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Datas de emissão inválidas.' USING ERRCODE='22023'; END;
  IF v_from::text<>p_date_from OR v_to::text<>p_date_to OR v_from>v_to THEN
    RAISE EXCEPTION 'Intervalo de emissão inválido.' USING ERRCODE='22023'; END IF;
  SELECT company_id,is_matriz INTO v_company,v_is_matrix FROM public.polos WHERE id=p_polo_id;
  IF p_mode='GERAL' AND (v_is_matrix IS NOT TRUE OR v_company IS NULL) THEN
    RAISE EXCEPTION 'O consolidado fiscal é exclusivo da matriz.' USING ERRCODE='42501'; END IF;
  -- Authorize EVERY unit before reading any document. No silent partial consolidation.
  FOR v_polo IN SELECT id,nome,cnpj,cidade,estado FROM public.polos WHERE
    (p_mode='POLO' AND id=p_polo_id) OR
    (p_mode='GERAL' AND company_id=v_company AND public.is_active_status(status)) ORDER BY nome,id
  LOOP
    PERFORM private.authorize_nfse_model_scope(p_context_key,v_polo.id,p_environment,p_month);
    v_units:=v_units||jsonb_build_array(jsonb_build_object('poloId',v_polo.id,'poloName',v_polo.nome,'poloCnpj',v_polo.cnpj,'poloCity',v_polo.cidade,'poloState',v_polo.estado));
  END LOOP;
  FOR v_polo IN SELECT * FROM jsonb_to_recordset(v_units) AS u("poloId" uuid,"poloName" text,"poloCnpj" text,"poloCity" text,"poloState" text)
  LOOP
    -- Issued documents use the fiscal emission date; non-issued operations use creation date.
    -- PREVIEWED drafts are not fiscal operations and deliberately remain outside this report.
    FOR v_raw IN
      SELECT v.*,o.authorized_xml,(c.operation_id IS NOT NULL) cancelled_confirmed,
        CASE WHEN v.issue_state='AUTHORIZED' THEN private.nfse_authorized_xml_emitted_at(o.authorized_xml)
          ELSE v.created_at END reference_at
      FROM private.nfse_operation_source_projection v
      JOIN private.nfse_individual_operations o ON o.id=v.operation_id
      LEFT JOIN private.nfse_confirmed_cancellations c ON c.operation_id=v.operation_id
      WHERE v.polo_id=v_polo."poloId" AND v.environment=p_environment
        AND v.issue_state IN('AUTHORIZED','REJECTED','BLOCKED','PROCESSING','AWAITING_CONFIRMATION')
        AND (CASE WHEN v.issue_state='AUTHORIZED' THEN private.nfse_authorized_xml_emitted_at(o.authorized_xml)
          ELSE v.created_at END AT TIME ZONE 'America/Maceio')::date BETWEEN v_from AND v_to
      ORDER BY reference_at,v.operation_id
    LOOP
      IF jsonb_array_length(v_rows)>=10000 THEN
        RAISE EXCEPTION 'O relatório aceita até 10.000 registros. Reduza o período.' USING ERRCODE='22023'; END IF;
      v_fields:=CASE WHEN v_raw.issue_state='AUTHORIZED'
        THEN private.nfse_accounting_xml_fields(v_raw.authorized_xml) END;
      v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
        'id',v_raw.operation_id,
        'number',CASE WHEN v_raw.issue_state='AUTHORIZED' THEN v_raw.number END,
        'accessKey',CASE WHEN v_raw.issue_state='AUTHORIZED' THEN v_raw.access_key END,
        'emittedAt',v_raw.reference_at,'dateSource',CASE WHEN v_raw.issue_state='AUTHORIZED' THEN 'EMISSION' ELSE 'CREATED' END,
        'state',CASE WHEN v_raw.cancelled_confirmed THEN 'CANCELLED'
          WHEN v_raw.state='CANCELLED' THEN 'CANCELLATION_PENDING' ELSE v_raw.state END,
        'validForTotals',v_raw.issue_state='AUTHORIZED' AND NOT v_raw.cancelled_confirmed,
        'origin',CASE v_raw.source_kind WHEN 'ACADEMIC_QUEUE' THEN 'ALUNO' WHEN 'PARTNER_SERVICE' THEN 'SERVICO' END,
        'poloId',v_polo."poloId",'poloName',v_polo."poloName",'poloCnpj',v_polo."poloCnpj",'poloCity',v_polo."poloCity",'poloState',v_polo."poloState",
        'recipientName',CASE WHEN v_raw.issue_state='AUTHORIZED' THEN v_fields->>'recipientName'
          ELSE v_raw.snapshot#>>'{recipient,name}' END,
        'recipientDocument',CASE WHEN v_raw.issue_state='AUTHORIZED' THEN v_fields->>'recipientDocument'
          ELSE v_raw.snapshot#>>'{recipient,document}' END,
        'serviceDate',coalesce(v_raw.snapshot#>>'{command,serviceDate}',v_raw.snapshot->>'serviceDate'),'competenceDate',v_fields->>'competenceDate',
        'nationalServiceCode',v_fields->>'nationalServiceCode','nbsCode',v_fields->>'nbsCode',
        'amount',CASE WHEN (v_fields->>'amount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$'
          THEN ((v_fields->>'amount')::numeric)::numeric(30,2)::text END,
        'issAmount',CASE WHEN (v_fields->>'issAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$'
          THEN ((v_fields->>'issAmount')::numeric)::numeric(30,2)::text END,
        'issRetention',v_fields->>'issRetention','xmlAvailable',v_fields IS NOT NULL));
    END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'emittedAt',value->>'poloName',value->>'id'),'[]')
    INTO v_ordered FROM jsonb_array_elements(v_rows);
  SELECT coalesce(jsonb_agg(value),'[]') INTO v_valid_rows FROM jsonb_array_elements(v_rows)
    WHERE (value->>'validForTotals')::boolean;
  SELECT CASE WHEN count(*)=count(value->>'amount')
    THEN coalesce(sum((value->>'amount')::numeric),0)::numeric(30,2)::text END
    INTO v_total FROM jsonb_array_elements(v_valid_rows);
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'count',n,'amount',amount) ORDER BY code NULLS LAST),'[]')
    INTO v_by_code FROM(SELECT value->>'nationalServiceCode' code,count(*) n,
      CASE WHEN count(*)=count(value->>'amount') THEN sum((value->>'amount')::numeric)::numeric(30,2)::text END amount
      FROM jsonb_array_elements(v_valid_rows) GROUP BY value->>'nationalServiceCode') g;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'count',n,'amount',amount) ORDER BY code NULLS LAST),'[]')
    INTO v_by_nbs FROM(SELECT value->>'nbsCode' code,count(*) n,
      CASE WHEN count(*)=count(value->>'amount') THEN sum((value->>'amount')::numeric)::numeric(30,2)::text END amount
      FROM jsonb_array_elements(v_valid_rows) GROUP BY value->>'nbsCode') g;
  SELECT coalesce(jsonb_agg(jsonb_build_object('poloId',u->>'poloId','poloName',u->>'poloName','poloCnpj',u->>'poloCnpj','poloCity',u->>'poloCity','poloState',u->>'poloState',
    'count',s.n,'amount',s.amount) ORDER BY u->>'poloName',u->>'poloId'),'[]') INTO v_by_polo
  FROM jsonb_array_elements(v_units) u CROSS JOIN LATERAL(
    SELECT count(*) n,CASE WHEN count(*)=count(r->>'amount')
      THEN coalesce(sum((r->>'amount')::numeric),0)::numeric(30,2)::text END amount
    FROM jsonb_array_elements(v_valid_rows) r WHERE r->>'poloId'=u->>'poloId')s;
  -- Fixed page contract for landscape three-line rows; renderer does not paginate business data.
  SELECT coalesce(jsonb_agg(items ORDER BY page),'[]') INTO v_pages FROM(
    SELECT ((ordinality-1)/6)::integer page,jsonb_agg(value ORDER BY ordinality) items
    FROM jsonb_array_elements(v_ordered) WITH ORDINALITY GROUP BY ((ordinality-1)/6)::integer) p;
  v_summary:=coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','CODE')) FROM jsonb_array_elements(v_by_code)),'[]');
  v_summary:=v_summary||coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','NBS')) FROM jsonb_array_elements(v_by_nbs)),'[]');
  IF p_mode='GERAL' THEN v_summary:=v_summary||coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','POLO')) FROM jsonb_array_elements(v_by_polo)),'[]'); END IF;
  SELECT coalesce(jsonb_agg(items ORDER BY page),'[]') INTO v_summary_pages FROM(
    SELECT ((ordinality-1)/12)::integer page,jsonb_agg(value ORDER BY ordinality) items
    FROM jsonb_array_elements(v_summary) WITH ORDINALITY GROUP BY ((ordinality-1)/12)::integer) p;
  -- Parallel columns, 8 groups per page in each column. Totals belong only to each column's final page.
  SELECT jsonb_agg(jsonb_build_object(
    'code',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(v_by_code) WITH ORDINALITY WHERE ordinality BETWEEN page*8+1 AND page*8+8),'[]'),
    'nbs',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(v_by_nbs) WITH ORDINALITY WHERE ordinality BETWEEN page*8+1 AND page*8+8),'[]'),
    'polo',CASE WHEN p_mode='GERAL' THEN coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(v_by_polo) WITH ORDINALITY WHERE ordinality BETWEEN page*8+1 AND page*8+8),'[]') ELSE '[]'::jsonb END,
    'codeLast',page=greatest(0,(jsonb_array_length(v_by_code)-1)/8),
    'nbsLast',page=greatest(0,(jsonb_array_length(v_by_nbs)-1)/8),
    'poloLast',p_mode='GERAL' AND page=greatest(0,(jsonb_array_length(v_by_polo)-1)/8)
  ) ORDER BY page) INTO v_column_pages FROM generate_series(0,greatest(0,
    (jsonb_array_length(v_by_code)-1)/8,(jsonb_array_length(v_by_nbs)-1)/8,
    CASE WHEN p_mode='GERAL' THEN (jsonb_array_length(v_by_polo)-1)/8 ELSE 0 END)) page;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object(
      'mode',p_mode,'dateFrom',p_date_from,'dateTo',p_date_to,'generatedAt',statement_timestamp(),
      'pages',v_pages,'totalItems',jsonb_array_length(v_rows),'validItems',jsonb_array_length(v_valid_rows),'totalAmount',v_total,
      'summaryColumnPages',v_column_pages,'byCode',v_by_code,'byNbs',v_by_nbs,'byPolo',v_by_polo,'summaryPages',v_summary_pages,'unitsDescription','Polos ativos autorizados da mesma instituição'));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_accounting_report_v2_secure(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_accounting_report_v2_secure(uuid,uuid,text,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
