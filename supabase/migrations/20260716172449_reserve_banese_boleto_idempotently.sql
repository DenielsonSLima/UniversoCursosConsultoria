-- Reserva o Nosso Numero no recebivel antes de qualquer chamada ao Banese.
-- Em retries, o mesmo numero e reutilizado para consultar o banco antes de
-- decidir se um novo POST pode ser feito.

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
  v_reserved TEXT;
BEGIN
  SELECT gateway_boleto_nosso_numero
  INTO v_existing
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
    RETURN jsonb_build_object(
      'nossoNumero', v_existing,
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
      updated_at = now()
  WHERE id = p_receivable_id;

  RETURN jsonb_build_object(
    'nossoNumero', v_reserved,
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

COMMENT ON FUNCTION public.reserve_banese_nosso_numero_for_receivable(
  UUID,
  TEXT,
  TEXT,
  TEXT
) IS 'Reserva atomicamente e reutiliza o Nosso Numero Banese por recebivel.';
