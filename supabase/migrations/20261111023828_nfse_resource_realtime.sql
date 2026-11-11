BEGIN;

-- Public invalidation hints only; private records remain outside the publication.
CREATE TABLE public.nfse_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  month text CHECK (month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  resource text NOT NULL CHECK (resource IN ('models','configuration','cancellation-models','services')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((resource = 'services' AND month IS NOT NULL)
    OR (resource <> 'services' AND month IS NULL))
);
CREATE INDEX nfse_change_events_scope ON public.nfse_change_events(polo_id,environment,month,resource);
ALTER TABLE public.nfse_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfse_change_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.nfse_change_events TO authenticated;
CREATE POLICY nfse_change_events_scoped_read ON public.nfse_change_events
  FOR SELECT TO authenticated USING (private.can_read_nfse_queue_event(polo_id));

CREATE FUNCTION private.publish_nfse_resource_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_resource text;
  v_old_month text;
  v_new_month text;
  v_dependent record;
BEGIN
  IF TG_TABLE_SCHEMA <> 'private' THEN
    RAISE EXCEPTION 'Invalid NFS-e change source' USING ERRCODE = '22023';
  END IF;
  v_resource := CASE TG_TABLE_NAME
    WHEN 'nfse_models' THEN 'models'
    WHEN 'nfse_configurations' THEN 'configuration'
    WHEN 'nfse_certificates' THEN 'configuration'
    WHEN 'nfse_cancellation_models' THEN 'cancellation-models'
    WHEN 'nfse_partner_services' THEN 'services'
    ELSE NULL END;
  IF v_resource IS NULL THEN
    RAISE EXCEPTION 'Invalid NFS-e change source' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF v_resource = 'services' THEN
    IF TG_OP <> 'INSERT' THEN v_old_month := pg_catalog.to_char(OLD.service_date,'YYYY-MM'); END IF;
    IF TG_OP <> 'DELETE' THEN v_new_month := pg_catalog.to_char(NEW.service_date,'YYYY-MM'); END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
      VALUES(OLD.polo_id,OLD.environment,v_old_month,v_resource);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND
    (NEW.polo_id,NEW.environment,v_new_month) IS DISTINCT FROM
    (OLD.polo_id,OLD.environment,v_old_month)) THEN
    INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
      VALUES(NEW.polo_id,NEW.environment,v_new_month,v_resource);
  END IF;
  IF TG_TABLE_NAME = 'nfse_certificates' THEN
    -- Inherited A1 changes invalidate each configured unit in the same environment.
    -- Only existing scope references are read; credential contents never enter events.
    FOR v_dependent IN SELECT DISTINCT c.polo_id,c.environment
      FROM private.nfse_configurations c
      WHERE ((TG_OP <> 'INSERT' AND (c.credential_polo_id,c.environment) = (OLD.polo_id,OLD.environment))
        OR (TG_OP <> 'DELETE' AND (c.credential_polo_id,c.environment) = (NEW.polo_id,NEW.environment)))
        AND NOT ((TG_OP <> 'INSERT' AND (c.polo_id,c.environment) = (OLD.polo_id,OLD.environment))
          OR (TG_OP <> 'DELETE' AND (c.polo_id,c.environment) = (NEW.polo_id,NEW.environment)))
    LOOP
      INSERT INTO public.nfse_change_events(polo_id,environment,month,resource)
        VALUES(v_dependent.polo_id,v_dependent.environment,NULL,'configuration');
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.publish_nfse_resource_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_models_resource_changed AFTER INSERT OR UPDATE OR DELETE ON private.nfse_models
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_resource_change();
CREATE TRIGGER nfse_configurations_resource_changed AFTER INSERT OR UPDATE OR DELETE ON private.nfse_configurations
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_resource_change();
CREATE TRIGGER nfse_certificates_resource_changed AFTER INSERT OR UPDATE OR DELETE ON private.nfse_certificates
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_resource_change();
CREATE TRIGGER nfse_cancellation_models_resource_changed AFTER INSERT OR UPDATE OR DELETE ON private.nfse_cancellation_models
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_resource_change();
CREATE TRIGGER nfse_partner_services_resource_changed AFTER INSERT OR UPDATE OR DELETE ON private.nfse_partner_services
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_resource_change();

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'nfse_change_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nfse_change_events;
  END IF;
END;
$publication$;
COMMENT ON TABLE public.nfse_change_events IS
  'Scoped resource invalidation only. No record/partner IDs, names, documents, amounts, XML, credentials or snapshots.';
NOTIFY pgrst,'reload schema';
COMMIT;
