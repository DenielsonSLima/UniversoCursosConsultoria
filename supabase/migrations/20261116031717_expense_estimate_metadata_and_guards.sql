BEGIN;

ALTER TABLE public.despesas_lancamentos
  ADD COLUMN valor_estimado boolean NOT NULL DEFAULT false,
  ADD COLUMN valor_estimado_original numeric(15,2),
  ADD COLUMN valor_confirmado_em timestamptz,
  ADD COLUMN valor_confirmado_por uuid REFERENCES auth.users(id),
  ADD COLUMN valor_sem_cobranca_em timestamptz,
  ADD COLUMN valor_sem_cobranca_por uuid REFERENCES auth.users(id),
  ADD COLUMN valor_estimado_versao integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT despesas_estimativa_metadata_check CHECK (
    valor_estimado_versao >= 0 AND (
      (NOT valor_estimado AND valor_estimado_original IS NULL
        AND valor_confirmado_em IS NULL AND valor_confirmado_por IS NULL
        AND valor_sem_cobranca_em IS NULL AND valor_sem_cobranca_por IS NULL)
      OR (valor_estimado AND valor_estimado_original IS NOT NULL AND valor_estimado_original > 0
        AND (valor_confirmado_em IS NULL) = (valor_confirmado_por IS NULL)
        AND (valor_sem_cobranca_em IS NULL) = (valor_sem_cobranca_por IS NULL)
        AND (valor_sem_cobranca_em IS NULL OR (status='CANCELADO' AND valor_confirmado_em IS NULL)))
    )
  );
