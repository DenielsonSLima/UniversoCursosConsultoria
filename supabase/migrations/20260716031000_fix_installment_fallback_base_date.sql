-- Sem cronograma explícito, a primeira parcela deve ser calculada a partir
-- do mês da matrícula. Usar a data do primeiro vencimento como base desloca
-- todo o ciclo em um mês.

DO $$
DECLARE
  v_definition text;
  v_old text := 'COALESCE(v_matricula.data_primeiro_vencimento_financeiro, v_matricula.data_matricula::date)';
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'gerar_parcelas_matricula'
    AND pg_get_function_identity_arguments(p.oid) = 'p_matricula_id uuid';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Função gerar_parcelas_matricula(uuid) não encontrada.';
  END IF;

  IF strpos(v_definition, v_old) > 0 THEN
    EXECUTE replace(
      v_definition,
      v_old,
      'v_matricula.data_matricula::date'
    );
  END IF;
END;
$$;
