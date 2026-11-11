BEGIN;

-- Archiving is presentation metadata, not fiscal cancellation or queue removal.
CREATE TABLE private.nfse_error_archive_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK(environment IN('HOMOLOGACAO','PRODUCAO')),
  queue_month text NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_id)
);
CREATE TABLE private.nfse_error_archives (
  operation_id uuid PRIMARY KEY REFERENCES private.nfse_individual_operations(id),
  request_row_id uuid NOT NULL REFERENCES private.nfse_error_archive_requests(id),
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.nfse_error_archive_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_error_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_error_archive_requests,private.nfse_error_archives FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_error_archive_request_immutable BEFORE UPDATE OR DELETE ON private.nfse_error_archive_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_error_archive_no_delete BEFORE DELETE ON private.nfse_error_archives
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_error_archive_request_changed AFTER INSERT ON private.nfse_error_archive_requests
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_queue_change();

-- A local BLOCKED condition or ambiguous transmission is never sufficient.
-- The executor stores REJECTED only after validating the provider rejection envelope.
CREATE FUNCTION private.nfse_error_archivable(p_operation private.nfse_individual_operations)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
  SELECT coalesce(CASE WHEN p_operation.state='REJECTED' AND p_operation.result->>'state'='REJECTED'
    AND p_operation.authorized_xml IS NULL AND nullif(p_operation.dps_id,'') IS NOT NULL
    AND nullif(p_operation.signed_dps_xml,'') IS NOT NULL
    AND p_operation.result->>'dpsId'=p_operation.dps_id AND jsonb_typeof(p_operation.result->'codes')='array'
    THEN jsonb_array_length(p_operation.result->'codes') BETWEEN 1 AND 100 AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_operation.result->'codes') code
      WHERE jsonb_typeof(code)<>'string' OR (code#>>'{}') !~ '^[A-Z0-9_-]{1,32}$')
    ELSE false END,false)
$function$;
REVOKE ALL ON FUNCTION private.nfse_error_archivable(private.nfse_individual_operations) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.archive_nfse_errors_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
  p_request_id uuid,p_operation_ids uuid[],p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='15s' SET lock_timeout='5s' AS $function$
DECLARE v_actor uuid:=auth.uid();v_ids uuid[];v_payload jsonb;v_response jsonb;
  v_previous private.nfse_error_archive_requests%ROWTYPE;v_request uuid:=gen_random_uuid();v_count integer;v_changed integer;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'O arquivamento exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
  IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN('ARCHIVE','RESTORE')
    OR p_operation_ids IS NULL OR cardinality(p_operation_ids) NOT BETWEEN 1 AND 100
    OR array_ndims(p_operation_ids)<>1 OR array_position(p_operation_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Selecione de 1 a 100 rejeições definitivas.' USING ERRCODE='22023'; END IF;
  v_ids:=ARRAY(SELECT DISTINCT id FROM unnest(p_operation_ids) ids(id) ORDER BY 1);
  IF cardinality(v_ids)<>cardinality(p_operation_ids) THEN
    RAISE EXCEPTION 'A seleção contém operações repetidas.' USING ERRCODE='22023'; END IF;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'operationIds',to_jsonb(v_ids),'action',p_action);
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-error-archive:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_error_archive_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'A tentativa já foi usada com outra seleção ou ação.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  -- Same physical rows as CLAIM/FINISH: an uncertain or changed mixed batch fails atomically.
  PERFORM 1 FROM private.nfse_individual_operations WHERE id=ANY(v_ids) AND polo_id=p_polo_id
    AND environment=p_environment AND month=p_month ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_count FROM private.nfse_individual_operations o WHERE id=ANY(v_ids)
    AND polo_id=p_polo_id AND environment=p_environment AND month=p_month AND private.nfse_error_archivable(o)
    AND EXISTS(SELECT 1 FROM private.nfse_queue_operation_links WHERE operation_id=o.id);
  IF v_count<>cardinality(v_ids) THEN
    RAISE EXCEPTION 'A seleção mudou ou inclui estado fiscal não definitivo. Nenhuma operação foi arquivada.' USING ERRCODE='40001'; END IF;
  -- The audit row and its sanitized realtime hint commit atomically with the marks.
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('action',p_action,'operationIds',to_jsonb(v_ids),'changedCount',0));
  -- Compute the response before inserting the append-only audit record.
  SELECT count(*) INTO v_changed FROM private.nfse_individual_operations o LEFT JOIN private.nfse_error_archives a ON a.operation_id=o.id
    WHERE o.id=ANY(v_ids) AND ((p_action='ARCHIVE' AND a.archived_at IS NULL) OR (p_action='RESTORE' AND a.archived_at IS NOT NULL));
  v_response:=jsonb_set(v_response,'{data,changedCount}',to_jsonb(v_changed));
  INSERT INTO private.nfse_error_archive_requests(id,actor_id,request_id,polo_id,environment,queue_month,payload,response)
    VALUES(v_request,v_actor,p_request_id,p_polo_id,p_environment,p_month,v_payload,v_response);
  IF p_action='ARCHIVE' THEN
    INSERT INTO private.nfse_error_archives(operation_id,request_row_id,archived_at)
      SELECT unnest(v_ids),v_request,now()
    ON CONFLICT(operation_id) DO UPDATE SET request_row_id=EXCLUDED.request_row_id,archived_at=EXCLUDED.archived_at,updated_at=now()
      WHERE private.nfse_error_archives.archived_at IS NULL;
  ELSE
    UPDATE private.nfse_error_archives SET request_row_id=v_request,archived_at=NULL,updated_at=now()
      WHERE operation_id=ANY(v_ids) AND archived_at IS NOT NULL;
  END IF;
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.archive_nfse_errors_secure(uuid,uuid,text,text,uuid,uuid[],text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.archive_nfse_errors_secure(uuid,uuid,text,text,uuid,uuid[],text) TO authenticated;

ALTER FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text)
  RENAME TO get_nfse_documents_legacy_partition_20261111;
