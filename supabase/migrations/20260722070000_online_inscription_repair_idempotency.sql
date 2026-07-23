BEGIN;

ALTER TABLE public.inscricoes_online
  ADD COLUMN IF NOT EXISTS receivable_id UUID
    REFERENCES public.contas_receber(id) ON DELETE SET NULL;

-- Os fluxos antigos vinculavam a inscricao ao recebivel apenas pela tabela de
-- transacoes. Recupera esse vinculo antes de ativar as novas garantias.
WITH latest_transaction AS (
  SELECT DISTINCT ON (gateway_transaction.inscricao_online_id)
    gateway_transaction.inscricao_online_id,
    gateway_transaction.receivable_id
  FROM public.payment_gateway_transactions AS gateway_transaction
  WHERE gateway_transaction.inscricao_online_id IS NOT NULL
    AND gateway_transaction.receivable_id IS NOT NULL
  ORDER BY
    gateway_transaction.inscricao_online_id,
    gateway_transaction.updated_at DESC NULLS LAST,
    gateway_transaction.created_at DESC NULLS LAST,
    gateway_transaction.id DESC
)
UPDATE public.inscricoes_online AS inscription
SET receivable_id = gateway_transaction.receivable_id
FROM latest_transaction AS gateway_transaction
WHERE inscription.id = gateway_transaction.inscricao_online_id
  AND inscription.receivable_id IS NULL;

-- Falhar fechado e solicitar saneamento manual e preferivel a escolher ou
-- apagar uma inscricao financeira arbitrariamente em outro ambiente.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inscricoes_online
    WHERE matricula_id IS NOT NULL
    GROUP BY matricula_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Existem inscricoes_online duplicadas por matricula_id; saneie antes de aplicar a unicidade';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inscricoes_online
    WHERE receivable_id IS NOT NULL
    GROUP BY receivable_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Existem inscricoes_online duplicadas por receivable_id; saneie antes de aplicar a unicidade';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inscricoes_online
    WHERE gateway_provider IS NOT NULL
      AND gateway_environment IS NOT NULL
      AND gateway_payment_id IS NOT NULL
    GROUP BY gateway_provider, gateway_environment, gateway_payment_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Existem inscricoes_online duplicadas pela identidade remota do gateway; saneie antes de aplicar a unicidade';
  END IF;
END
$block$;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inscricoes_online'::regclass
      AND conname = 'inscricoes_online_matricula_id_key'
  ) THEN
    ALTER TABLE public.inscricoes_online
      ADD CONSTRAINT inscricoes_online_matricula_id_key
      UNIQUE (matricula_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inscricoes_online'::regclass
      AND conname = 'inscricoes_online_receivable_id_key'
  ) THEN
    ALTER TABLE public.inscricoes_online
      ADD CONSTRAINT inscricoes_online_receivable_id_key
      UNIQUE (receivable_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inscricoes_online'::regclass
      AND conname = 'inscricoes_online_gateway_remote_identity_key'
  ) THEN
    ALTER TABLE public.inscricoes_online
      ADD CONSTRAINT inscricoes_online_gateway_remote_identity_key
      UNIQUE (gateway_provider, gateway_environment, gateway_payment_id);
  END IF;
END
$block$;

