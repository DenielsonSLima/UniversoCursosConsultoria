BEGIN;

-- Local preparation only: these rows never represent an issued fiscal document.
CREATE TABLE private.nfse_partner_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  partner_id uuid NOT NULL REFERENCES public.parceiros(id),
  model_id uuid NOT NULL REFERENCES private.nfse_models(id),
  service_date date NOT NULL,
  service_description text NOT NULL CHECK (length(service_description) BETWEEN 1 AND 1000),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  partner_snapshot jsonb NOT NULL,
  model_snapshot jsonb NOT NULL,
  receivable_id uuid REFERENCES public.contas_receber(id),
  receivable_action text NOT NULL CHECK (receivable_action IN ('NONE','CREATED','LINKED')),
  status text NOT NULL DEFAULT 'PREPARADO' CHECK (status = 'PREPARADO'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nfse_partner_services_receivable_check CHECK (
    (receivable_action = 'NONE' AND receivable_id IS NULL)
    OR (receivable_action IN ('CREATED','LINKED') AND receivable_id IS NOT NULL))
);
-- A canonical title cannot fund two preparations, including across fiscal environments.
CREATE UNIQUE INDEX nfse_partner_services_receivable_unique
  ON private.nfse_partner_services(receivable_id) WHERE receivable_id IS NOT NULL;
CREATE INDEX nfse_partner_services_scope_date
  ON private.nfse_partner_services(polo_id,environment,service_date DESC,id);
ALTER TABLE private.nfse_partner_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_partner_services FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.nfse_partner_service_requests (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.nfse_partner_service_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_partner_service_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.normalize_nfse_partner_service(p_definition jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
DECLARE
  v_partner uuid; v_model uuid; v_model_version integer; v_date date;
  v_amount numeric(14,2); v_description text; v_generate boolean;
  v_existing uuid; v_due date; v_category uuid;
BEGIN
  IF p_definition IS NULL OR jsonb_typeof(p_definition) <> 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) k WHERE k NOT IN (
      'partnerId','modelId','modelVersion','serviceDate','serviceDescription','amount',
      'generateReceivable','existingReceivableId','dueDate','categoryId')) THEN
    RAISE EXCEPTION 'Dados do serviço inválidos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_definition->'amount') IS DISTINCT FROM 'string'
    OR (p_definition->>'amount') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
    OR (p_definition->>'amount')::numeric <= 0
    OR jsonb_typeof(p_definition->'modelVersion') IS DISTINCT FROM 'number'
    OR (p_definition->>'modelVersion') !~ '^[1-9][0-9]{0,8}$'
    OR jsonb_typeof(p_definition->'serviceDescription') IS DISTINCT FROM 'string'
    OR coalesce(p_definition->>'serviceDate','') !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    OR (p_definition ? 'generateReceivable'
      AND jsonb_typeof(p_definition->'generateReceivable') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Valor, modelo ou data do serviço inválidos.' USING ERRCODE = '22023';
  END IF;
  v_partner := (p_definition->>'partnerId')::uuid;
  v_model := (p_definition->>'modelId')::uuid;
  v_model_version := (p_definition->>'modelVersion')::integer;
  v_date := (p_definition->>'serviceDate')::date;
  v_amount := (p_definition->>'amount')::numeric;
  v_description := btrim(p_definition->>'serviceDescription');
  v_generate := coalesce((p_definition->>'generateReceivable')::boolean,false);
  v_existing := nullif(p_definition->>'existingReceivableId','')::uuid;
  v_due := nullif(p_definition->>'dueDate','')::date;
  v_category := nullif(p_definition->>'categoryId','')::uuid;
  IF v_partner IS NULL OR v_model IS NULL OR length(v_description) NOT BETWEEN 1 AND 1000
    OR position('{{' IN v_description) > 0 OR position('}}' IN v_description) > 0
    OR to_char(v_date,'YYYY-MM-DD') IS DISTINCT FROM p_definition->>'serviceDate'
    OR (NOT v_generate AND (v_existing IS NOT NULL OR v_due IS NOT NULL OR v_category IS NOT NULL))
    OR (v_generate AND v_existing IS NOT NULL AND (v_due IS NOT NULL OR v_category IS NOT NULL))
    OR (v_generate AND v_existing IS NULL AND (v_due IS NULL OR v_category IS NULL))
    OR (v_due IS NOT NULL AND (to_char(v_due,'YYYY-MM-DD') IS DISTINCT FROM p_definition->>'dueDate'
      OR extract(year FROM v_due) NOT BETWEEN 1900 AND 2199)) THEN
    RAISE EXCEPTION 'Revise a descrição literal e as opções de contas a receber.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('partnerId',v_partner,'modelId',v_model,'modelVersion',v_model_version,
    'serviceDate',v_date,'serviceDescription',v_description,'amount',v_amount::text,
    'generateReceivable',v_generate,'existingReceivableId',v_existing,'dueDate',v_due,'categoryId',v_category);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
  OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Dados do serviço inválidos.' USING ERRCODE = '22023';
END;
$function$;
REVOKE ALL ON FUNCTION private.normalize_nfse_partner_service(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

-- Reuse the canonical standalone classification, without academic/convênio titles.
CREATE VIEW private.nfse_partner_linkable_receivables AS
SELECT c.id,c.polo_id,c.cliente_id,c.descricao,c.valor,c.data_vencimento,c.categoria_financeira_id,c.status
FROM public.contas_receber c
WHERE c.categoria = 'OUTROS_CREDITOS' AND c.status IN ('PENDENTE','VENCIDO','PAGO')
  AND c.matricula_id IS NULL AND c.turma_id IS NULL AND c.origem_cronograma_id IS NULL
  AND coalesce(c.tipo_lancamento,'') NOT IN ('MATRICULA','PARCELA','REMATRICULA','DEPENDENCIA','RENEGOCIACAO')
  AND NOT EXISTS (SELECT 1 FROM public.inscricoes_online i WHERE i.receivable_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.matricula_dependencia_cobrancas d WHERE d.conta_receber_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM internal_proesc.obligation_links l WHERE l.receivable_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.convenios_financeiros_creditos f WHERE f.conta_receber_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM private.nfse_partner_services s WHERE s.receivable_id = c.id);
REVOKE ALL ON private.nfse_partner_linkable_receivables FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
