BEGIN;

-- The preparation queue has its own realtime path; fiscal/provider gates stay off.
CREATE TABLE public.nfse_queue_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  month text NOT NULL CHECK (month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfse_queue_change_events_scope ON public.nfse_queue_change_events(polo_id,environment,month);
ALTER TABLE public.nfse_queue_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfse_queue_change_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.nfse_queue_change_events TO authenticated;

CREATE FUNCTION private.can_read_nfse_queue_event(p_polo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.portal_listar_perfis() context
    WHERE context.role = 'GESTOR' AND coalesce(public.get_nfse_access_secure(context."contextId"),false)
      AND (coalesce(context."allPolos",false) OR p_polo_id = ANY(coalesce(context."poloIds",ARRAY[]::uuid[])))
      AND EXISTS (SELECT 1 FROM public.polos p WHERE p.id = p_polo_id AND public.is_active_status(p.status)));
$function$;
REVOKE ALL ON FUNCTION private.can_read_nfse_queue_event(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.can_read_nfse_queue_event(uuid) TO authenticated;
CREATE POLICY nfse_queue_change_events_pilot_read ON public.nfse_queue_change_events
  FOR SELECT TO authenticated USING (private.can_read_nfse_queue_event(polo_id));

CREATE FUNCTION private.publish_nfse_queue_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  INSERT INTO public.nfse_queue_change_events(polo_id,environment,month)
    VALUES(NEW.polo_id,NEW.environment,NEW.queue_month);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.publish_nfse_queue_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_preparation_changed AFTER INSERT ON private.nfse_preparation_batches
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_queue_change();
CREATE TRIGGER nfse_removal_changed AFTER INSERT ON private.nfse_queue_removal_requests
  FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_queue_change();

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nfse_queue_change_events;
  END IF;
END;
$publication$;
COMMENT ON TABLE public.nfse_queue_change_events IS
  'Sanitized queue invalidation only. No names, receipts, amounts, fiscal documents or credentials.';
NOTIFY pgrst,'reload schema';
COMMIT;
