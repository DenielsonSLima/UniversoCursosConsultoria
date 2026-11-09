BEGIN;

-- Preparation is an immutable accounting snapshot, never an issued NFS-e.
CREATE TABLE private.nfse_preparation_batches (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  queue_month text NOT NULL CHECK (queue_month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  payment_month text NOT NULL CHECK (payment_month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,request_id),
  UNIQUE(id,polo_id,environment,queue_month,payment_month)
);
CREATE TABLE private.nfse_queue_documents (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  queue_month text NOT NULL,
  payment_month text NOT NULL,
  candidate_id text NOT NULL,
  student_id uuid NOT NULL,
  class_id uuid NOT NULL,
  model_id uuid NOT NULL REFERENCES private.nfse_models(id),
  model_version integer NOT NULL CHECK (model_version > 0),
  amount numeric(30,2) NOT NULL CHECK (amount > 0),
  receipt_count integer NOT NULL CHECK (receipt_count > 0),
  status text NOT NULL DEFAULT 'PREPARADO' CHECK (status = 'PREPARADO'),
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id,candidate_id),
  UNIQUE(id,environment),
  CHECK (candidate_id = class_id::text || ':' || student_id::text),
  FOREIGN KEY(batch_id,polo_id,environment,queue_month,payment_month)
    REFERENCES private.nfse_preparation_batches(id,polo_id,environment,queue_month,payment_month)
);
CREATE INDEX nfse_queue_scope_created ON private.nfse_queue_documents
  (polo_id,environment,queue_month,created_at DESC,id);
CREATE TABLE private.nfse_receipt_reservations (
  environment text NOT NULL CHECK (environment IN ('HOMOLOGACAO','PRODUCAO')),
  receipt_id uuid NOT NULL,
  source_receivable_id uuid NOT NULL REFERENCES public.contas_receber(id),
  payment_event_id uuid REFERENCES public.financial_payment_events(id),
  document_id uuid NOT NULL,
  amount numeric(30,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(environment,receipt_id),
  CHECK (payment_event_id IS NOT NULL OR receipt_id = source_receivable_id),
  FOREIGN KEY(document_id,environment) REFERENCES private.nfse_queue_documents(id,environment)
);
CREATE INDEX nfse_reserved_source ON private.nfse_receipt_reservations(environment,source_receivable_id);
ALTER TABLE private.nfse_preparation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_queue_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_receipt_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_preparation_batches,private.nfse_queue_documents,
  private.nfse_receipt_reservations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  RAISE EXCEPTION 'O snapshot e a reserva da preparação NFS-e são imutáveis.' USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION private.reject_nfse_preparation_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_batch_immutable BEFORE UPDATE OR DELETE ON private.nfse_preparation_batches
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_queue_immutable BEFORE UPDATE OR DELETE ON private.nfse_queue_documents
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
CREATE TRIGGER nfse_reservation_immutable BEFORE UPDATE OR DELETE ON private.nfse_receipt_reservations
  FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();

-- Keep effective component IDs and their physical title/event provenance. A
-- component is not a physical contas_receber row. No client amount is accepted.
CREATE FUNCTION private.nfse_academic_receipts(p_polo_id uuid,p_payment_month text,p_candidate_ids text[])
RETURNS TABLE(receipt_id uuid,source_receivable_id uuid,payment_event_id uuid,candidate_id text,
  class_id uuid,student_id uuid,enrollment_id uuid,received_amount numeric,payment_date date,
  receipt_snapshot jsonb,source_is_financing boolean)
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT effective.id,source.id,event.id,class.id::text || ':' || student.id::text,
    class.id,student.id,enrollment.id,amount.value,effective.data_pagamento,
    jsonb_build_object('receiptId',effective.id,'sourceReceivableId',source.id,'paymentEventId',event.id,
      'enrollmentId',enrollment.id,'paymentDate',effective.data_pagamento,'receivedAmount',amount.value::numeric(30,2)::text,
      'origin',effective.origem_pagamento,'paymentMethod',effective.forma_pagamento,
      'description',effective.descricao),
    EXISTS (SELECT 1 FROM public.emprestimos_financeiros loan WHERE loan.conta_receber_id = source.id)
  FROM internal_financial_payments.cash_receivables() effective
  LEFT JOIN public.financial_payment_components component ON component.id = effective.id
  LEFT JOIN public.financial_payment_events event ON event.id = component.event_id
    AND event.source_kind = 'RECEIVABLE' AND event.polo_id = p_polo_id AND event.reversed_at IS NULL
  JOIN public.contas_receber source ON source.id = CASE WHEN component.id IS NULL THEN effective.id ELSE event.source_id END
    AND source.polo_id = p_polo_id
  JOIN public.matriculas enrollment ON enrollment.id = effective.matricula_id
  JOIN public.parceiros student ON student.id = enrollment.aluno_id
    AND upper(btrim(student.tipo)) = 'ALUNO'
  JOIN public.turmas class ON class.id = coalesce(effective.turma_id,enrollment.turma_id)
    AND class.polo_id = p_polo_id
  JOIN public.cursos course ON course.id = class.curso_id
  CROSS JOIN LATERAL (SELECT private.nfse_receipt_amount(effective::public.contas_receber) value) amount
  WHERE effective.polo_id = p_polo_id AND effective.status = 'PAGO'
    AND effective.data_pagamento >= (p_payment_month || '-01')::date
    AND effective.data_pagamento < (p_payment_month || '-01')::date + INTERVAL '1 month'
    AND (class.id::text || ':' || student.id::text) = ANY(p_candidate_ids)
    AND amount.value > 0 AND amount.value::text NOT IN ('NaN','Infinity','-Infinity')
    -- Match the existing selection filter; flag source-level financing above so
    -- a component cannot silently disappear from the displayed selection total.
    AND NOT EXISTS (SELECT 1 FROM public.emprestimos_financeiros loan WHERE loan.conta_receber_id = effective.id);
$function$;
REVOKE ALL ON FUNCTION private.nfse_academic_receipts(uuid,text,text[]) FROM PUBLIC,anon,authenticated,service_role;

-- Only the establishment's own registered fields are captured. In particular,
-- a filial must not silently borrow the matrix CNPJ, address or legal identity.
CREATE FUNCTION private.nfse_issuer_preparation_snapshot(p_polo_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT jsonb_build_object('poloId',p.id,'companyId',p.company_id,'cnpj',nullif(btrim(p.cnpj),''),
    'name',p.nome,'legalName',CASE WHEN regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g') <> ''
      AND regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g') = regexp_replace(coalesce(e.cnpj,''),'[^0-9]','','g')
      THEN nullif(btrim(e.razao_social),'') ELSE NULL END,
    'municipalityCode',NULL,'municipalRegistration',NULL,
    'address',jsonb_build_object('street',p.endereco,'number',p.numero,'complement',p.complemento,
      'district',p.bairro,'city',p.cidade,'state',p.estado,'postalCode',p.cep))
  FROM public.polos p LEFT JOIN public.empresas e ON e.id = p.company_id WHERE p.id = p_polo_id;
$function$;
REVOKE ALL ON FUNCTION private.nfse_issuer_preparation_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE private.nfse_queue_documents IS
  'Immutable academic preparation only. No fiscal competence, confirmed recipient, DPS number, signature, dispatch or authorization is inferred.';
COMMENT ON TABLE private.nfse_receipt_reservations IS
  'Environment-isolated immutable effective-receipt claims with physical-title and payment-event provenance. Never released by a fiscal retry.';
COMMIT;
