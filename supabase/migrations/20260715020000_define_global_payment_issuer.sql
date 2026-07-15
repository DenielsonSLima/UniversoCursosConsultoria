-- Define um unico emissor financeiro (matriz) para todas as cobrancas.
-- O polo de origem continua sendo preservado para filtros, relatorios e auditoria.

CREATE TABLE IF NOT EXISTS public.payment_gateway_issuer_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  issuer_polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  applies_to_all_polos BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_payment_gateway_issuer_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_matriz BOOLEAN;
  v_status TEXT;
BEGIN
  SELECT polo.is_matriz, polo.status
    INTO v_is_matriz, v_status
  FROM public.polos AS polo
  WHERE polo.id = NEW.issuer_polo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O polo emissor informado nao existe.';
  END IF;

  IF v_is_matriz IS NOT TRUE THEN
    RAISE EXCEPTION 'O emissor financeiro deve ser um polo marcado como matriz.';
  END IF;

  IF lower(coalesce(v_status, '')) <> 'ativo' THEN
    RAISE EXCEPTION 'O polo emissor precisa estar ativo.';
  END IF;

  IF NEW.applies_to_all_polos IS NOT TRUE THEN
    RAISE EXCEPTION 'O emissor financeiro da matriz deve atender todos os polos.';
  END IF;

  NEW.id := 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_payment_gateway_issuer_config_trigger
  ON public.payment_gateway_issuer_config;
CREATE TRIGGER validate_payment_gateway_issuer_config_trigger
BEFORE INSERT OR UPDATE ON public.payment_gateway_issuer_config
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_gateway_issuer_config();

INSERT INTO public.payment_gateway_issuer_config (
  id,
  issuer_polo_id,
  applies_to_all_polos,
  active
)
SELECT 1, polo.id, TRUE, TRUE
FROM public.polos AS polo
WHERE polo.is_matriz IS TRUE
  AND lower(coalesce(polo.status, '')) = 'ativo'
ORDER BY polo.created_at NULLS LAST, polo.id
LIMIT 1
ON CONFLICT (id) DO NOTHING;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_gateway_issuer_config
    WHERE id = 1
      AND active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Defina um polo matriz ativo antes de configurar o emissor financeiro.';
  END IF;
END;
$block$;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_issuer_polo_id UUID
    REFERENCES public.polos(id) ON DELETE RESTRICT;

ALTER TABLE public.inscricoes_online
  ADD COLUMN IF NOT EXISTS gateway_issuer_polo_id UUID
    REFERENCES public.polos(id) ON DELETE RESTRICT;

