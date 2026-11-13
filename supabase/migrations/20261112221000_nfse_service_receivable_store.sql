BEGIN;

-- Financial terms are collected before dispatch. A fiscal authorization, not
-- saving a draft, creates the financial obligation.
CREATE TABLE private.nfse_service_financial_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  default_category_id uuid NOT NULL REFERENCES public.categorias_financeiras(id)
);
DO $policy$
DECLARE v_category uuid;
BEGIN
  SELECT id INTO v_category FROM public.categorias_financeiras
    WHERE nome = 'Serviços NFS-e' AND tipo = 'OUTRO_CREDITO'
      AND public.is_active_status(status) ORDER BY id LIMIT 1;
  IF v_category IS NULL THEN
    v_category := gen_random_uuid();
    INSERT INTO public.categorias_financeiras(id,nome,tipo,status)
      VALUES(v_category,'Serviços NFS-e','OUTRO_CREDITO','ativo');
  END IF;
  INSERT INTO private.nfse_service_financial_policy VALUES(true,v_category);
END;
$policy$;

CREATE TABLE private.nfse_service_financial_plans (
  service_id uuid PRIMARY KEY REFERENCES private.nfse_partner_services(id),
  due_date date NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categorias_financeiras(id),
  existing_receivable_id uuid REFERENCES public.contas_receber(id),
  rule text NOT NULL CHECK (rule IN ('EXPLICIT','EXISTING_TITLE','LEGACY_SERVICE_DATE')),
  financial_input jsonb,
  financial_preview jsonb,
  issue_bolepix boolean NOT NULL DEFAULT false,
  requested_by uuid,
  context_key uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.nfse_service_receivables (
  service_id uuid NOT NULL REFERENCES private.nfse_partner_services(id),
  installment_number integer NOT NULL DEFAULT 1 CHECK (installment_number BETWEEN 1 AND 60),
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count BETWEEN 1 AND 60),
  operation_id uuid NOT NULL REFERENCES private.nfse_individual_operations(id),
  receivable_id uuid NOT NULL UNIQUE REFERENCES public.contas_receber(id),
  origin text NOT NULL CHECK (origin IN ('CREATED','LINKED','HISTORICAL')),
  fiscal_number text,
  fiscal_description text NOT NULL,
  fiscal_cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(service_id,installment_number),
  CHECK (installment_number<=installment_count)
);
CREATE INDEX nfse_service_receivables_operation ON private.nfse_service_receivables(operation_id);
ALTER TABLE private.nfse_service_financial_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_service_financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_service_receivables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_service_financial_policy,
  private.nfse_service_financial_plans,private.nfse_service_receivables
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.publish_nfse_service_receivable_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  INSERT INTO public.finance_realtime_events(source_table,event_type,entity_id,polo_id,aluno_id,turma_id)
    SELECT 'contas_receber','UPDATE',c.id,c.polo_id,c.cliente_id,c.turma_id
    FROM public.contas_receber c WHERE c.id=NEW.receivable_id;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER nfse_service_receivable_changed AFTER INSERT OR UPDATE OF fiscal_cancelled_at
  ON private.nfse_service_receivables FOR EACH ROW
  EXECUTE FUNCTION private.publish_nfse_service_receivable_change();
REVOKE ALL ON FUNCTION private.publish_nfse_service_receivable_change() FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE private.nfse_partner_services
  DROP CONSTRAINT nfse_partner_services_receivable_action_check,
  DROP CONSTRAINT nfse_partner_services_receivable_check,
  ADD CONSTRAINT nfse_partner_services_receivable_action_check
    CHECK (receivable_action IN ('NONE','PENDING','CREATED','LINKED')),
  ADD CONSTRAINT nfse_partner_services_receivable_check CHECK (
    (receivable_action IN ('NONE','PENDING') AND receivable_id IS NULL)
    OR (receivable_action IN ('CREATED','LINKED') AND receivable_id IS NOT NULL));

-- Freeze a linked title's identity and nominal amount, while preserving all
-- canonical payment, partial payment, reversal and status operations.
CREATE FUNCTION private.guard_nfse_service_financial_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF coalesce(auth.role(),'')='authenticated'
    AND EXISTS(SELECT 1 FROM private.nfse_service_receivables l WHERE l.receivable_id=OLD.id)
    AND NOT coalesce(internal_financial_payments.actor_allowed(auth.uid(),OLD.polo_id,'receber'),false) THEN
    RAISE EXCEPTION 'Alterar um recebível de serviço exige Contas a Receber neste polo.' USING ERRCODE='42501';
  END IF;
  IF (NEW.polo_id,NEW.cliente_id,NEW.valor) IS DISTINCT FROM
      (OLD.polo_id,OLD.cliente_id,OLD.valor)
    AND (EXISTS(SELECT 1 FROM private.nfse_service_receivables l WHERE l.receivable_id=OLD.id)
      OR EXISTS(SELECT 1 FROM private.nfse_service_financial_plans p WHERE p.existing_receivable_id=OLD.id)) THEN
    RAISE EXCEPTION 'A identidade e o valor do recebível de serviço estão vinculados à NFS-e.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER nfse_service_financial_identity_guard BEFORE UPDATE
  ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_service_financial_identity();
REVOKE ALL ON FUNCTION private.guard_nfse_service_financial_identity() FROM PUBLIC,anon,authenticated,service_role;

-- Record the explicit fallback for legacy drafts. This creates no receivable.
INSERT INTO private.nfse_service_financial_plans(service_id,due_date,category_id,existing_receivable_id,rule)
SELECT s.id,coalesce(c.data_vencimento,s.service_date),coalesce(c.categoria_financeira_id,p.default_category_id),
  s.receivable_id,CASE WHEN s.receivable_id IS NULL THEN 'LEGACY_SERVICE_DATE' ELSE 'EXISTING_TITLE' END
FROM private.nfse_partner_services s CROSS JOIN private.nfse_service_financial_policy p
LEFT JOIN public.contas_receber c ON c.id=s.receivable_id
WHERE NOT EXISTS(SELECT 1 FROM private.nfse_queue_operation_links l
  JOIN private.nfse_individual_operations o ON o.id=l.operation_id
  WHERE l.source_kind='PARTNER_SERVICE' AND l.source_id=s.id AND o.state='AUTHORIZED');

COMMENT ON TABLE private.nfse_service_receivables IS
  'Canonical classification of service receivables. Fiscal cancellation is evidence for review, never a financial reversal.';
COMMIT;
