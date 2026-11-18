BEGIN;

-- Somente leitura: reutiliza integralmente autorização, filtros, valores e saldos
-- canônicos. A ordem da tela e dos demais consumidores não é modificada.
CREATE OR REPLACE FUNCTION public.get_extrato_financeiro_pdf_secure(
  p_polo_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_conta_bancaria_id uuid DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_status text DEFAULT 'ATIVOS',
  p_busca text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_payload jsonb;
  v_movimentos jsonb;
BEGIN
  v_payload := public.get_relatorio_movimentacao_financeira_secure(
    p_polo_id, 'EXTRATO_CONTA', p_data_inicio, p_data_fim,
    p_conta_bancaria_id, p_categoria, p_status, p_busca
  );

  -- Não ordenar uma amostra truncada e apresentá-la como extrato completo.
  IF (v_payload->>'completo')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Reduza o período ou aplique filtros para gerar um extrato completo.';
  END IF;

  -- A RPC canônica calcula saldo_apos por data/id ASC antes dos filtros.
  -- Preservar cada objeto mantém o saldo real, inclusive com busca/categoria.
  SELECT coalesce(jsonb_agg(movimento ORDER BY
    (movimento->>'data')::date ASC, movimento->>'id' ASC
  ), '[]'::jsonb)
  INTO v_movimentos
  FROM jsonb_array_elements(v_payload->'movimentos') AS movimento;

  RETURN jsonb_set(v_payload, '{movimentos}', v_movimentos);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_extrato_financeiro_pdf_secure(
  uuid, date, date, uuid, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_extrato_financeiro_pdf_secure(
  uuid, date, date, uuid, text, text, text
) TO authenticated;

COMMIT;
