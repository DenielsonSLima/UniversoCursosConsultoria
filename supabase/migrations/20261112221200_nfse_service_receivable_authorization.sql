BEGIN;

CREATE FUNCTION private.nfse_service_authorized_metadata(p_xml text,p_snapshot jsonb,p_result jsonb,p_fallback text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE v_description text;v_number text;
BEGIN
  IF nullif(p_xml,'') IS NOT NULL THEN
    IF upper(p_xml) LIKE '%<!DOCTYPE%' OR upper(p_xml) LIKE '%<!ENTITY%' THEN
      RAISE EXCEPTION 'XML fiscal com declaração não permitida.' USING ERRCODE='22023'; END IF;
    SELECT description,number INTO v_description,v_number FROM XMLTABLE(
      XMLNAMESPACES('http://www.sped.fazenda.gov.br/nfse' AS n),'/n:NFSe/n:infNFSe'
      PASSING xmlparse(document p_xml) COLUMNS number text PATH 'n:nNFSe',
      description text PATH 'n:DPS/n:infDPS/n:serv/n:cServ/n:xDescServ') facts;
  END IF;
  RETURN jsonb_build_object('description',coalesce(nullif(v_description,''),
    p_snapshot#>>'{source,serviceDescription}',p_fallback),'number',coalesce(nullif(v_number,''),p_result->>'number'));
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_service_authorized_metadata(text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.ensure_nfse_service_receivable(p_operation_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE o private.nfse_individual_operations%ROWTYPE;s private.nfse_partner_services%ROWTYPE;
  p private.nfse_service_financial_plans%ROWTYPE;c public.contas_receber%ROWTYPE;
  v_source uuid;v_id uuid;v_first uuid;v_category uuid;v_preview jsonb;v_item jsonb;
  v_count integer;v_metadata jsonb;v_description text;v_number text;
BEGIN
  SELECT * INTO o FROM private.nfse_individual_operations WHERE id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR o.state<>'AUTHORIZED' OR o.environment<>'PRODUCAO'
    OR o.snapshot#>>'{source,kind}' IS DISTINCT FROM 'PARTNER_SERVICE' THEN RETURN NULL; END IF;
  SELECT receivable_id INTO v_id FROM private.nfse_service_receivables WHERE operation_id=o.id ORDER BY installment_number LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;
  v_source:=(o.snapshot#>>'{source,id}')::uuid;
  SELECT * INTO s FROM private.nfse_partner_services WHERE id=v_source AND polo_id=o.polo_id
    AND environment=o.environment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Origem financeira do serviço indisponível.' USING ERRCODE='23503'; END IF;
  SELECT receivable_id INTO v_id FROM private.nfse_service_receivables WHERE service_id=s.id ORDER BY installment_number LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;
  SELECT * INTO p FROM private.nfse_service_financial_plans WHERE service_id=s.id;
  IF NOT FOUND THEN
    SELECT default_category_id INTO STRICT v_category FROM private.nfse_service_financial_policy;
    INSERT INTO private.nfse_service_financial_plans(service_id,due_date,category_id,existing_receivable_id,rule)
      VALUES(s.id,s.service_date,v_category,s.receivable_id,'LEGACY_SERVICE_DATE') RETURNING * INTO p;
  END IF;
  v_metadata:=private.nfse_service_authorized_metadata(o.authorized_xml,o.snapshot,o.result,s.service_description);
  v_description:=v_metadata->>'description';v_number:=v_metadata->>'number';
  IF v_number IS NULL OR v_description IS NULL THEN
    RAISE EXCEPTION 'Descrição ou número fiscal autorizado ausente.' USING ERRCODE='22023'; END IF;
  v_id:=coalesce(s.receivable_id,p.existing_receivable_id);
  IF v_id IS NOT NULL THEN
    SELECT * INTO STRICT c FROM public.contas_receber WHERE id=v_id FOR UPDATE;
    IF (c.polo_id,c.cliente_id,c.valor) IS DISTINCT FROM (s.polo_id,s.partner_id,s.amount) THEN
      RAISE EXCEPTION 'Recebível vinculado diverge da origem fiscal.' USING ERRCODE='40001'; END IF;
    INSERT INTO private.nfse_service_receivables(service_id,operation_id,receivable_id,origin,fiscal_number,fiscal_description)
      VALUES(s.id,o.id,v_id,'LINKED',v_number,v_description);
    RETURN v_id;
  END IF;
  v_preview:=p.financial_preview;
  IF v_preview IS NULL THEN
    -- Legacy drafts had no interest/discount agreement. Preserve the recorded
    -- nominal amount and fallback due date without inventing commercial terms.
    v_preview:=jsonb_build_object('totalNominal',s.amount,'parcelas',jsonb_build_array(jsonb_build_object(
      'numero',1,'valor',s.amount,'dataVencimento',p.due_date,'financialTerms',jsonb_build_object(
        'nominalAmount',s.amount,'dueDate',p.due_date,'discount',NULL,'interest',NULL,'penalty',NULL))));
  END IF;
  v_count:=jsonb_array_length(v_preview->'parcelas');
  IF v_count NOT BETWEEN 1 AND 60 OR (v_preview->>'totalNominal')::numeric IS DISTINCT FROM s.amount THEN
    RAISE EXCEPTION 'Plano financeiro diverge do valor fiscal.' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_preview->'parcelas') ORDER BY (value->>'numero')::integer LOOP
    v_id:=gen_random_uuid();
    INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,
      categoria_financeira_id,tipo_lancamento,origem_pagamento,parcela_numero,gateway_financial_terms)
    VALUES(v_id,s.polo_id,s.partner_id,v_description||' · NFS-e '||v_number||
      CASE WHEN v_count>1 THEN ' · Parcela '||(v_item->>'numero')||'/'||v_count ELSE '' END,
      (v_item->>'valor')::numeric,(v_item->>'dataVencimento')::date,'PENDENTE','OUTROS_CREDITOS',
      p.category_id,'OUTRO_CREDITO','LOCAL',(v_item->>'numero')::integer,v_item->'financialTerms');
    INSERT INTO private.nfse_service_receivables(service_id,installment_number,installment_count,operation_id,
      receivable_id,origin,fiscal_number,fiscal_description)
    VALUES(s.id,(v_item->>'numero')::integer,v_count,o.id,v_id,'CREATED',v_number,v_description);
    v_first:=coalesce(v_first,v_id);
  END LOOP;
  UPDATE private.nfse_partner_services SET receivable_id=v_first,receivable_action='CREATED' WHERE id=s.id;
  RETURN v_first;
END;
$function$;
REVOKE ALL ON FUNCTION private.ensure_nfse_service_receivable(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.sync_nfse_service_financial_authorization() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF TG_OP='INSERT' OR OLD.state IS DISTINCT FROM 'AUTHORIZED' THEN
    PERFORM private.ensure_nfse_service_receivable(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER nfse_service_financial_authorized AFTER INSERT OR UPDATE OF state
  ON private.nfse_individual_operations FOR EACH ROW WHEN (NEW.state='AUTHORIZED')
  EXECUTE FUNCTION private.sync_nfse_service_financial_authorization();
REVOKE ALL ON FUNCTION private.sync_nfse_service_financial_authorization() FROM PUBLIC,anon,authenticated,service_role;

-- Historical authorized operations only reclassify an already linked title.
-- An authorized historical service with no title never invents a debt here.
INSERT INTO private.nfse_service_receivables(service_id,operation_id,receivable_id,origin,fiscal_number,fiscal_description,fiscal_cancelled_at)
SELECT s.id,o.id,c.id,'HISTORICAL',facts.value->>'number',facts.value->>'description',(
  SELECT max(cancel.updated_at) FROM private.nfse_individual_cancellations cancel
    WHERE cancel.operation_id=o.id AND cancel.state='CANCELLED')
FROM private.nfse_partner_services s
JOIN private.nfse_queue_operation_links l ON l.source_kind='PARTNER_SERVICE' AND l.source_id=s.id
JOIN private.nfse_individual_operations o ON o.id=l.operation_id AND o.state='AUTHORIZED' AND o.environment='PRODUCAO'
JOIN public.contas_receber c ON c.id=s.receivable_id AND c.polo_id=s.polo_id
  AND c.cliente_id=s.partner_id AND c.valor=s.amount
CROSS JOIN LATERAL (SELECT private.nfse_service_authorized_metadata(o.authorized_xml,o.snapshot,o.result,s.service_description) value) facts
ON CONFLICT DO NOTHING;

CREATE FUNCTION private.sync_nfse_service_financial_cancellation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  UPDATE private.nfse_service_receivables SET fiscal_cancelled_at=coalesce(fiscal_cancelled_at,NEW.updated_at,now())
    WHERE operation_id=NEW.operation_id;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER nfse_service_financial_cancelled AFTER INSERT OR UPDATE OF state
  ON private.nfse_individual_cancellations FOR EACH ROW WHEN (NEW.state='CANCELLED')
  EXECUTE FUNCTION private.sync_nfse_service_financial_cancellation();
REVOKE ALL ON FUNCTION private.sync_nfse_service_financial_cancellation() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
