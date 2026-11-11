BEGIN;

-- Authoritative fiscal timestamp only. Malformed/missing historical XML is
-- explicitly unknown; preparation/ledger timestamps never replace dhProc.
CREATE FUNCTION private.nfse_authorized_xml_emitted_at(p_xml text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $function$
DECLARE v_values xml[]; v_value text;
BEGIN
  IF octet_length(p_xml)>4500000 OR strpos(upper(p_xml),'<!DOCTYPE')>0
    OR strpos(upper(p_xml),'<!ENTITY')>0 THEN RETURN NULL; END IF;
  v_values:=xpath('/nf:NFSe/nf:infNFSe/nf:dhProc/text()',xmlparse(DOCUMENT p_xml),
    ARRAY[ARRAY['nf','http://www.sped.fazenda.gov.br/nfse']]);
  IF coalesce(array_length(v_values,1),0)<>1 THEN RETURN NULL; END IF;
  v_value:=v_values[1]::text;
  IF v_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN NULL; END IF;
  RETURN v_value::timestamptz;
EXCEPTION WHEN invalid_xml_document OR invalid_xml_content OR invalid_datetime_format OR datetime_field_overflow THEN
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_authorized_xml_emitted_at(text) FROM PUBLIC,anon,authenticated,service_role;

-- One exposed overload prevents PostgREST ambiguity. Existing eight-argument
-- calls resolve to the twelve-argument function through the final defaults.
ALTER FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer)
  RENAME TO get_nfse_documents_legacy_20261111;
REVOKE ALL ON FUNCTION public.get_nfse_documents_legacy_20261111(uuid,uuid,text,text,text,text,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_nfse_documents_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_status text,p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_date_from text DEFAULT NULL,p_date_to text DEFAULT NULL,
  p_course_type text DEFAULT NULL,p_origin text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $function$
DECLARE v_data jsonb; v_from date; v_to date; v_type text:=nullif(btrim(p_course_type),'');
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF p_status IS NULL OR p_status NOT IN('PENDENTE','EMITIDA','ERRO') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(coalesce(p_search,''))>100
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
    SELECT v.*,o.authorized_xml,
      CASE v.source_kind WHEN 'ACADEMIC_QUEUE' THEN 'ALUNO' WHEN 'PARTNER_SERVICE' THEN 'SERVICO' END origin,
      CASE WHEN v.source_kind='ACADEMIC_QUEUE' THEN coalesce(
        nullif(btrim(v.snapshot#>>'{source,preparation,snapshot,academic,courseType}'),''),
        nullif(btrim(v.snapshot#>>'{source,preparation,snapshot,academic,descriptionContext,courseType}'),'')) END course_type
    FROM private.nfse_operation_source_projection v JOIN private.nfse_individual_operations o ON o.id=v.operation_id
    WHERE v.polo_id=p_polo_id AND v.environment=p_environment AND v.month=p_month
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
    'origin',v.origin,'courseType',v.course_type,'courseTypeLabel',v.course_type_label)
      ||private.nfse_operation_fields(v.source_kind,v.source_id)
    ORDER BY v.emitted_at DESC NULLS LAST,v.created_at DESC,v.operation_id) FROM paged v),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,'totalItems',(SELECT count(*)::integer FROM filtered),
    'courseTypes',coalesce((SELECT jsonb_agg(jsonb_build_object('value',course_type,'label',course_type_label)
      ORDER BY course_type_label,course_type) FROM(SELECT DISTINCT course_type,course_type_label FROM decorated
        WHERE course_type IS NOT NULL) types),'[]'::jsonb)) INTO v_data;
  RETURN jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,
    'environment',p_environment,'month',p_month),'data',v_data);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text) IS
  'Scoped fiscal list. Original NFSe dhProc, immutable academic modality and explicit source kind; filters precede pagination. Never modifies fiscal/financial records.';
NOTIFY pgrst,'reload schema';
COMMIT;
