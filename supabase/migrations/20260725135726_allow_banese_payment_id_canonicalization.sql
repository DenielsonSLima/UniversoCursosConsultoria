BEGIN;

-- O Banese identifica o mesmo titulo tanto sem zeros a esquerda (ex.: 74)
-- quanto no formato canonico de nove digitos (ex.: 000000074). A identidade
-- continua imutavel: somente essa representacao numerica equivalente pode ser
-- promovida; qualquer outro valor permanece bloqueado.
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
        OLD.gateway_provider = 'banese_card'
        AND OLD.gateway_payment_id ~ '^[0-9]{1,9}$'
        AND NEW.gateway_payment_id ~ '^[0-9]{1,9}$'
        AND lpad(OLD.gateway_payment_id, 9, '0')
          = lpad(NEW.gateway_payment_id, 9, '0')
      )
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

COMMIT;
