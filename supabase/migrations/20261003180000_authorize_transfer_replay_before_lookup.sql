-- Patch independente da apresentação de saldo por polo; não altera cálculo ou dados.
BEGIN;

-- RLS não cobre TRUNCATE. O cliente só precisa de SELECT sob a política existente.
REVOKE ALL ON TABLE public.transferencias_contas FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.transferencias_contas FROM authenticated;

CREATE OR REPLACE FUNCTION public.registrar_transferencia_conta(
  p_polo_origem_id uuid,
  p_conta_origem_id uuid,
  p_polo_destino_id uuid,
  p_conta_destino_id uuid,
  p_valor numeric,
  p_data_transferencia date,
  p_observacao text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transferencia_id uuid;
  v_tipo text;
BEGIN
  -- Autorize ambos os polos antes de consultar uma chave de replay.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT coalesce(public.is_gestor_for_polo(p_polo_origem_id), false)
       OR NOT coalesce(public.is_gestor_for_polo(p_polo_destino_id), false)
       OR NOT coalesce(
         public.gestor_has_module('caixa')
         OR public.gestor_has_financeiro_tab('transferencias'), false
       )
     ) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar esta transferência.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência da transferência é obrigatória.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_request_id::text, 0)
  );

  SELECT id
  INTO v_transferencia_id
  FROM public.transferencias_contas existente
  WHERE existente.request_id = p_request_id;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.transferencias_contas existente
      WHERE existente.request_id = p_request_id
        AND (
          existente.polo_id IS DISTINCT FROM p_polo_origem_id
          OR existente.polo_destino_id IS DISTINCT FROM p_polo_destino_id
          OR existente.conta_origem_id IS DISTINCT FROM p_conta_origem_id
          OR existente.conta_destino_id IS DISTINCT FROM p_conta_destino_id
          OR existente.valor IS DISTINCT FROM round(p_valor, 2)
          OR existente.data_transferencia IS DISTINCT FROM
            coalesce(p_data_transferencia, CURRENT_DATE)
          OR existente.observacao IS DISTINCT FROM
            nullif(trim(coalesce(p_observacao, '')), '')
        )
    ) THEN
      RAISE EXCEPTION
        'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_transferencia_id;
  END IF;

  IF p_polo_origem_id IS NULL OR p_polo_destino_id IS NULL THEN
    RAISE EXCEPTION 'Informe os polos de origem e destino.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor de transferência maior que zero.';
  END IF;
  IF p_conta_origem_id IS NULL OR p_conta_destino_id IS NULL THEN
    RAISE EXCEPTION 'Informe as contas de origem e destino.';
  END IF;
  IF p_conta_origem_id = p_conta_destino_id
     AND p_polo_origem_id = p_polo_destino_id THEN
    RAISE EXCEPTION
      'No rateio interno, os polos de origem e destino devem ser diferentes.';
  END IF;
  IF NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_origem_id, p_polo_origem_id
     )
     OR NOT public.conta_bancaria_disponivel_no_polo(
       p_conta_destino_id, p_polo_destino_id
     ) THEN
    RAISE EXCEPTION 'Uma das contas não está disponível no polo informado.';
  END IF;


  v_tipo := CASE
    WHEN p_conta_origem_id = p_conta_destino_id
      THEN 'RATEIO_INTERNO'
    ELSE 'FISICA'
  END;

  INSERT INTO public.transferencias_contas (
    polo_id,
    polo_destino_id,
    conta_origem_id,
    conta_destino_id,
    tipo,
    request_id,
    valor,
    data_transferencia,
    observacao
  )
  VALUES (
    p_polo_origem_id,
    p_polo_destino_id,
    p_conta_origem_id,
    p_conta_destino_id,
    v_tipo,
    p_request_id,
    round(p_valor, 2),
    coalesce(p_data_transferencia, CURRENT_DATE),
    nullif(trim(coalesce(p_observacao, '')), '')
  )
  RETURNING id INTO v_transferencia_id;

  RETURN v_transferencia_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_transferencia_conta(
  uuid, uuid, uuid, uuid, numeric, date, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia_conta(
  uuid, uuid, uuid, uuid, numeric, date, text, uuid
) TO authenticated, service_role;

COMMIT;
