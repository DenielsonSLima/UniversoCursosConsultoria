-- Read-only fiscal projection. Never replaces missing XML values with estimates.
BEGIN;
CREATE FUNCTION private.nfse_accounting_xml_fields_v4(p_xml text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $function$
DECLARE v_fields jsonb; v_xml xml;
BEGIN
  IF octet_length(p_xml)>4500000 OR strpos(upper(p_xml),'<!DOCTYPE')>0
    OR strpos(upper(p_xml),'<!ENTITY')>0 THEN RETURN NULL; END IF;
  v_xml:=xmlparse(DOCUMENT p_xml);
  IF cardinality(xpath('/nf:NFSe/nf:infNFSe',v_xml,
    ARRAY[ARRAY['nf','http://www.sped.fazenda.gov.br/nfse']]))<>1 THEN RETURN NULL; END IF;
  SELECT to_jsonb(f) INTO v_fields FROM XMLTABLE(
    XMLNAMESPACES('http://www.sped.fazenda.gov.br/nfse' AS nf),
    '/nf:NFSe/nf:infNFSe' PASSING v_xml COLUMNS
    "recipientName" text PATH 'nf:DPS/nf:infDPS/nf:toma/nf:xNome',
    "recipientDocument" text PATH 'nf:DPS/nf:infDPS/nf:toma/nf:CNPJ | nf:DPS/nf:infDPS/nf:toma/nf:CPF',
    "competenceDate" text PATH 'nf:DPS/nf:infDPS/nf:dCompet',
    "nationalServiceCode" text PATH 'nf:DPS/nf:infDPS/nf:serv/nf:cServ/nf:cTribNac',
    "nbsCode" text PATH 'nf:DPS/nf:infDPS/nf:serv/nf:cServ/nf:cNBS',
    "amount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:vServPrest/nf:vServ',
    "pisAmount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribFed/nf:piscofins/nf:vPis',
    "cofinsAmount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribFed/nf:piscofins/nf:vCofins',
    "socialAmount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribFed/nf:vRetCSLL',
    "irrfAmount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribFed/nf:vRetIRRF',
    "cpAmount" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribFed/nf:vRetCP',
    "fedRetention" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribFed/nf:piscofins/nf:tpRetPisCofins',
    "cbsAmount" text PATH 'nf:IBSCBS/nf:totCIBS/nf:gCBS/nf:vCBS',
    "ibsAmount" text PATH 'nf:IBSCBS/nf:totCIBS/nf:gIBS/nf:vIBSTot',
    "issAmount" text PATH 'nf:valores/nf:vISSQN',
    "issRetention" text PATH 'nf:DPS/nf:infDPS/nf:valores/nf:trib/nf:tribMun/nf:tpRetISSQN'
  ) f;
  RETURN v_fields;
EXCEPTION WHEN invalid_xml_document OR invalid_xml_content THEN RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_accounting_xml_fields_v4(text) FROM PUBLIC,anon,authenticated,service_role;

-- New read-only report; no emission/cancellation/financial mutation.

CREATE OR REPLACE FUNCTION public.get_nfse_accounting_report_v4_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_date_from text,p_date_to text,p_mode text DEFAULT 'POLO'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='30s' AS $function$
DECLARE v_company uuid; v_polo record; v_rows jsonb:='[]'; v_valid_rows jsonb; v_from date; v_to date;
  v_raw record; v_fields jsonb; v_ordered jsonb; v_by_code jsonb; v_by_nbs jsonb; v_by_polo jsonb; v_total text;
  v_taxes jsonb; v_indicators jsonb; v_status jsonb; v_units jsonb:='[]'; v_is_matrix boolean; v_pages jsonb; v_summary_pages jsonb; v_summary jsonb; v_column_pages jsonb;
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
        THEN private.nfse_accounting_xml_fields_v4(v_raw.authorized_xml) END;
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
        'cbsAmount',CASE WHEN (v_fields->>'cbsAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'cbsAmount')::numeric)::numeric(30,2)::text END,
        'ibsAmount',CASE WHEN (v_fields->>'ibsAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'ibsAmount')::numeric)::numeric(30,2)::text END,
        'pisAmount',CASE WHEN (v_fields->>'pisAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'pisAmount')::numeric)::numeric(30,2)::text END,
        'cofinsAmount',CASE WHEN (v_fields->>'cofinsAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'cofinsAmount')::numeric)::numeric(30,2)::text END,
        'socialAmount',CASE WHEN (v_fields->>'socialAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'socialAmount')::numeric)::numeric(30,2)::text END,
        'irrfAmount',CASE WHEN (v_fields->>'irrfAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'irrfAmount')::numeric)::numeric(30,2)::text END,
        'cpAmount',CASE WHEN (v_fields->>'cpAmount')~'^(0|[1-9][0-9]{0,17})([.][0-9]{1,2})?$' THEN ((v_fields->>'cpAmount')::numeric)::numeric(30,2)::text END,
        'fedRetention',v_fields->>'fedRetention','issRetention',v_fields->>'issRetention','xmlAvailable',v_fields IS NOT NULL));
    END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'emittedAt',value->>'poloName',value->>'id'),'[]')
    INTO v_ordered FROM jsonb_array_elements(v_rows);
  SELECT coalesce(jsonb_agg(value),'[]') INTO v_valid_rows FROM jsonb_array_elements(v_rows)
    WHERE (value->>'validForTotals')::boolean;
  SELECT CASE WHEN count(*)=count(value->>'amount')
    THEN coalesce(sum((value->>'amount')::numeric),0)::numeric(30,2)::text END
    INTO v_total FROM jsonb_array_elements(v_valid_rows);
  v_by_code:='[]'::jsonb; -- Removed from report presentation; original fiscal code remains on source notes.
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
  SELECT jsonb_build_object(
    'cbsAmount',CASE WHEN count(*)>0 AND count(*)=count(value->>'cbsAmount') THEN sum((value->>'cbsAmount')::numeric)::numeric(30,2)::text END,
    'ibsAmount',CASE WHEN count(*)>0 AND count(*)=count(value->>'ibsAmount') THEN sum((value->>'ibsAmount')::numeric)::numeric(30,2)::text END,
    'cbsReportedCount',count(value->>'cbsAmount'),'ibsReportedCount',count(value->>'ibsAmount'))
    INTO v_taxes FROM jsonb_array_elements(v_valid_rows);
  -- Informative XML amounts only. SOCIAL remains a combined retention group.
  WITH tax_rows AS (
    SELECT r, t.key, t.position, t.amount,
      CASE WHEN t.key='ISS' THEN CASE r->>'issRetention' WHEN '1' THEN 'NOT_RETAINED' WHEN '2' THEN 'RETAINED' WHEN '3' THEN 'RETAINED' ELSE 'UNKNOWN' END
        WHEN t.key='PIS' THEN CASE WHEN r->>'fedRetention' IN('1','3','4','5','7') THEN 'RETAINED' WHEN r->>'fedRetention' IN('0','2','6','8','9') THEN 'NOT_RETAINED' ELSE 'UNKNOWN' END
        WHEN t.key='COFINS' THEN CASE WHEN r->>'fedRetention' IN('1','3','4','6','7','9') THEN 'RETAINED' WHEN r->>'fedRetention' IN('0','2','5','8') THEN 'NOT_RETAINED' ELSE 'UNKNOWN' END
        WHEN t.key IN('SOCIAL','IRRF','CP') AND t.amount IS NOT NULL THEN 'RETAINED'
        ELSE 'UNKNOWN' END retention
    FROM jsonb_array_elements(v_valid_rows) r CROSS JOIN LATERAL (VALUES
      ('ISS',1,r->>'issAmount'),('PIS',2,r->>'pisAmount'),('COFINS',3,r->>'cofinsAmount'),
      ('SOCIAL',4,CASE WHEN r->>'fedRetention'='1' THEN
        CASE WHEN r->>'socialAmount' IS NOT NULL AND r->>'pisAmount' IS NOT NULL AND r->>'cofinsAmount' IS NOT NULL
          THEN (((r->>'socialAmount')::numeric+(r->>'pisAmount')::numeric+(r->>'cofinsAmount')::numeric)::numeric(30,2))::text END
        ELSE r->>'socialAmount' END),
      ('IRRF',5,r->>'irrfAmount'),('CP',6,r->>'cpAmount'),('CBS',7,r->>'cbsAmount'),('IBS',8,r->>'ibsAmount')
    )t(key,position,amount)
  ), keys AS (SELECT * FROM (VALUES ('ISS',1),('PIS',2),('COFINS',3),('SOCIAL',4),('IRRF',5),('CP',6),('CBS',7),('IBS',8))k(key,position))
  SELECT jsonb_agg(item ORDER BY position) INTO v_indicators FROM (
    SELECT k.position,jsonb_build_object('key',k.key,
    'amount',CASE WHEN count(t.r)>0 AND count(t.r)=count(t.amount) THEN sum(t.amount::numeric)::numeric(30,2)::text END,
    'informedCount',count(t.amount),'zeroCount',count(*) FILTER(WHERE t.amount::numeric=0),
    'retainedCount',count(*) FILTER(WHERE t.retention='RETAINED'),
    'notRetainedCount',count(*) FILTER(WHERE t.retention='NOT_RETAINED'),
    'unknownRetentionCount',count(*) FILTER(WHERE t.retention='UNKNOWN')) item
    FROM keys k LEFT JOIN tax_rows t ON t.key=k.key GROUP BY k.key,k.position
  ) indicators;
  -- Per-unit statuses are mutually exclusive; confirmed cancellation only.
  SELECT jsonb_agg(jsonb_build_object('poloId',u->>'poloId','poloName',u->>'poloName','poloCity',u->>'poloCity','poloState',u->>'poloState',
    'total',s.total,'valid',s.valid,'cancelled',s.cancelled,'rejected',s.rejected,'pending',s.pending,'other',s.other) ORDER BY u->>'poloName',u->>'poloId')
    INTO v_status FROM jsonb_array_elements(v_units) u CROSS JOIN LATERAL (
      SELECT count(*) total,count(*) FILTER(WHERE category='valid') valid,count(*) FILTER(WHERE category='cancelled') cancelled,
        count(*) FILTER(WHERE category='rejected') rejected,count(*) FILTER(WHERE category='pending') pending,count(*) FILTER(WHERE category='other') other
      FROM (SELECT CASE WHEN (r->>'validForTotals')::boolean THEN 'valid' WHEN r->>'state'='CANCELLED' THEN 'cancelled'
        WHEN r->>'state' IN('REJECTED','BLOCKED') THEN 'rejected' WHEN r->>'state' IN('PROCESSING','AWAITING_CONFIRMATION') THEN 'pending' ELSE 'other' END category
        FROM jsonb_array_elements(v_rows) r WHERE r->>'poloId'=u->>'poloId') categories
    ) s;
  -- Fixed page contract for landscape three-line rows; renderer does not paginate business data.
  SELECT coalesce(jsonb_agg(items ORDER BY page),'[]') INTO v_pages FROM(
    SELECT ((ordinality-1)/6)::integer page,jsonb_agg(value ORDER BY ordinality) items
    FROM jsonb_array_elements(v_ordered) WITH ORDINALITY GROUP BY ((ordinality-1)/6)::integer) p;
  v_summary:=coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','CODE')) FROM jsonb_array_elements(v_by_code)),'[]');
  v_summary:=v_summary||coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','NBS')) FROM jsonb_array_elements(v_by_nbs)),'[]');
  v_summary:=v_summary||coalesce((SELECT jsonb_agg(value||jsonb_build_object('kind','POLO')) FROM jsonb_array_elements(v_by_polo)),'[]');
  SELECT coalesce(jsonb_agg(items ORDER BY page),'[]') INTO v_summary_pages FROM(
    SELECT ((ordinality-1)/12)::integer page,jsonb_agg(value ORDER BY ordinality) items
    FROM jsonb_array_elements(v_summary) WITH ORDINALITY GROUP BY ((ordinality-1)/12)::integer) p;
  -- Parallel columns, 4 groups per page in each column. Totals belong only to each column's final page.
  SELECT jsonb_agg(jsonb_build_object(
    'code',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(v_by_code) WITH ORDINALITY WHERE ordinality BETWEEN page*4+1 AND page*4+4),'[]'),
    'nbs',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(v_by_nbs) WITH ORDINALITY WHERE ordinality BETWEEN page*4+1 AND page*4+4),'[]'),
    'polo',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(v_by_polo) WITH ORDINALITY WHERE ordinality BETWEEN page*4+1 AND page*4+4),'[]'),
    'codeLast',page=greatest(0,(jsonb_array_length(v_by_code)-1)/4),
    'nbsLast',page=greatest(0,(jsonb_array_length(v_by_nbs)-1)/4),
    'poloLast',page=greatest(0,(jsonb_array_length(v_by_polo)-1)/4)
  ) ORDER BY page) INTO v_column_pages FROM generate_series(0,greatest(0,
    (jsonb_array_length(v_by_code)-1)/4,(jsonb_array_length(v_by_nbs)-1)/4,
    (jsonb_array_length(v_by_polo)-1)/4)) page;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object(
      'mode',p_mode,'dateFrom',p_date_from,'dateTo',p_date_to,'generatedAt',statement_timestamp(),
      'pages',v_pages,'totalItems',jsonb_array_length(v_rows),'validItems',jsonb_array_length(v_valid_rows),'totalAmount',v_total,
      'taxIndicators',v_indicators,'byPoloStatus',v_status,'taxSummary',v_taxes,'summaryColumnPages',v_column_pages,'byCode',v_by_code,'byNbs',v_by_nbs,'byPolo',v_by_polo,'summaryPages',v_summary_pages,'unitsDescription','Polos ativos autorizados da mesma instituição'));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_accounting_report_v4_secure(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_accounting_report_v4_secure(uuid,uuid,text,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