CREATE TABLE private.despesas_estimativas_operacoes (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  despesa_id uuid REFERENCES public.despesas_lancamentos(id) ON DELETE RESTRICT,
  operacao text NOT NULL CHECK (operacao IN ('CRIAR','CONFIRMAR_VALOR','CONFIRMAR_PAGAMENTO','SEM_COBRANCA')),
  payload_hash text NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.despesas_estimativas_operacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.despesas_estimativas_operacoes FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.guard_despesa_estimativa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  context text := current_setting('app.despesa_estimativa_context', true);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.valor_estimado AND (NOT NEW.valor_estimado
      OR NEW.valor_estimado_original IS DISTINCT FROM OLD.valor_estimado_original) THEN
      RAISE EXCEPTION 'PAYMENT_ESTIMATE_ORIGINAL_IMMUTABLE';
    END IF;
    IF (NEW.valor_estimado IS DISTINCT FROM OLD.valor_estimado
      OR NEW.valor_estimado_original IS DISTINCT FROM OLD.valor_estimado_original
      OR NEW.valor_confirmado_em IS DISTINCT FROM OLD.valor_confirmado_em
      OR NEW.valor_confirmado_por IS DISTINCT FROM OLD.valor_confirmado_por
      OR NEW.valor_sem_cobranca_em IS DISTINCT FROM OLD.valor_sem_cobranca_em
      OR NEW.valor_sem_cobranca_por IS DISTINCT FROM OLD.valor_sem_cobranca_por)
      AND coalesce(context, '') NOT IN ('CRIAR','CONFIRMAR','SEM_COBRANCA') THEN
      RAISE EXCEPTION 'PAYMENT_ESTIMATE_DEDICATED_FLOW_REQUIRED';
    END IF;
    IF OLD.valor_sem_cobranca_em IS NOT NULL AND (NEW.status<>'CANCELADO'
      OR NEW.valor_sem_cobranca_em IS DISTINCT FROM OLD.valor_sem_cobranca_em
      OR NEW.valor_sem_cobranca_por IS DISTINCT FROM OLD.valor_sem_cobranca_por
      OR NEW.valor_base IS DISTINCT FROM OLD.valor_base) THEN
      RAISE EXCEPTION 'PAYMENT_ESTIMATE_HISTORY_LOCKED';
    END IF;
    IF OLD.valor_estimado AND OLD.valor_confirmado_em IS NOT NULL
      AND (NEW.valor_base IS DISTINCT FROM OLD.valor_base
        OR NEW.juros_valor IS DISTINCT FROM OLD.juros_valor
        OR NEW.multa_valor IS DISTINCT FROM OLD.multa_valor
        OR NEW.desconto_valor IS DISTINCT FROM OLD.desconto_valor)
      AND coalesce(context, '') <> 'CONFIRMAR' THEN
      RAISE EXCEPTION 'PAYMENT_ESTIMATE_HISTORY_LOCKED';
    END IF;
  ELSIF NEW.valor_estimado AND coalesce(context, '') <> 'CRIAR' THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_DEDICATED_FLOW_REQUIRED';
  END IF;
  IF NEW.valor_estimado THEN
    IF NEW.tipo NOT IN ('DESPESA_FIXA','DESPESA_VARIAVEL')
      OR NEW.juros_valor <> 0 OR NEW.multa_valor <> 0 OR NEW.desconto_valor <> 0 THEN
      RAISE EXCEPTION 'PAYMENT_ESTIMATE_INVALID_INPUT';
    END IF;
    IF NEW.valor_confirmado_em IS NULL AND (NEW.status = 'PAGO'
      OR NEW.data_pagamento IS NOT NULL OR coalesce(NEW.valor_pago,0) <> 0
      OR NEW.conta_bancaria_id IS NOT NULL OR NEW.forma_pagamento IS NOT NULL) THEN
      RAISE EXCEPTION 'PAYMENT_ESTIMATE_CONFIRMATION_REQUIRED';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF (to_jsonb(NEW) - ARRAY['valor_estimado_versao','updated_at','payment_summary'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['valor_estimado_versao','updated_at','payment_summary']) THEN
        NEW.valor_estimado_versao := OLD.valor_estimado_versao + 1;
      ELSE
        NEW.valor_estimado_versao := OLD.valor_estimado_versao;
      END IF;
    ELSE
      NEW.valor_estimado_versao := 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expense_estimate_metadata_guard BEFORE INSERT OR UPDATE
  ON public.despesas_lancamentos FOR EACH ROW EXECUTE FUNCTION private.guard_despesa_estimativa();

CREATE FUNCTION private.guard_estimated_expense_payment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.source_kind = 'EXPENSE' AND EXISTS (
    SELECT 1 FROM public.despesas_lancamentos d WHERE d.id = NEW.source_id
      AND d.valor_estimado AND d.valor_confirmado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'PAYMENT_ESTIMATE_CONFIRMATION_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estimated_expense_payment_event_guard BEFORE INSERT
  ON public.financial_payment_events FOR EACH ROW
  EXECUTE FUNCTION private.guard_estimated_expense_payment_event();

-- Reuse the installed canonical calculation with a projected, authorized source.
-- No source mutation happens during preview. Abort on contract drift instead of
-- silently forking a different financial formula.
DO $migration$
DECLARE definition text; anchor text := 'r:=internal_financial_payments.authorize_source(p_actor,p_source_kind,p_source_id);';
BEGIN
  definition := pg_get_functiondef('internal_financial_payments.preview_for_actor(uuid,text,uuid,jsonb)'::regprocedure);
  IF strpos(definition, anchor) = 0 OR strpos(definition, 'p_input jsonb)') = 0 THEN
    RAISE EXCEPTION 'ESTIMATED_EXPENSE_PREVIEW_CONTRACT_DRIFT';
  END IF;
  EXECUTE replace(replace(replace(definition,
    'internal_financial_payments.preview_for_actor(', 'private.preview_estimated_expense_source('),
    'p_input jsonb)', 'p_input jsonb, p_source jsonb)'), anchor, 'r:=p_source;');
  EXECUTE replace(definition, anchor, anchor || E'\n'
    || '  IF p_source_kind=''EXPENSE'' AND coalesce((r->>''valor_estimado'')::boolean,false)'
    || ' AND r->>''valor_confirmado_em'' IS NULL THEN'
    || ' RAISE EXCEPTION ''PAYMENT_ESTIMATE_CONFIRMATION_REQUIRED''; END IF;');
END $migration$;
REVOKE ALL ON FUNCTION private.guard_despesa_estimativa(),
  private.guard_estimated_expense_payment_event(),
  private.preview_estimated_expense_source(uuid,text,uuid,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
