-- Mantem convenio e agencia usados na reserva para que retries consultem o
-- mesmo titulo mesmo se a configuracao da credencial mudar posteriormente.

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_boleto_convenio TEXT,
  ADD COLUMN IF NOT EXISTS gateway_boleto_agencia TEXT;

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_gateway_boleto_convenio_check,
  ADD CONSTRAINT contas_receber_gateway_boleto_convenio_check
    CHECK (
      gateway_boleto_convenio IS NULL
      OR gateway_boleto_convenio ~ '^[0-9]+$'
    ),
  DROP CONSTRAINT IF EXISTS contas_receber_gateway_boleto_agencia_check,
  ADD CONSTRAINT contas_receber_gateway_boleto_agencia_check
    CHECK (
      gateway_boleto_agencia IS NULL
      OR gateway_boleto_agencia ~ '^[0-9]{3}$'
    );

CREATE OR REPLACE FUNCTION public.reserve_banese_nosso_numero_for_receivable(
  p_receivable_id UUID,
  p_environment TEXT,
  p_convenio TEXT,
  p_agencia TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing TEXT;
  v_convenio TEXT;
  v_agencia TEXT;
  v_reserved TEXT;
BEGIN
  SELECT
    gateway_boleto_nosso_numero,
    gateway_boleto_convenio,
    gateway_boleto_agencia
  INTO v_existing, v_convenio, v_agencia
  FROM public.contas_receber
  WHERE id = p_receivable_id
    AND gateway_provider = 'banese_card'
    AND gateway_environment = p_environment
    AND gateway_payment_method = 'BOLETO'
    AND status <> 'PAGO'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebivel Banese indisponivel para reserva do Nosso Numero.';
  END IF;

  IF v_existing IS NOT NULL THEN
    IF v_convenio IS NULL OR v_agencia IS NULL THEN
      v_convenio := p_convenio;
      v_agencia := p_agencia;
      UPDATE public.contas_receber
      SET gateway_boleto_convenio = v_convenio,
          gateway_boleto_agencia = v_agencia,
          updated_at = now()
      WHERE id = p_receivable_id;
    END IF;
    RETURN jsonb_build_object(
      'nossoNumero', v_existing,
      'convenio', v_convenio,
      'agencia', v_agencia,
      'alreadyReserved', TRUE
    );
  END IF;

  v_reserved := public.next_banese_nosso_numero(
    p_environment,
    p_convenio,
    p_agencia
  );

  UPDATE public.contas_receber
  SET gateway_boleto_nosso_numero = v_reserved,
      gateway_boleto_convenio = p_convenio,
      gateway_boleto_agencia = p_agencia,
      updated_at = now()
  WHERE id = p_receivable_id;

  RETURN jsonb_build_object(
    'nossoNumero', v_reserved,
    'convenio', p_convenio,
    'agencia', p_agencia,
    'alreadyReserved', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_banese_nosso_numero_for_receivable(
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_banese_nosso_numero_for_receivable(
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
