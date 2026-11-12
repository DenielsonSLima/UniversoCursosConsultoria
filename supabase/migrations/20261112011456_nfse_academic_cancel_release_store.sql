BEGIN;

-- Release eligibility, never a financial reversal or deletion of the original claim.
CREATE TABLE private.nfse_academic_cancellation_releases (
  document_id uuid PRIMARY KEY REFERENCES private.nfse_queue_documents(id),
  operation_id uuid NOT NULL UNIQUE REFERENCES private.nfse_individual_operations(id),
  cancellation_id uuid NOT NULL UNIQUE REFERENCES private.nfse_individual_cancellations(id),
  polo_id uuid NOT NULL, environment text NOT NULL CHECK(environment IN ('HOMOLOGACAO','PRODUCAO')),
  queue_month text NOT NULL, payment_month text NOT NULL,
  event_id text NOT NULL, event_xml_sha256 text NOT NULL CHECK(event_xml_sha256 ~ '^[a-f0-9]{64}$'),
  released_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.nfse_academic_cancellation_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_academic_cancellation_releases FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_academic_release_immutable BEFORE UPDATE OR DELETE
  ON private.nfse_academic_cancellation_releases FOR EACH ROW
  EXECUTE FUNCTION private.reject_nfse_preparation_change();

CREATE FUNCTION private.nfse_academic_cancel_release_proven(p_cancellation_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE c private.nfse_individual_cancellations%ROWTYPE; o private.nfse_individual_operations%ROWTYPE;
  q private.nfse_queue_documents%ROWTYPE; x xml; v_id text; v_sequence text;
  ns text[] := ARRAY[ARRAY['n','http://www.sped.fazenda.gov.br/nfse'],ARRAY['ds','http://www.w3.org/2000/09/xmldsig#']];
BEGIN
  SELECT * INTO c FROM private.nfse_individual_cancellations WHERE id=p_cancellation_id;
  IF NOT FOUND OR c.state IS DISTINCT FROM 'CANCELLED' OR c.result->>'state' IS DISTINCT FROM 'CANCELLED'
    OR c.result->>'code' IS DISTINCT FROM 'CONFIRMED'
    OR c.result->>'eventCode' IS DISTINCT FROM '101101' OR c.result->>'accessKey' IS DISTINCT FROM c.access_key
    OR c.event_input->>'eventCode' IS DISTINCT FROM '101101'
    OR c.event_input->>'accessKey' IS DISTINCT FROM c.access_key
    OR c.event_reference_id IS DISTINCT FROM 'PRE'||c.access_key||'101101'
    OR nullif(c.signed_event_xml,'') IS NULL OR nullif(c.event_xml,'') IS NULL
    OR octet_length(c.event_xml)>4500000 OR upper(c.event_xml) LIKE '%<!DOCTYPE%'
    OR upper(c.event_xml) LIKE '%<!ENTITY%' THEN RETURN false; END IF;
  SELECT * INTO o FROM private.nfse_individual_operations WHERE id=c.operation_id;
  IF NOT FOUND OR o.state IS DISTINCT FROM 'AUTHORIZED' OR nullif(o.authorized_xml,'') IS NULL
    OR o.result->>'accessKey' IS DISTINCT FROM c.access_key
    OR c.event_input->>'environment' IS DISTINCT FROM o.environment THEN RETURN false; END IF;
  SELECT d.* INTO q FROM private.nfse_queue_operation_links l
    JOIN private.nfse_queue_documents d ON d.id=l.source_id
    WHERE l.operation_id=o.id AND l.source_kind='ACADEMIC_QUEUE';
  IF NOT FOUND OR q.polo_id IS DISTINCT FROM o.polo_id OR q.environment IS DISTINCT FROM o.environment
    OR q.queue_month IS DISTINCT FROM o.month THEN RETURN false; END IF;
  BEGIN x:=xmlparse(document c.event_xml);
  EXCEPTION WHEN invalid_xml_document OR invalid_xml_content THEN RETURN false; END;
  IF cardinality(xpath('/n:evento/n:infEvento',x,ns))<>1 THEN RETURN false; END IF;
  v_id:=(xpath('/n:evento/n:infEvento/@Id',x,ns))[1]::text;
  v_sequence:=(xpath('/n:evento/n:infEvento/n:nSeqEvento/text()',x,ns))[1]::text;
  IF v_sequence IS NULL OR v_sequence !~ '^[0-9]{1,3}$' THEN RETURN false; END IF;
  RETURN coalesce(v_id=c.result->>'eventId'
    AND v_sequence::integer BETWEEN 1 AND 999
    AND (xpath('/n:evento/@versao',x,ns))[1]::text='1.01'
    AND v_id='EVT'||c.access_key||'101101'||lpad(v_sequence::integer::text,3,'0')
    AND (xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/@Id',x,ns))[1]::text=c.event_reference_id
    AND (xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:chNFSe/text()',x,ns))[1]::text=c.access_key
    AND (xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:tpAmb/text()',x,ns))[1]::text=
      CASE o.environment WHEN 'PRODUCAO' THEN '1' ELSE '2' END
    AND cardinality(xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:e101101',x,ns))=1
    AND cardinality(xpath('/n:evento/ds:Signature',x,ns))=1,false);
END;
$function$;
REVOKE ALL ON FUNCTION private.nfse_academic_cancel_release_proven(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.guard_nfse_academic_cancellation_release()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE q private.nfse_queue_documents%ROWTYPE; c private.nfse_individual_cancellations%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed'
    OR NOT private.nfse_academic_cancel_release_proven(NEW.cancellation_id) THEN
    RAISE EXCEPTION 'A liberação exige cancelamento fiscal comprovado.' USING ERRCODE='55000'; END IF;
  SELECT * INTO STRICT q FROM private.nfse_queue_documents WHERE id=NEW.document_id;
  SELECT * INTO STRICT c FROM private.nfse_individual_cancellations WHERE id=NEW.cancellation_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||q.polo_id||':'||q.environment,0));
  IF NOT EXISTS(SELECT 1 FROM private.nfse_queue_operation_links WHERE source_kind='ACADEMIC_QUEUE'
    AND source_id=q.id AND operation_id=c.operation_id)
    OR NEW.operation_id IS DISTINCT FROM c.operation_id OR NEW.polo_id IS DISTINCT FROM q.polo_id
    OR NEW.environment IS DISTINCT FROM q.environment OR NEW.queue_month IS DISTINCT FROM q.queue_month
    OR NEW.payment_month IS DISTINCT FROM q.payment_month OR NEW.event_id IS DISTINCT FROM c.result->>'eventId'
    OR NEW.event_xml_sha256 IS DISTINCT FROM encode(sha256(convert_to(c.event_xml,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Liberação fora da origem fiscal comprovada.' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_nfse_academic_cancellation_release() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_academic_release_proof BEFORE INSERT ON private.nfse_academic_cancellation_releases
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_academic_cancellation_release();

CREATE FUNCTION private.release_nfse_academic_cancelled_receipts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF private.nfse_academic_cancel_release_proven(NEW.id) THEN
    INSERT INTO private.nfse_academic_cancellation_releases(document_id,operation_id,cancellation_id,
      polo_id,environment,queue_month,payment_month,event_id,event_xml_sha256)
    SELECT q.id,NEW.operation_id,NEW.id,q.polo_id,q.environment,q.queue_month,q.payment_month,
      NEW.result->>'eventId',encode(sha256(convert_to(NEW.event_xml,'UTF8')),'hex')
    FROM private.nfse_queue_operation_links l JOIN private.nfse_queue_documents q ON q.id=l.source_id
    WHERE l.operation_id=NEW.operation_id AND l.source_kind='ACADEMIC_QUEUE'
    ON CONFLICT(document_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.release_nfse_academic_cancelled_receipts() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_academic_cancelled_release AFTER INSERT OR UPDATE OF state,result,event_xml
  ON private.nfse_individual_cancellations FOR EACH ROW WHEN(NEW.state='CANCELLED')
  EXECUTE FUNCTION private.release_nfse_academic_cancelled_receipts();

-- Existing confirmed cancellations are eligible under the same proof, without
-- changing their operations/events. Future cancellations use the existing queue hint.
WITH released AS (
  INSERT INTO private.nfse_academic_cancellation_releases(document_id,operation_id,cancellation_id,
    polo_id,environment,queue_month,payment_month,event_id,event_xml_sha256)
  SELECT q.id,c.operation_id,c.id,q.polo_id,q.environment,q.queue_month,q.payment_month,
    c.result->>'eventId',encode(sha256(convert_to(c.event_xml,'UTF8')),'hex')
  FROM private.nfse_individual_cancellations c
  JOIN private.nfse_queue_operation_links l ON l.operation_id=c.operation_id AND l.source_kind='ACADEMIC_QUEUE'
  JOIN private.nfse_queue_documents q ON q.id=l.source_id
  WHERE private.nfse_academic_cancel_release_proven(c.id)
  ON CONFLICT(document_id) DO NOTHING RETURNING polo_id,environment,queue_month
)
INSERT INTO public.nfse_queue_change_events(polo_id,environment,month)
  SELECT DISTINCT polo_id,environment,queue_month FROM released;

CREATE FUNCTION private.nfse_academic_receipt_claim_active(p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT NOT EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=p_document_id)
    AND NOT EXISTS(SELECT 1 FROM private.nfse_academic_cancellation_releases WHERE document_id=p_document_id);
$function$;
REVOKE ALL ON FUNCTION private.nfse_academic_receipt_claim_active(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
