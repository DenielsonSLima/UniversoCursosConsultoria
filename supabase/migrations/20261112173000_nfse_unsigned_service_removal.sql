BEGIN;

-- A preview is not a fiscal dispatch. Preserve its immutable history when
-- removing the preparation, but never allow a signed/ambiguous operation out.
CREATE OR REPLACE FUNCTION private.nfse_partner_service_removable(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $function$
  SELECT EXISTS(SELECT 1 FROM private.nfse_partner_services s WHERE s.id=p_id AND s.status='PREPARADO'
    AND NOT EXISTS(SELECT 1 FROM private.nfse_partner_service_removals r WHERE r.service_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM private.nfse_queue_operation_links l
      LEFT JOIN private.nfse_individual_operations o ON o.id=l.operation_id
      WHERE l.source_kind='PARTNER_SERVICE' AND l.source_id=s.id
        AND (o.id IS NULL OR NOT (
          (o.state='PREVIEWED' AND o.signed_dps_xml IS NULL AND o.authorized_xml IS NULL AND o.result IS NULL)
          OR private.nfse_error_archivable(o))
          OR EXISTS(SELECT 1 FROM private.nfse_individual_cancellations c WHERE c.operation_id=o.id))))
$function$;

-- UPDATE already holds the operation row lock, matching the removal RPC's
-- operation-before-source lock order. This fences PREPARE as well as CLAIM:
-- a cached preview cannot sign or dispatch a logically removed service.
CREATE FUNCTION private.guard_nfse_removed_service_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE v_source uuid;
BEGIN
  IF NEW.signed_dps_xml IS NOT NULL OR NEW.authorized_xml IS NOT NULL OR NEW.state<>'PREVIEWED' THEN
    SELECT source_id INTO v_source FROM private.nfse_queue_operation_links
      WHERE operation_id=NEW.id AND source_kind='PARTNER_SERVICE';
    IF FOUND THEN
      IF current_setting('transaction_isolation')<>'read committed' THEN
        RAISE EXCEPTION 'A origem exige READ COMMITTED.' USING ERRCODE='25001';
      END IF;
      PERFORM 1 FROM private.nfse_partner_services WHERE id=v_source FOR SHARE;
      IF NOT FOUND OR EXISTS(SELECT 1 FROM private.nfse_partner_service_removals WHERE service_id=v_source) THEN
        RAISE EXCEPTION 'O serviço foi excluído antes do envio. Nenhuma NFS-e foi enviada por esta operação.' USING ERRCODE='40001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_nfse_removed_service_operation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_removed_service_operation_guard BEFORE UPDATE ON private.nfse_individual_operations
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_removed_service_operation();

COMMIT;
