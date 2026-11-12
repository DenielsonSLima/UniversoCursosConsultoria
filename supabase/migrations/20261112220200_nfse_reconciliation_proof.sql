BEGIN;
-- Dedicated background executor: accepts only terminal proof for an already-submitted leased target.
-- It does not allocate identities, sign, dispatch, prepare, or borrow any user's session.
CREATE FUNCTION public.complete_nfse_reconciliation_proof_internal(p_job_id uuid,p_lease_token uuid,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE j private.nfse_reconciliation_jobs%ROWTYPE; o private.nfse_individual_operations%ROWTYPE;
 c private.nfse_individual_cancellations%ROWTYPE; x xml; v_xml text; v_id text; v_key text;
 ns text[]:=ARRAY[ARRAY['n','http://www.sped.fazenda.gov.br/nfse'],ARRAY['ds','http://www.w3.org/2000/09/xmldsig#']];
BEGIN
 j:=private.require_nfse_reconciliation_lease(p_job_id,p_lease_token);
 -- Follow existing fiscal-update -> queue-trigger lock order, never queue -> fiscal.
 SELECT * INTO STRICT o FROM private.nfse_individual_operations WHERE id=j.operation_id FOR UPDATE;
 IF j.target_kind='CANCEL' THEN
  SELECT * INTO STRICT c FROM private.nfse_individual_cancellations WHERE id=j.target_id AND operation_id=o.id FOR UPDATE;
 END IF;
 SELECT * INTO j FROM private.nfse_reconciliation_jobs WHERE id=p_job_id FOR UPDATE;
 PERFORM private.require_nfse_reconciliation_lease(p_job_id,p_lease_token);
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>4500000
  OR o.environment<>'PRODUCAO' THEN RAISE EXCEPTION 'Invalid fiscal proof.' USING ERRCODE='22023'; END IF;
 IF j.target_kind='ISSUE' THEN
  IF j.target_id<>o.id OR o.state NOT IN('PROCESSING','AWAITING_CONFIRMATION')
   OR p_result->>'state' IS DISTINCT FROM 'AUTHORIZED' OR p_result->>'dpsId' IS DISTINCT FROM o.dps_id
   OR nullif(o.signed_dps_xml,'') IS NULL THEN RAISE EXCEPTION 'Invalid authorization transition.' USING ERRCODE='42501'; END IF;
  v_xml:=p_result->>'authorizedXml';v_key:=p_result->>'accessKey';
  IF coalesce(v_key,'') !~ '^[0-9]{50}$' OR substring(v_key from 9 for 1)<>'2'
    OR substring(v_key from 10 for 14) IS DISTINCT FROM regexp_replace(o.snapshot#>>'{issuer,cnpj}','[^0-9]','','g')
    OR coalesce(p_result->>'number','') !~ '^[0-9]+$'
    OR nullif(v_xml,'') IS NULL OR upper(v_xml) LIKE '%<!DOCTYPE%' OR upper(v_xml) LIKE '%<!ENTITY%' THEN
    RAISE EXCEPTION 'Missing authorization proof.' USING ERRCODE='22023'; END IF;
  x:=xmlparse(document v_xml);
  IF cardinality(xpath('/n:NFSe/n:infNFSe',x,ns))<>1
   OR (xpath('/n:NFSe/n:infNFSe/@Id',x,ns))[1]::text IS DISTINCT FROM 'NFS'||v_key
   OR (xpath('/n:NFSe/n:infNFSe/n:DPS/n:infDPS/@Id',x,ns))[1]::text IS DISTINCT FROM o.dps_id
   OR (xpath('/n:NFSe/n:infNFSe/n:nNFSe/text()',x,ns))[1]::text IS DISTINCT FROM p_result->>'number'
   OR (xpath('/n:NFSe/n:infNFSe/n:DPS/n:infDPS/n:tpAmb/text()',x,ns))[1]::text IS DISTINCT FROM '1'
   OR cardinality(xpath('/n:NFSe/ds:Signature',x,ns))<>1 THEN
   RAISE EXCEPTION 'Authorization identity mismatch.' USING ERRCODE='22023'; END IF;
  UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml=v_xml,
   result=(p_result-'authorizedXml'-'signedDpsXml')||jsonb_build_object('message','NFS-e autorizada em produção.'),updated_at=now()
   WHERE id=o.id;
 ELSE
  IF c.state NOT IN('PROCESSING','CANCELLATION_PENDING','AWAITING_ANALYSIS')
   OR p_result->>'state' IS DISTINCT FROM 'CONFIRMED' OR p_result->>'cancellationState' IS DISTINCT FROM 'CANCELLED'
   OR p_result->>'code' IS DISTINCT FROM 'CONFIRMED' OR p_result->>'accessKey' IS DISTINCT FROM c.access_key
   OR p_result->>'eventCode' IS DISTINCT FROM '101101' OR o.state<>'AUTHORIZED'
   OR o.result->>'accessKey' IS DISTINCT FROM c.access_key OR nullif(o.authorized_xml,'') IS NULL
   OR nullif(c.signed_event_xml,'') IS NULL THEN RAISE EXCEPTION 'Invalid cancellation transition.' USING ERRCODE='42501'; END IF;
  v_xml:=p_result->>'eventXml';v_id:=p_result->>'eventId';v_key:=c.access_key;
  IF coalesce(v_id,'') !~ ('^EVT'||v_key||'101101[0-9]{3}$') OR nullif(v_xml,'') IS NULL
   OR upper(v_xml) LIKE '%<!DOCTYPE%' OR upper(v_xml) LIKE '%<!ENTITY%' THEN
   RAISE EXCEPTION 'Missing event proof.' USING ERRCODE='22023'; END IF;
  x:=xmlparse(document v_xml);
  IF cardinality(xpath('/n:evento/n:infEvento',x,ns))<>1
   OR (xpath('/n:evento/n:infEvento/@Id',x,ns))[1]::text IS DISTINCT FROM v_id
   OR (xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/@Id',x,ns))[1]::text IS DISTINCT FROM c.event_reference_id
   OR (xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:chNFSe/text()',x,ns))[1]::text IS DISTINCT FROM v_key
   OR (xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:tpAmb/text()',x,ns))[1]::text IS DISTINCT FROM '1'
   OR cardinality(xpath('/n:evento/n:infEvento/n:pedRegEvento/n:infPedReg/n:e101101',x,ns))<>1
   OR cardinality(xpath('/n:evento/ds:Signature',x,ns))<>1 THEN
   RAISE EXCEPTION 'Event identity mismatch.' USING ERRCODE='22023'; END IF;
  UPDATE private.nfse_individual_cancellations SET state='CANCELLED',event_xml=v_xml,
   result=(p_result-'eventXml'-'signedEventXml')||jsonb_build_object('state','CANCELLED','message','Cancelamento confirmado.'),updated_at=now()
   WHERE id=c.id;
 END IF;
 -- Fiscal triggers stop the job and notify existing scoped Realtime channels.
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_nfse_reconciliation_proof_internal(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_nfse_reconciliation_proof_internal(uuid,uuid,jsonb) TO service_role;
COMMIT;
