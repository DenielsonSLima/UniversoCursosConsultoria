-- Synthetic PostgreSQL boundaries; the actual payment projection and preparation
-- functions are loaded by the test. No provider, certificate or real identity.
ALTER TABLE public.polos ADD COLUMN is_matriz boolean DEFAULT false;
ALTER TABLE public.matriculas ADD COLUMN data_matricula timestamptz;
ALTER TABLE public.contas_receber ADD COLUMN parcela_numero integer, ADD COLUMN tipo_lancamento text;
CREATE TABLE public.documentos_templates(id text PRIMARY KEY,conteudo jsonb);
INSERT INTO public.documentos_templates VALUES('academicos_config',
  '{"matriculaPrefix":"SYN-","matriculaDigits":4,"yearFormat":"yy","usePoloCode":false}');
CREATE FUNCTION private.nfse_preset_partner_ids(jsonb) RETURNS TABLE(partner_id uuid)
  LANGUAGE sql IMMUTABLE AS $$SELECT NULL::uuid WHERE false$$;
CREATE FUNCTION private.nfse_model_partner_label(uuid,uuid) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$SELECT NULL::text$$;
CREATE TABLE private.nfse_individual_operations (
  id uuid PRIMARY KEY, polo_id uuid NOT NULL, environment text NOT NULL,
  month text NOT NULL, state text NOT NULL, result jsonb, authorized_xml text
);
CREATE TABLE private.nfse_queue_operation_links (
  source_kind text NOT NULL, source_id uuid NOT NULL, operation_id uuid NOT NULL UNIQUE
    REFERENCES private.nfse_individual_operations(id),
  PRIMARY KEY(source_kind,source_id)
);
CREATE TABLE private.nfse_individual_cancellations (
  id uuid PRIMARY KEY,operation_id uuid UNIQUE NOT NULL REFERENCES private.nfse_individual_operations(id),
  state text NOT NULL, result jsonb,access_key text NOT NULL,event_reference_id text,
  event_input jsonb,signed_event_xml text,event_xml text
);
CREATE FUNCTION private.test_nfse_cancellation_hint() RETURNS trigger
LANGUAGE plpgsql AS $$BEGIN
  INSERT INTO public.nfse_queue_change_events(polo_id,environment,month)
    SELECT polo_id,environment,month FROM private.nfse_individual_operations WHERE id=NEW.operation_id;
  RETURN NEW;
END;$$;
CREATE TRIGGER nfse_operation_cancellation_changed AFTER UPDATE ON private.nfse_individual_cancellations
  FOR EACH ROW EXECUTE FUNCTION private.test_nfse_cancellation_hint();
