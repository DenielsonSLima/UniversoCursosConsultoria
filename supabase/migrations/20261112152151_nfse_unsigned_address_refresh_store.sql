BEGIN;
-- Original queue links and fiscal reviews remain immutable. Each unsigned refresh is audited.
CREATE TABLE private.nfse_operation_address_revisions (
  operation_id uuid NOT NULL REFERENCES private.nfse_individual_operations(id),
  revision integer NOT NULL CHECK (revision>0), actor_id uuid NOT NULL,
  previous_basis jsonb NOT NULL, basis jsonb NOT NULL,
  previous_fingerprint text NOT NULL, basis_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(operation_id,revision)
);
ALTER TABLE private.nfse_operation_address_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_operation_address_revisions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_address_revision_immutable BEFORE UPDATE OR DELETE
 ON private.nfse_operation_address_revisions FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();

CREATE FUNCTION private.nfse_operation_effective_basis(p_operation_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT coalesce((SELECT jsonb_build_object('snapshot',r.basis,'fingerprint',r.basis_fingerprint)
 FROM private.nfse_operation_address_revisions r WHERE r.operation_id=p_operation_id ORDER BY revision DESC LIMIT 1),
 (SELECT jsonb_build_object('snapshot',l.basis,'fingerprint',l.basis_fingerprint)
 FROM private.nfse_queue_operation_links l WHERE l.operation_id=p_operation_id));
$function$;
REVOKE ALL ON FUNCTION private.nfse_operation_effective_basis(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_address_refresh_invariants(p_basis jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 SELECT p_basis #- '{recipient,address,number}' #- '{source,reviewId}' #- '{source,reviewRevision}'
   #- '{source,reviewBasis,token}' #- '{source,reviewBasis,basis,recipient,address,number}';
$function$;
REVOKE ALL ON FUNCTION private.nfse_address_refresh_invariants(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.refresh_nfse_unsigned_address(p_operation_id uuid) RETURNS private.nfse_individual_operations
LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_op private.nfse_individual_operations%ROWTYPE; v_link private.nfse_queue_operation_links%ROWTYPE;
 v_old jsonb; v_facts jsonb; v_cert private.nfse_certificates%ROWTYPE; v_revision integer;
BEGIN
 -- Caller already authorized actor/context/request and owns individual/source mutexes.
 SELECT * INTO STRICT v_op FROM private.nfse_individual_operations WHERE id=p_operation_id FOR UPDATE;
 IF v_op.state<>'PREVIEWED' THEN RETURN v_op; END IF;
 SELECT * INTO STRICT v_link FROM private.nfse_queue_operation_links WHERE operation_id=v_op.id;
 v_old:=private.nfse_operation_effective_basis(v_op.id);
 IF v_link.source_kind='ACADEMIC_QUEUE' THEN
   -- Unique internal review intent, never reuse the original preview's request id.
   -- The helper serializes review -> scope and locks partner/payment/config rows.
   IF v_op.signed_dps_xml IS NULL AND v_op.fiscal_input IS NULL AND v_op.dps_id IS NULL AND v_op.result IS NULL THEN
     PERFORM private.validate_nfse_queue_fiscal_review(v_op.actor_id,v_op.context_id,v_op.polo_id,
       v_op.environment,v_op.month,v_link.source_id,gen_random_uuid());
   END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('nfse-academic-scope:'||v_op.polo_id||':'||v_op.environment,0));
 ELSE
   PERFORM 1 FROM private.nfse_partner_services WHERE id=v_link.source_id FOR SHARE;
 END IF;
 PERFORM 1 FROM public.parceiros WHERE id=(v_op.command->>'partnerId')::uuid FOR SHARE;
 PERFORM 1 FROM private.nfse_configurations WHERE polo_id=v_op.polo_id AND environment=v_op.environment FOR SHARE;
 v_facts:=private.nfse_queue_operation_basis(v_link.source_kind,v_link.source_id,v_op.polo_id,v_op.environment,v_op.month);
 SELECT * INTO v_cert FROM private.resolve_nfse_production_certificate(v_op.polo_id,v_op.environment,
   regexp_replace(v_op.snapshot#>>'{issuer,cnpj}','[^0-9]','','g'));
 IF v_cert.fingerprint IS DISTINCT FROM v_op.certificate_fingerprint OR v_cert.not_before>now() OR v_cert.expires_at<=now() THEN
   RAISE EXCEPTION 'O certificado mudou. Confira a preparação.' USING ERRCODE='40001'; END IF;
 IF v_facts->>'fingerprint' IS DISTINCT FROM v_old->>'fingerprint' THEN
   IF v_op.signed_dps_xml IS NOT NULL OR v_op.fiscal_input IS NOT NULL OR v_op.dps_id IS NOT NULL OR v_op.result IS NOT NULL
      OR v_op.authorized_xml IS NOT NULL
      OR private.nfse_address_refresh_invariants(v_old->'snapshot') IS DISTINCT FROM
         private.nfse_address_refresh_invariants(v_facts->'snapshot') THEN
     RAISE EXCEPTION 'A origem fiscal mudou ou a DPS já foi preparada. Consulte a operação preservada.' USING ERRCODE='40001'; END IF;
   SELECT coalesce(max(revision),0)+1 INTO v_revision FROM private.nfse_operation_address_revisions WHERE operation_id=v_op.id;
   INSERT INTO private.nfse_operation_address_revisions(operation_id,revision,actor_id,previous_basis,basis,previous_fingerprint,basis_fingerprint)
   VALUES(v_op.id,v_revision,v_op.actor_id,v_old->'snapshot',v_facts->'snapshot',v_old->>'fingerprint',v_facts->>'fingerprint');
   UPDATE private.nfse_individual_operations SET snapshot=(v_facts->'snapshot')||jsonb_build_object('command',command)
     WHERE id=v_op.id RETURNING * INTO v_op;
 END IF;
 UPDATE private.nfse_individual_operations SET expires_at=now()+interval '15 minutes',updated_at=now()
 WHERE id=v_op.id RETURNING * INTO v_op;
 RETURN v_op;
END;
$function$;
REVOKE ALL ON FUNCTION private.refresh_nfse_unsigned_address(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
