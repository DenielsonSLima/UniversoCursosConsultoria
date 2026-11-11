BEGIN;

-- Append-only removal marks preserve preparations, fiscal evidence and receivables.
CREATE TABLE private.nfse_partner_service_removal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, request_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id), environment text NOT NULL,
  payload jsonb NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_id), CHECK(environment IN('PRODUCAO','HOMOLOGACAO'))
);
CREATE TABLE private.nfse_partner_service_removals (
  service_id uuid PRIMARY KEY REFERENCES private.nfse_partner_services(id),
  removal_id uuid NOT NULL REFERENCES private.nfse_partner_service_removal_requests(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.nfse_partner_service_removal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_partner_service_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_partner_service_removal_requests,private.nfse_partner_service_removals
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_service_removal_request_immutable BEFORE UPDATE OR DELETE ON private.nfse_partner_service_removal_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_service_removal_immutable BEFORE UPDATE OR DELETE ON private.nfse_partner_service_removals
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();

CREATE FUNCTION private.nfse_partner_service_removable(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT EXISTS(SELECT 1 FROM private.nfse_partner_services s WHERE s.id=p_id AND s.status='PREPARADO'
    AND NOT EXISTS(SELECT 1 FROM private.nfse_partner_service_removals r WHERE r.service_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_operation_links l
      LEFT JOIN private.nfse_individual_operations o ON o.id=l.operation_id
      WHERE l.source_kind='PARTNER_SERVICE' AND l.source_id=s.id
        AND (o.id IS NULL OR NOT private.nfse_error_archivable(o)
          OR EXISTS(SELECT 1 FROM private.nfse_individual_cancellations c WHERE c.operation_id=o.id))))
$function$;
REVOKE ALL ON FUNCTION private.nfse_partner_service_removable(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Preview linking and removal take the same source row lock. A stale preview
-- cannot become an emission origin after the service has been removed.
CREATE FUNCTION private.guard_nfse_removed_service_link() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF NEW.source_kind='PARTNER_SERVICE' THEN
    IF current_setting('transaction_isolation')<>'read committed' THEN
      RAISE EXCEPTION 'A origem exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
    PERFORM 1 FROM private.nfse_partner_services WHERE id=NEW.source_id FOR SHARE;
    IF NOT FOUND OR EXISTS(SELECT 1 FROM private.nfse_partner_service_removals WHERE service_id=NEW.source_id) THEN
      RAISE EXCEPTION 'O serviço foi excluído da lista. Atualize a preparação.' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_nfse_removed_service_link() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_removed_service_link_guard BEFORE INSERT ON private.nfse_queue_operation_links
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_removed_service_link();

CREATE FUNCTION public.remove_nfse_partner_services_secure(
  p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,p_request_id uuid,p_service_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET statement_timeout='15s' SET lock_timeout='5s' AS $function$
DECLARE v_actor uuid:=auth.uid();v_ids uuid[];v_payload jsonb;v_response jsonb;v_count integer;
  v_request uuid:=gen_random_uuid();v_previous private.nfse_partner_service_removal_requests%ROWTYPE;
BEGIN
  PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'A exclusão exige READ COMMITTED.' USING ERRCODE='25001'; END IF;
  IF p_request_id IS NULL OR p_service_ids IS NULL OR cardinality(p_service_ids) NOT BETWEEN 1 AND 100
    OR array_ndims(p_service_ids)<>1 OR array_position(p_service_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Selecione de 1 a 100 serviços.' USING ERRCODE='22023'; END IF;
  v_ids:=ARRAY(SELECT DISTINCT id FROM unnest(p_service_ids) ids(id) ORDER BY 1);
  IF cardinality(v_ids)<>cardinality(p_service_ids) THEN
    RAISE EXCEPTION 'A seleção contém serviços repetidos.' USING ERRCODE='22023'; END IF;
  v_payload:=jsonb_build_object('contextKey',p_context_key,'poloId',p_polo_id,'environment',p_environment,
    'month',p_month,'serviceIds',to_jsonb(v_ids));
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-service-remove:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_previous FROM private.nfse_partner_service_removal_requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'A tentativa já foi usada com outra seleção.' USING ERRCODE='22023'; END IF;
    RETURN v_previous.response;
  END IF;
  -- Match CLAIM's operation-before-source order. The source lock also fences new links.
  PERFORM 1 FROM private.nfse_individual_operations o WHERE EXISTS(
    SELECT 1 FROM private.nfse_queue_operation_links l WHERE l.operation_id=o.id
      AND l.source_kind='PARTNER_SERVICE' AND l.source_id=ANY(v_ids)) ORDER BY o.id FOR UPDATE;
  PERFORM 1 FROM private.nfse_partner_services WHERE id=ANY(v_ids) AND polo_id=p_polo_id
    AND environment=p_environment ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_count FROM private.nfse_partner_services s WHERE s.id=ANY(v_ids)
    AND s.polo_id=p_polo_id AND s.environment=p_environment AND private.nfse_partner_service_removable(s.id);
  IF v_count<>cardinality(v_ids) THEN
    RAISE EXCEPTION 'A seleção mudou ou inclui nota emitida, cancelada ou sem rejeição definitiva. Nenhum serviço foi excluído.' USING ERRCODE='40001'; END IF;
  v_response:=jsonb_build_object('version',1,'scope',jsonb_build_object('contextKey',p_context_key,
    'poloId',p_polo_id,'environment',p_environment,'month',p_month),'data',jsonb_build_object(
      'id',v_request,'serviceIds',to_jsonb(v_ids),'removedCount',v_count,
      'message','Serviços excluídos da lista. Histórico fiscal, contas a receber e recebimentos preservados.'));
  INSERT INTO private.nfse_partner_service_removal_requests(id,actor_id,request_id,polo_id,environment,payload,response)
    VALUES(v_request,v_actor,p_request_id,p_polo_id,p_environment,v_payload,v_response);
  INSERT INTO private.nfse_partner_service_removals(service_id,removal_id) SELECT unnest(v_ids),v_request;
  INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
    SELECT DISTINCT s.polo_id,s.environment,to_char(s.service_date,'YYYY-MM'),'services'
    FROM private.nfse_partner_services s WHERE s.id=ANY(v_ids);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_nfse_partner_services_secure(uuid,uuid,text,text,uuid,uuid[])
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_nfse_partner_services_secure(uuid,uuid,text,text,uuid,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
