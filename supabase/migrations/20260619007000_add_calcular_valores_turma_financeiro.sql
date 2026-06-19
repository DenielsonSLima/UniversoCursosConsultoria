-- Migração: Função RPC para cálculo de regras financeiras da turma (sem lógica no frontend)
-- Autor: Antigravity

CREATE OR REPLACE FUNCTION public.calcular_regras_financeiras_turma(
  valor_parcela NUMERIC,
  desconto_pontualidade NUMERIC,
  juros_atraso_percentual NUMERIC,
  multa_atraso NUMERIC
)
RETURNS TABLE (
  valor_com_desconto NUMERIC,
  juros_calculados NUMERIC,
  valor_com_atraso NUMERIC
) AS $$
DECLARE
  v_desconto NUMERIC := COALESCE(desconto_pontualidade, 0);
  v_juros NUMERIC := ROUND((valor_parcela * (COALESCE(juros_atraso_percentual, 0) / 100.0)), 2);
  v_multa NUMERIC := COALESCE(multa_atraso, 0);
BEGIN
  RETURN QUERY SELECT
    ROUND(GREATEST(0, valor_parcela - v_desconto), 2) AS valor_com_desconto,
    v_juros AS juros_calculados,
    ROUND(valor_parcela + v_juros + v_multa, 2) AS valor_com_atraso;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