-- Um retry de checkout nunca pode rebaixar uma inscricao liquidada. CANCELADO
-- tambem e terminal para eventos nao financeiros; uma confirmacao PAGO tardia
-- ainda prevalece para manter a verdade financeira sem reativar a matricula.
CREATE OR REPLACE FUNCTION public.preserve_online_inscription_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.matricula_id IS NOT NULL
      AND NEW.matricula_id IS DISTINCT FROM OLD.matricula_id THEN
    RAISE EXCEPTION
      'A identidade canonica da matricula em inscricoes_online e imutavel';
  END IF;
  IF OLD.receivable_id IS NOT NULL
      AND NEW.receivable_id IS DISTINCT FROM OLD.receivable_id THEN
    RAISE EXCEPTION
      'A identidade canonica do recebivel em inscricoes_online e imutavel';
  END IF;
  IF OLD.gateway_provider IS NOT NULL
      AND NEW.gateway_provider IS DISTINCT FROM OLD.gateway_provider THEN
    RAISE EXCEPTION
      'A identidade canonica do provedor em inscricoes_online e imutavel';
  END IF;
  IF OLD.gateway_environment IS NOT NULL
      AND NEW.gateway_environment IS DISTINCT FROM OLD.gateway_environment THEN
    RAISE EXCEPTION
      'A identidade canonica do ambiente em inscricoes_online e imutavel';
  END IF;
  IF OLD.gateway_payment_link_id IS NOT NULL
      AND NEW.gateway_payment_link_id IS DISTINCT FROM OLD.gateway_payment_link_id THEN
    RAISE EXCEPTION
      'A identidade canonica do link remoto em inscricoes_online e imutavel';
  END IF;
  IF OLD.gateway_payment_id IS NOT NULL
      AND NEW.gateway_payment_id IS DISTINCT FROM OLD.gateway_payment_id
      AND NOT (
        COALESCE(
          OLD.gateway_payment_link_id,
          CASE
            WHEN OLD.gateway_provider = 'asaas'
              THEN OLD.asaas_payment_link_id
            ELSE NULL
          END
        ) IS NOT NULL
        AND OLD.gateway_payment_id = COALESCE(
          OLD.gateway_payment_link_id,
          CASE
            WHEN OLD.gateway_provider = 'asaas'
              THEN OLD.asaas_payment_link_id
            ELSE NULL
          END
        )
        AND NEW.gateway_payment_link_id = COALESCE(
          OLD.gateway_payment_link_id,
          OLD.asaas_payment_link_id
        )
        AND NEW.gateway_payment_id IS NOT NULL
      ) THEN
    RAISE EXCEPTION
      'A identidade canonica do pagamento remoto em inscricoes_online e imutavel';
  END IF;
  IF OLD.asaas_payment_link_id IS NOT NULL
      AND NEW.asaas_payment_link_id IS DISTINCT FROM OLD.asaas_payment_link_id THEN
    RAISE EXCEPTION
      'A identidade canonica do link Asaas em inscricoes_online e imutavel';
  END IF;
  IF OLD.asaas_payment_id IS NOT NULL
      AND NEW.asaas_payment_id IS DISTINCT FROM OLD.asaas_payment_id
      AND NOT (
        OLD.asaas_payment_link_id IS NOT NULL
        AND OLD.asaas_payment_id = OLD.asaas_payment_link_id
        AND NEW.asaas_payment_link_id = OLD.asaas_payment_link_id
        AND NEW.asaas_payment_id IS NOT NULL
      ) THEN
    RAISE EXCEPTION
      'A identidade canonica do pagamento Asaas em inscricoes_online e imutavel';
  END IF;

  IF OLD.status = 'PAGO' AND NEW.status <> 'PAGO' THEN
    NEW.status := 'PAGO';
  ELSIF OLD.status = 'CANCELADO'
      AND NEW.status NOT IN ('PAGO', 'CANCELADO') THEN
    NEW.status := 'CANCELADO';
    NEW.erro := COALESCE(OLD.erro, NEW.erro);
  END IF;

  IF NEW.status = 'PAGO' THEN
    NEW.pago_em := COALESCE(OLD.pago_em, NEW.pago_em, now());
    NEW.confirmado_em := COALESCE(
      OLD.confirmado_em,
      NEW.confirmado_em,
      now()
    );
    NEW.erro := NULL;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS preserve_online_inscription_terminal_status_trigger
  ON public.inscricoes_online;
CREATE TRIGGER preserve_online_inscription_terminal_status_trigger
BEFORE UPDATE
ON public.inscricoes_online
FOR EACH ROW
EXECUTE FUNCTION public.preserve_online_inscription_terminal_status();

DROP INDEX IF EXISTS public.idx_inscricoes_online_matricula_id;

COMMIT;