REVOKE ALL ON FUNCTION public.get_nfse_documents_legacy_partition_20261111(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_nfse_documents_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text,p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_date_from text DEFAULT NULL,p_date_to text DEFAULT NULL,
  p_course_type text DEFAULT NULL,p_origin text DEFAULT NULL,p_issued_state text DEFAULT NULL,p_error_archive_mode text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_data jsonb; v_from date; v_to date; v_type text:=nullif(btrim(p_course_type),'');
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_status IS NULL OR p_status NOT IN('PENDENTE','EMITIDA','ERRO') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(coalesce(p_search,''))>100
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
    WHERE v.polo_id=p_polo_id AND v.environment=p_environment AND v.month=p_month
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
    'courseTypes',coalesce((SELECT jsonb_agg(jsonb_build_object('value',course_type,'label',course_type_label)
      ORDER BY course_type_label,course_type) FROM(SELECT DISTINCT course_type,course_type_label FROM decorated
        WHERE course_type IS NOT NULL) types),'[]'::jsonb)) INTO v_data;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',v_data);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text,text,text) IS
  'Scoped documents with reversible error archive before filtering/pagination. Only definitive REJECTED results are eligible; fiscal records and source reservations are never deleted.';


CREATE OR REPLACE FUNCTION public.get_nfse_workspace_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_models jsonb;v_classes jsonb;v_pending integer;v_prepared numeric(30,2);v_issued integer;v_errors integer;v_configure boolean:=true;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  BEGIN PERFORM private.authorize_nfse_configuration_scope(p_context_key,p_polo_id,p_environment,p_month);
  EXCEPTION WHEN insufficient_privilege THEN v_configure:=false; END;
  SELECT coalesce(jsonb_agg(definition||jsonb_build_object('id',id,'version',version) ORDER BY lower(definition->>'name'),id),'[]') INTO v_models
    FROM private.nfse_models WHERE polo_id=p_polo_id AND environment=p_environment;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',class_id,'label',label) ORDER BY label,class_id),'[]') INTO v_classes
    FROM(SELECT DISTINCT class_id,snapshot#>>'{academic,classLabel}' label FROM private.nfse_queue_documents
      WHERE polo_id=p_polo_id AND environment=p_environment AND queue_month=p_month)t;
  SELECT count(*)::integer,coalesce(sum(amount),0) INTO v_pending,v_prepared FROM(
    SELECT q.amount FROM private.nfse_queue_documents q WHERE q.polo_id=p_polo_id AND q.environment=p_environment AND q.queue_month=p_month
      AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=q.id)
      AND NOT EXISTS(SELECT 1 FROM private.nfse_operation_source_projection WHERE source_kind='ACADEMIC_QUEUE' AND source_id=q.id
        AND issue_state IN('AUTHORIZED','REJECTED','BLOCKED'))
    UNION ALL SELECT s.amount FROM private.nfse_partner_services s WHERE s.polo_id=p_polo_id AND s.environment=p_environment
      AND left(s.service_date::text,7)=p_month AND NOT EXISTS(SELECT 1 FROM private.nfse_operation_source_projection
        WHERE source_kind='PARTNER_SERVICE' AND source_id=s.id AND issue_state IN('AUTHORIZED','REJECTED','BLOCKED')))t;
  SELECT count(*)FILTER(WHERE v.issue_state='AUTHORIZED' AND c.operation_id IS NULL)::integer,
    count(*)FILTER(WHERE v.issue_state IN('REJECTED','BLOCKED')
      AND (a.archived_at IS NULL OR NOT private.nfse_error_archivable(o)))::integer INTO v_issued,v_errors
    FROM private.nfse_operation_source_projection v JOIN private.nfse_individual_operations o ON o.id=v.operation_id
    LEFT JOIN private.nfse_confirmed_cancellations c ON c.operation_id=v.operation_id
    LEFT JOIN private.nfse_error_archives a ON a.operation_id=v.operation_id
    WHERE v.polo_id=p_polo_id AND v.environment=p_environment AND v.month=p_month;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',jsonb_build_object('models',v_models,'classes',v_classes,
    'capabilities',jsonb_build_object('prepare',true,'manageModels',true,'issue',false,'retry',false,'configure',v_configure),
    'readiness',jsonb_build_object('status','BLOCKED','message','A elegibilidade fiscal é verificada na revisão de cada preparação.'),
    'summary',jsonb_build_object('receivedAmount',NULL,'preparedAmount',v_prepared::text,'pendingCount',v_pending,'issuedCount',v_issued,'errorCount',v_errors)));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_workspace_secure(uuid,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
