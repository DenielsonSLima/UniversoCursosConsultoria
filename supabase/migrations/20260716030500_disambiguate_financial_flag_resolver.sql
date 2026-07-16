-- A função por turma tinha quatro parâmetros opcionais e colidia com a
-- sobrecarga de um parâmetro usada para resolver as flags por matrícula.
-- Os chamadores da versão por turma já fornecem os cinco argumentos.

DROP FUNCTION public.resolver_flags_financeiras_turma_matricula(
  uuid, boolean, boolean, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.resolver_flags_financeiras_turma_matricula(
  p_turma_id uuid,
  p_financeiro_herdado boolean,
  p_gerar_cobranca_inicial boolean,
  p_gerar_cobranca_futura boolean,
  p_sincronizar_asaas boolean
)
RETURNS TABLE(
  origem_financeira text,
  financeiro_herdado boolean,
  gerar_cobranca_inicial boolean,
  gerar_cobranca_futura boolean,
  sincronizar_asaas_futuro boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma public.turmas%ROWTYPE;
  v_financeiro_herdado boolean;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma % não encontrada', p_turma_id;
  END IF;

  v_financeiro_herdado := COALESCE(
    p_financeiro_herdado,
    v_turma.financeiro_herdado,
    COALESCE(v_turma.origem_financeira, 'NORMAL') = 'LEGADO',
    false
  );

  RETURN QUERY
  SELECT
    COALESCE(v_turma.origem_financeira, 'NORMAL')::text,
    v_financeiro_herdado,
    COALESCE(
      p_gerar_cobranca_inicial,
      CASE
        WHEN v_financeiro_herdado
          OR COALESCE(v_turma.origem_financeira, 'NORMAL') = 'LEGADO'
        THEN false
        ELSE true
      END
    ),
    COALESCE(
      p_gerar_cobranca_futura,
      v_turma.gerar_cobrancas_futuras,
      false
    ),
    COALESCE(
      p_sincronizar_asaas,
      v_turma.sincronizar_asaas_futuro,
      true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_flags_financeiras_turma_matricula(
  uuid, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolver_flags_financeiras_turma_matricula(
  uuid, boolean, boolean, boolean, boolean
) TO service_role;

COMMENT ON FUNCTION public.resolver_flags_financeiras_turma_matricula(
  uuid, boolean, boolean, boolean, boolean
) IS 'Resolve flags financeiras por turma; exige os cinco argumentos para não colidir com a sobrecarga por matrícula.';