ALTER TABLE public.payment_gateway_transactions
  ADD COLUMN IF NOT EXISTS origin_polo_id UUID
    REFERENCES public.polos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issuer_polo_id UUID
    REFERENCES public.polos(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.fill_payment_gateway_receivable_issuer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gateway_provider IS NOT NULL AND NEW.gateway_issuer_polo_id IS NULL THEN
    SELECT config.issuer_polo_id
      INTO NEW.gateway_issuer_polo_id
    FROM public.payment_gateway_issuer_config AS config
    WHERE config.id = 1
      AND config.active IS TRUE;

    IF NEW.gateway_issuer_polo_id IS NULL THEN
      RAISE EXCEPTION 'O emissor financeiro global nao esta configurado.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_payment_gateway_receivable_issuer_trigger
  ON public.contas_receber;
CREATE TRIGGER fill_payment_gateway_receivable_issuer_trigger
BEFORE INSERT OR UPDATE OF gateway_provider, gateway_issuer_polo_id
ON public.contas_receber
FOR EACH ROW EXECUTE FUNCTION public.fill_payment_gateway_receivable_issuer();

CREATE OR REPLACE FUNCTION public.fill_payment_gateway_online_enrollment_issuer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gateway_provider IS NOT NULL AND NEW.gateway_issuer_polo_id IS NULL THEN
    SELECT config.issuer_polo_id
      INTO NEW.gateway_issuer_polo_id
    FROM public.payment_gateway_issuer_config AS config
    WHERE config.id = 1
      AND config.active IS TRUE;

    IF NEW.gateway_issuer_polo_id IS NULL THEN
      RAISE EXCEPTION 'O emissor financeiro global nao esta configurado.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_payment_gateway_online_enrollment_issuer_trigger
  ON public.inscricoes_online;
CREATE TRIGGER fill_payment_gateway_online_enrollment_issuer_trigger
BEFORE INSERT OR UPDATE OF gateway_provider, gateway_issuer_polo_id
ON public.inscricoes_online
FOR EACH ROW EXECUTE FUNCTION public.fill_payment_gateway_online_enrollment_issuer();

CREATE OR REPLACE FUNCTION public.fill_payment_gateway_transaction_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin_polo_id UUID;
  v_issuer_polo_id UUID;
BEGIN
  IF NEW.receivable_id IS NOT NULL THEN
    SELECT receivable.polo_id, receivable.gateway_issuer_polo_id
      INTO v_origin_polo_id, v_issuer_polo_id
    FROM public.contas_receber AS receivable
    WHERE receivable.id = NEW.receivable_id;
  ELSIF NEW.inscricao_online_id IS NOT NULL THEN
    SELECT turma.polo_id, enrollment.gateway_issuer_polo_id
      INTO v_origin_polo_id, v_issuer_polo_id
    FROM public.inscricoes_online AS enrollment
    LEFT JOIN public.turmas AS turma ON turma.id = enrollment.turma_id
    WHERE enrollment.id = NEW.inscricao_online_id;
  END IF;

  NEW.origin_polo_id := coalesce(NEW.origin_polo_id, v_origin_polo_id);
  NEW.issuer_polo_id := coalesce(NEW.issuer_polo_id, v_issuer_polo_id);

  IF NEW.issuer_polo_id IS NULL THEN
    SELECT config.issuer_polo_id
      INTO NEW.issuer_polo_id
    FROM public.payment_gateway_issuer_config AS config
    WHERE config.id = 1
      AND config.active IS TRUE;
  END IF;

  IF NEW.issuer_polo_id IS NULL THEN
    RAISE EXCEPTION 'O emissor financeiro global nao esta configurado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_payment_gateway_transaction_scope_trigger
  ON public.payment_gateway_transactions;
CREATE TRIGGER fill_payment_gateway_transaction_scope_trigger
BEFORE INSERT OR UPDATE OF receivable_id, inscricao_online_id, origin_polo_id, issuer_polo_id
ON public.payment_gateway_transactions
FOR EACH ROW EXECUTE FUNCTION public.fill_payment_gateway_transaction_scope();

UPDATE public.contas_receber AS receivable
SET gateway_issuer_polo_id = config.issuer_polo_id
FROM public.payment_gateway_issuer_config AS config
WHERE config.id = 1
  AND config.active IS TRUE
  AND receivable.gateway_provider IS NOT NULL
  AND receivable.gateway_issuer_polo_id IS NULL;

UPDATE public.inscricoes_online AS enrollment
SET gateway_issuer_polo_id = config.issuer_polo_id
FROM public.payment_gateway_issuer_config AS config
WHERE config.id = 1
  AND config.active IS TRUE
  AND enrollment.gateway_provider IS NOT NULL
  AND enrollment.gateway_issuer_polo_id IS NULL;

UPDATE public.payment_gateway_transactions AS gateway_transaction
SET
  origin_polo_id = coalesce(gateway_transaction.origin_polo_id, receivable.polo_id),
  issuer_polo_id = coalesce(
    gateway_transaction.issuer_polo_id,
    receivable.gateway_issuer_polo_id,
    config.issuer_polo_id
  )
FROM public.contas_receber AS receivable
CROSS JOIN public.payment_gateway_issuer_config AS config
WHERE gateway_transaction.receivable_id = receivable.id
  AND config.id = 1
  AND (
    gateway_transaction.origin_polo_id IS NULL
    OR gateway_transaction.issuer_polo_id IS NULL
  );

UPDATE public.payment_gateway_transactions AS gateway_transaction
SET issuer_polo_id = config.issuer_polo_id
FROM public.payment_gateway_issuer_config AS config
WHERE config.id = 1
  AND gateway_transaction.issuer_polo_id IS NULL;

CREATE INDEX IF NOT EXISTS contas_receber_gateway_issuer_polo_idx
  ON public.contas_receber (gateway_issuer_polo_id)
  WHERE gateway_issuer_polo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inscricoes_online_gateway_issuer_polo_idx
  ON public.inscricoes_online (gateway_issuer_polo_id)
  WHERE gateway_issuer_polo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_gateway_transactions_origin_polo_idx
  ON public.payment_gateway_transactions (origin_polo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_gateway_transactions_issuer_polo_idx
  ON public.payment_gateway_transactions (issuer_polo_id, created_at DESC);

ALTER TABLE public.payment_gateway_issuer_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_gateway_issuer_config_gestor_read
  ON public.payment_gateway_issuer_config;
CREATE POLICY payment_gateway_issuer_config_gestor_read
  ON public.payment_gateway_issuer_config
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

REVOKE ALL ON public.payment_gateway_issuer_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_gateway_issuer_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_issuer_config TO service_role;

REVOKE ALL ON FUNCTION public.validate_payment_gateway_issuer_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fill_payment_gateway_receivable_issuer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fill_payment_gateway_online_enrollment_issuer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fill_payment_gateway_transaction_scope() FROM PUBLIC;

UPDATE public.payment_gateway_providers
SET
  supports_pix = FALSE,
  supports_boleto = FALSE,
  supports_credit_card = TRUE,
  description = 'Gateway reservado para pagamentos por cartao de credito.',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"intended_role":"credit_card"}'::jsonb,
  updated_at = now()
WHERE code = 'mercado_pago';

UPDATE public.payment_gateway_providers
SET
  name = 'Banese',
  supports_pix = TRUE,
  supports_boleto = TRUE,
  supports_credit_card = FALSE,
  description = 'Emissor da matriz para Pix e boleto, bloqueado ate a homologacao bancaria.',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"intended_role":"pix_boleto","checkout_blocked":true}'::jsonb,
  updated_at = now()
WHERE code = 'banese_card';

COMMENT ON TABLE public.payment_gateway_issuer_config IS
  'Configuracao singleton do polo matriz que emite todas as cobrancas, independentemente do polo de origem.';
COMMENT ON COLUMN public.contas_receber.polo_id IS
  'Polo de origem da cobranca, usado em filtros, relatorios e auditoria.';
COMMENT ON COLUMN public.contas_receber.gateway_issuer_polo_id IS
  'Snapshot do polo matriz emissor aplicado quando a cobranca foi gerada.';
COMMENT ON COLUMN public.payment_gateway_transactions.origin_polo_id IS
  'Polo de origem da cobranca para segregacao operacional e relatorios.';
COMMENT ON COLUMN public.payment_gateway_transactions.issuer_polo_id IS
  'Polo/CNPJ recebedor que emitiu a cobranca no gateway.';
