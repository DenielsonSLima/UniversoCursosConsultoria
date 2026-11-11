-- Read-only period totals and a consistent issued-report snapshot. No fiscal data is changed.
BEGIN;

CREATE OR REPLACE FUNCTION private.nfse_documents_period_query(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text,p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_date_from text DEFAULT NULL,p_date_to text DEFAULT NULL,
  p_course_type text DEFAULT NULL,p_origin text DEFAULT NULL,p_issued_state text DEFAULT NULL,p_error_archive_mode text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='20s' AS $function$
DECLARE v_data jsonb; v_from date; v_to date; v_type text:=nullif(btrim(p_course_type),'');
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_status IS NULL OR p_status NOT IN('PENDENTE','EMITIDA','ERRO') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 10000 OR length(coalesce(p_search,''))>100
    OR (p_error_archive_mode IS NOT NULL AND (p_error_archive_mode NOT IN('ACTIVE','ARCHIVED') OR p_status<>'ERRO'))
    OR (p_issued_state IS NOT NULL AND (p_issued_state NOT IN('ACTIVE','CANCELLED') OR p_status<>'EMITIDA'))
    OR length(coalesce(v_type,''))>100 OR (p_origin IS NOT NULL AND p_origin NOT IN('ALUNO','SERVICO'))
    OR (p_date_from IS NOT NULL AND p_date_from !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$')
    OR (p_date_to IS NOT NULL AND p_date_to !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$') THEN
    RAISE EXCEPTION 'Filtros de documentos inválidos.' USING ERRCODE='22023'; END IF;
  BEGIN
    v_from:=p_date_from::date; v_to:=p_date_to::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Datas de emissão inválidas.' USING ERRCODE='22023';
  END;
  IF (v_from IS NOT NULL AND v_from::text IS DISTINCT FROM p_date_from)
    OR (v_to IS NOT NULL AND v_to::text IS DISTINCT FROM p_date_to) OR v_from>v_to THEN
    RAISE EXCEPTION 'Intervalo de emissão inválido.' USING ERRCODE='22023'; END IF;
  WITH scoped AS MATERIALIZED(
    SELECT v.*,o.authorized_xml,(c.operation_id IS NOT NULL) cancelled_confirmed,
      private.nfse_error_archivable(o) error_archivable,
      CASE WHEN private.nfse_error_archivable(o) THEN a.archived_at END error_archived_at,
      CASE v.source_kind WHEN 'ACADEMIC_QUEUE' THEN 'ALUNO' WHEN 'PARTNER_SERVICE' THEN 'SERVICO' END origin,
      CASE WHEN v.source_kind='ACADEMIC_QUEUE' THEN coalesce(
        nullif(btrim(v.snapshot#>>'{source,preparation,snapshot,academic,courseType}'),''),
        nullif(btrim(v.snapshot#>>'{source,preparation,snapshot,academic,descriptionContext,courseType}'),'')) END course_type
    FROM private.nfse_operation_source_projection v JOIN private.nfse_individual_operations o ON o.id=v.operation_id
    LEFT JOIN private.nfse_confirmed_cancellations c ON c.operation_id=v.operation_id
    LEFT JOIN private.nfse_error_archives a ON a.operation_id=v.operation_id
    WHERE v.polo_id=p_polo_id AND v.environment=p_environment AND (p_status='EMITIDA' AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL) OR v.month=p_month)
      AND (p_status<>'ERRO' OR ((coalesce(p_error_archive_mode,'ACTIVE')='ARCHIVED')
        = (private.nfse_error_archivable(o) AND a.archived_at IS NOT NULL)))
      AND (p_issued_state IS NULL OR (p_issued_state='CANCELLED' AND c.operation_id IS NOT NULL)
        OR (p_issued_state='ACTIVE' AND c.operation_id IS NULL))
      AND CASE p_status WHEN 'EMITIDA' THEN v.issue_state='AUTHORIZED' WHEN 'ERRO' THEN v.issue_state IN('REJECTED','BLOCKED')
        ELSE v.issue_state IN('PREVIEWED','PROCESSING','AWAITING_CONFIRMATION') END
  ), decorated AS MATERIALIZED(
    SELECT s.*,private.nfse_authorized_xml_emitted_at(s.authorized_xml) emitted_at,
      CASE s.course_type WHEN 'TECNICO' THEN 'Técnico' WHEN 'LIVRE' THEN 'Curso livre'
        WHEN 'ESPECIALIZACAO' THEN 'Especialização' WHEN 'EAD' THEN 'EAD' ELSE s.course_type END course_type_label
    FROM scoped s
  ), filtered AS MATERIALIZED(
    SELECT d.* FROM decorated d WHERE (p_origin IS NULL OR d.origin=p_origin)
      AND (v_type IS NULL OR d.course_type=v_type)
      AND (v_from IS NULL OR (d.emitted_at AT TIME ZONE 'America/Maceio')::date>=v_from)
      AND (v_to IS NULL OR (d.emitted_at AT TIME ZONE 'America/Maceio')::date<=v_to)
      AND (coalesce(btrim(p_search),'')='' OR position(lower(btrim(p_search)) IN
        lower(coalesce(d.snapshot#>>'{recipient,name}','')||' '||coalesce(d.number,'')))>0)
  ), paged AS(
    SELECT * FROM filtered ORDER BY emitted_at DESC NULLS LAST,created_at DESC,operation_id
      LIMIT p_page_size OFFSET(p_page::bigint-1)*p_page_size
  )
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',v.operation_id,'studentName',v.snapshot#>>'{recipient,name}',
    'classLabel',CASE WHEN v.source_kind='PARTNER_SERVICE' THEN 'Serviço'
      ELSE coalesce(v.snapshot#>>'{source,preparation,snapshot,academic,classLabel}','Aluno') END,
    'amount',v.command->>'amount','modelLabel',v.snapshot#>>'{model,definition,name}',
    'status',CASE WHEN v.issue_state='AUTHORIZED' THEN 'EMITIDA' WHEN v.issue_state IN('REJECTED','BLOCKED') THEN 'ERRO'
      WHEN v.issue_state='PROCESSING' THEN 'EM_PROCESSAMENTO' WHEN v.issue_state='AWAITING_CONFIRMATION' THEN 'AGUARDANDO_CONFIRMACAO'
      ELSE 'PENDENTE' END,'number',v.number,'accessKey',v.access_key,
    'errorCode',coalesce(v.result#>>'{codes,0}',v.result->>'code'),'errorMessage',v.message,'retryable',false,
    'emittedAt',v.emitted_at,'dateSource',CASE WHEN v.emitted_at IS NOT NULL THEN 'NFSE_DH_PROC' END,
    'origin',v.origin,'courseType',v.course_type,'courseTypeLabel',v.course_type_label,
    'archivedAt',v.error_archived_at,'canArchive',p_status='ERRO' AND v.error_archivable AND v.error_archived_at IS NULL,
    'canRestore',p_status='ERRO' AND v.error_archivable AND v.error_archived_at IS NOT NULL)
      ||private.nfse_operation_fields(v.source_kind,v.source_id)
      ||jsonb_build_object('state',CASE WHEN v.state='CANCELLED' AND NOT v.cancelled_confirmed
        THEN 'CANCELLATION_PENDING' ELSE v.state END)
    ORDER BY v.emitted_at DESC NULLS LAST,v.created_at DESC,v.operation_id) FROM paged v),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,'totalItems',(SELECT count(*)::integer FROM filtered),
    'totalAmount',(SELECT CASE WHEN count(*)=count(command->>'amount') AND bool_and(coalesce((command->>'amount') ~ '^(0|[1-9][0-9]{0,17})[.][0-9]{2}$',false)) IS NOT FALSE
      THEN coalesce(sum(CASE WHEN (command->>'amount') ~ '^(0|[1-9][0-9]{0,17})[.][0-9]{2}$' THEN (command->>'amount')::numeric END),0)::numeric(30,2)::text ELSE NULL END FROM filtered),
    'courseTypes',coalesce((SELECT jsonb_agg(jsonb_build_object('value',course_type,'label',course_type_label)
      ORDER BY course_type_label,course_type) FROM(SELECT DISTINCT course_type,course_type_label FROM decorated
        WHERE course_type IS NOT NULL) types),'[]'::jsonb)) INTO v_data;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',v_data);
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_documents_period_query(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_nfse_documents_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text,p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_date_from text DEFAULT NULL,p_date_to text DEFAULT NULL,
  p_course_type text DEFAULT NULL,p_origin text DEFAULT NULL,p_issued_state text DEFAULT NULL,p_error_archive_mode text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Tamanho da página inválido.' USING ERRCODE='22023'; END IF;
  RETURN private.nfse_documents_period_query(p_context_key,p_polo_id,p_environment,p_month,p_status,p_search,
    p_page,p_page_size,p_date_from,p_date_to,p_course_type,p_origin,p_issued_state,p_error_archive_mode);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_nfse_issued_report_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_search text DEFAULT NULL,
  p_date_from text DEFAULT NULL,p_date_to text DEFAULT NULL,p_course_type text DEFAULT NULL,p_origin text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='20s' AS $function$
DECLARE v_report jsonb;
BEGIN
  v_report:=private.nfse_documents_period_query(p_context_key,p_polo_id,p_environment,p_month,'EMITIDA',p_search,
    1,10000,p_date_from,p_date_to,p_course_type,p_origin,'ACTIVE',NULL);
  IF (v_report#>>'{data,totalItems}')::integer>10000 THEN
    RAISE EXCEPTION 'O período contém mais de 10.000 notas. Reduza o intervalo ou refine os filtros para exportar.' USING ERRCODE='22023',DETAIL='NFSE_REPORT_TOO_LARGE';
  END IF;
  RETURN jsonb_set(v_report,'{data,generatedAt}',to_jsonb(statement_timestamp()));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_issued_report_secure(uuid,uuid,text,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_issued_report_secure(uuid,uuid,text,text,text,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
