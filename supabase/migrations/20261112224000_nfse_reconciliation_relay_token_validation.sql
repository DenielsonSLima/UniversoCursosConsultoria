BEGIN;
-- PostgreSQL regular-expression repetition counts stop at 255. Keep the same
-- token bounds with a separate length check so protected relay material resolves.
CREATE OR REPLACE FUNCTION public.get_nfse_reconciliation_material_internal(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE j private.nfse_reconciliation_jobs%ROWTYPE; o private.nfse_individual_operations%ROWTYPE;
 c private.nfse_individual_cancellations%ROWTYPE; cert private.nfse_certificates%ROWTYPE;
 material jsonb; relay jsonb; issuer text; payload jsonb;
BEGIN
 j:=private.require_nfse_reconciliation_lease(p_job_id,p_lease_token);
 SELECT * INTO STRICT o FROM private.nfse_individual_operations WHERE id=j.operation_id FOR SHARE;
 IF (j.target_kind='ISSUE' AND j.target_id<>o.id) OR o.environment<>'PRODUCAO'
   OR o.fiscal_input IS NULL OR nullif(o.signed_dps_xml,'') IS NULL OR o.dps_id IS NULL THEN
   RAISE EXCEPTION 'Submitted fiscal identity required.' USING ERRCODE='42501'; END IF;
 issuer:=regexp_replace(o.snapshot#>>'{issuer,cnpj}','[^0-9]','','g');
 SELECT * INTO cert FROM private.resolve_nfse_production_certificate(o.polo_id,o.environment,issuer);
 SELECT decrypted_secret::jsonb INTO material FROM vault.decrypted_secrets WHERE id=cert.vault_secret_id;
 IF material IS NULL OR jsonb_typeof(material)<>'object' OR octet_length(material::text)>180000
  OR coalesce(material->>'privateKeyPem','') NOT LIKE '%-----BEGIN RSA PRIVATE KEY-----%'
  OR coalesce(material->>'certificatePem','') NOT LIKE '%-----BEGIN CERTIFICATE-----%'
  OR jsonb_typeof(material->'chainPem') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'Scoped credential unavailable.' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='nfse_production_relay_config')<>1 THEN
  RAISE EXCEPTION 'Scoped transport unavailable.' USING ERRCODE='42501'; END IF;
 SELECT decrypted_secret::jsonb INTO relay FROM vault.decrypted_secrets WHERE name='nfse_production_relay_config';
 IF relay IS NULL OR jsonb_typeof(relay)<>'object' OR octet_length(relay::text)>12000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(relay) k WHERE k NOT IN('url','key','protectionBypass'))
  OR coalesce(relay->>'url','') NOT IN(
   'https://universo-cursos-consultoria-6w67gc985-denielson-limas-projects.vercel.app/api/nfse-production-relay',
   'https://universo-cursos-consultoria-qsnk8l1zn-denielson-limas-projects.vercel.app/api/nfse-production-relay')
  OR coalesce(relay->>'key','') !~ '^([0-9a-fA-F]{2}){32,64}$'
  OR (relay ? 'protectionBypass' AND (length(coalesce(relay->>'protectionBypass','')) NOT BETWEEN 1 AND 4096
    OR coalesce(relay->>'protectionBypass','') !~ '^[A-Za-z0-9_.-]+$')) THEN
  RAISE EXCEPTION 'Scoped transport unavailable.' USING ERRCODE='42501'; END IF;
 payload:=jsonb_build_object('targetKind',j.target_kind,'issuerCnpj',issuer,
  'operation',jsonb_build_object('input',o.fiscal_input,'dpsId',o.dps_id,'signedDpsXml',o.signed_dps_xml),
  'credential',jsonb_build_object('certificatePem',material->>'certificatePem','chainPem',material->>'chainPem','privateKeyPem',material->>'privateKeyPem'),
  'relay',relay);
 IF j.target_kind='CANCEL' THEN
  SELECT * INTO STRICT c FROM private.nfse_individual_cancellations WHERE id=j.target_id AND operation_id=o.id FOR SHARE;
  IF c.event_input IS NULL OR c.signed_event_xml IS NULL OR c.access_key IS DISTINCT FROM o.result->>'accessKey'
   OR o.state<>'AUTHORIZED' OR o.authorized_xml IS NULL THEN RAISE EXCEPTION 'Owned event required.' USING ERRCODE='42501'; END IF;
  payload:=payload||jsonb_build_object('cancellation',jsonb_build_object('input',c.event_input,
    'eventReferenceId',c.event_reference_id,'signedEventXml',c.signed_event_xml));
 END IF;
 -- The lease is checked again after credential lookup. No owner/session identity is ever borrowed.
 PERFORM private.require_nfse_reconciliation_lease(p_job_id,p_lease_token);
 RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.get_nfse_reconciliation_material_internal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_nfse_reconciliation_material_internal(uuid,uuid) TO service_role;
COMMIT;
