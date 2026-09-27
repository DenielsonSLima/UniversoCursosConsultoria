BEGIN;
CREATE SCHEMA IF NOT EXISTS internal_pdv;
REVOKE ALL ON SCHEMA internal_pdv FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE internal_pdv.workstations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pdv_workstations_scope ON internal_pdv.workstations(polo_id,owner_id);
CREATE TABLE internal_pdv.printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  workstation_id uuid NOT NULL REFERENCES internal_pdv.workstations(id),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
  model text NOT NULL DEFAULT '' CHECK(length(model)<=80),
  transport text NOT NULL CHECK(transport IN('BROWSER','QZ_TRAY','EPOS')),
  behavior text NOT NULL CHECK(behavior IN('PERGUNTAR','AUTOMATICO','NAO')),
  context text NOT NULL DEFAULT 'OUTROS_CREDITOS' CHECK(context='OUTROS_CREDITOS'),
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  template jsonb NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pdv_printer_one_default ON internal_pdv.printers(workstation_id,context)
  WHERE active AND is_default;
CREATE INDEX pdv_printers_scope ON internal_pdv.printers(polo_id,workstation_id);
CREATE TABLE internal_pdv.requests (
  actor_id uuid NOT NULL, request_id uuid NOT NULL, operation text NOT NULL,
  payload_hash text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE internal_pdv.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL, polo_id uuid NOT NULL,
  entity_id uuid NOT NULL, operation text NOT NULL, detail jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE internal_pdv.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  receivable_id uuid NOT NULL REFERENCES public.contas_receber(id),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  settlement_fingerprint text NOT NULL,
  financial_snapshot jsonb NOT NULL,
  created_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receivable_id,settlement_fingerprint)
);
CREATE TABLE internal_pdv.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES internal_pdv.receipts(id),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  actor_id uuid NOT NULL,
  workstation_id uuid REFERENCES internal_pdv.workstations(id),
  printer_id uuid REFERENCES internal_pdv.printers(id),
  purpose text NOT NULL CHECK(purpose IN('MANUAL','AUTO','REPRINT')),
  status text NOT NULL DEFAULT 'PREPARED'
    CHECK(status IN('PREPARED','CLAIMED','DIALOG_CLOSED','FAILED','UNKNOWN')),
  transport text NOT NULL CHECK(transport='BROWSER'),
  receipt_snapshot jsonb NOT NULL,
  lease_token uuid, lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(printer_id IS NULL OR workstation_id IS NOT NULL)
);
CREATE UNIQUE INDEX pdv_one_automatic_print ON internal_pdv.print_jobs(receipt_id) WHERE purpose='AUTO';
CREATE INDEX pdv_print_jobs_scope ON internal_pdv.print_jobs(polo_id,actor_id,created_at);
CREATE INDEX pdv_print_jobs_receipt_status ON internal_pdv.print_jobs(receipt_id,status);
ALTER TABLE internal_pdv.workstations ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_pdv.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_pdv.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_pdv.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_pdv.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_pdv.print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA internal_pdv FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA internal_pdv FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_pdv.can_manage(p_polo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_gestor()
    AND public.gestor_has_any_module_for_polo(ARRAY['configuracoes'],p_polo)
$$;
CREATE FUNCTION internal_pdv.can_use(p_polo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_gestor()
    AND public.gestor_has_effective_financeiro_tab('outros-creditos')
    AND public.is_financeiro_for_polo(p_polo)
$$;
CREATE FUNCTION internal_pdv.assert_scope(p_polo uuid,p_manage boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_polo IS NULL OR auth.uid() IS NULL OR NOT coalesce(
    CASE WHEN p_manage THEN internal_pdv.can_manage(p_polo)
    ELSE internal_pdv.can_use(p_polo) END,false) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao PDV deste polo.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.polos WHERE id=p_polo AND upper(status)='ATIVO') THEN
    RAISE EXCEPTION 'Polo indisponível.' USING ERRCODE='PT409';
  END IF;
END $$;
CREATE FUNCTION internal_pdv.assert_workstation(p_station uuid,p_polo uuid,p_owner boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM internal_pdv.workstations WHERE id=p_station AND polo_id=p_polo
    AND active AND (NOT p_owner OR owner_id=auth.uid())) THEN
    RAISE EXCEPTION 'Estação não autorizada para este atendimento.' USING ERRCODE='42501';
  END IF;
END $$;
CREATE FUNCTION internal_pdv.replay(p_request uuid,p_operation text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v internal_pdv.requests;
BEGIN
  IF auth.uid() IS NULL OR p_request IS NULL THEN
    RAISE EXCEPTION 'Identidade e chave de operação obrigatórias.' USING ERRCODE='42501';
  END IF;
  -- Every caller must authorize current actor, scope and entity BEFORE replay.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
  SELECT * INTO v FROM internal_pdv.requests WHERE actor_id=auth.uid() AND request_id=p_request;
  IF FOUND THEN
    IF v.operation<>p_operation OR v.payload_hash<>md5(p_payload::text) THEN
      RAISE EXCEPTION 'Chave já utilizada com outra operação.' USING ERRCODE='PT409';
    END IF;
    RETURN v.response;
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION internal_pdv.remember(p_request uuid,p_operation text,p_payload jsonb,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO internal_pdv.requests(actor_id,request_id,operation,payload_hash,response)
    VALUES(auth.uid(),p_request,p_operation,md5(p_payload::text),p_response);
  RETURN p_response;
END $$;
CREATE FUNCTION internal_pdv.printer_dto(p internal_pdv.printers) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',p.id,'poloId',p.polo_id,'workstationId',p.workstation_id,
    'name',p.name,'model',p.model,'transport',p.transport,'behavior',p.behavior,
    'isDefault',p.is_default,'active',p.active,'version',p.version,'template',p.template,
    'transportReady',p.active AND p.transport='BROWSER','automaticReady',false,
    'readinessReason',CASE WHEN NOT p.active THEN 'Impressora desativada.'
      WHEN p.transport='BROWSER' THEN 'Disponível pelo diálogo de impressão do sistema.'
      ELSE 'Transporte automático ainda não homologado nesta estação.' END)
$$;
CREATE FUNCTION internal_pdv.validate_template(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v jsonb := jsonb_build_object('widthMm',80,'showLogo',true,'footer','',
  'marginMm',3,'fontSize',9)||coalesce(p,'{}'::jsonb);
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v-ARRAY['widthMm','showLogo','footer','marginMm','fontSize']<>'{}'::jsonb
    OR jsonb_typeof(v->'widthMm') IS DISTINCT FROM 'number'
    OR coalesce(v->>'widthMm','') NOT IN('58','80') OR jsonb_typeof(v->'showLogo') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v->'footer') IS DISTINCT FROM 'string' OR length(v->>'footer')>240
    OR jsonb_typeof(v->'marginMm') IS DISTINCT FROM 'number' OR (v->>'marginMm')::numeric NOT BETWEEN 2 AND 6
    OR jsonb_typeof(v->'fontSize') IS DISTINCT FROM 'number' OR (v->>'fontSize')::numeric NOT BETWEEN 8 AND 12 THEN
    RAISE EXCEPTION 'Modelo de comprovante inválido.' USING ERRCODE='PT422';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_pdv FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
