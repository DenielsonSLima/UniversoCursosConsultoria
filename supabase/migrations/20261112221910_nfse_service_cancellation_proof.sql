BEGIN;
CREATE FUNCTION private.nfse_service_cancellation_proven(p_cancellation_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $function$
DECLARE c private.nfse_individual_cancellations%ROWTYPE; o private.nfse_individual_operations%ROWTYPE;
  x xml; v_id text; v_sequence text;
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
  IF NOT EXISTS(SELECT 1 FROM private.nfse_service_receivables l
    WHERE l.operation_id=o.id) OR o.snapshot#>>'{source,kind}' IS DISTINCT FROM 'PARTNER_SERVICE' THEN RETURN false; END IF;
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
REVOKE ALL ON FUNCTION private.nfse_service_cancellation_proven(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER nfse_service_receivable_cancel_enqueue AFTER INSERT OR UPDATE OF state
 ON private.nfse_individual_cancellations FOR EACH ROW WHEN(NEW.state='CANCELLED')
 EXECUTE FUNCTION private.enqueue_nfse_service_cancellation();
COMMIT;
