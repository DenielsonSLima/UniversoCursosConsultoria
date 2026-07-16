-- Permite excecoes financeiras por aluno sem alterar os valores padrao da turma.

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS desconto_pontualidade_individual numeric(10,2),
  ADD COLUMN IF NOT EXISTS juros_atraso_individual numeric(5,2),
  ADD COLUMN IF NOT EXISTS multa_atraso_individual numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matriculas_desconto_pontualidade_individual_chk'
      AND conrelid = 'public.matriculas'::regclass
  ) THEN
    ALTER TABLE public.matriculas
      ADD CONSTRAINT matriculas_desconto_pontualidade_individual_chk
      CHECK (desconto_pontualidade_individual IS NULL OR desconto_pontualidade_individual >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matriculas_juros_atraso_individual_chk'
      AND conrelid = 'public.matriculas'::regclass
  ) THEN
    ALTER TABLE public.matriculas
      ADD CONSTRAINT matriculas_juros_atraso_individual_chk
      CHECK (juros_atraso_individual IS NULL OR juros_atraso_individual BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matriculas_multa_atraso_individual_chk'
      AND conrelid = 'public.matriculas'::regclass
  ) THEN
    ALTER TABLE public.matriculas
      ADD CONSTRAINT matriculas_multa_atraso_individual_chk
      CHECK (multa_atraso_individual IS NULL OR multa_atraso_individual >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro_individual(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL,
  p_valor_matricula numeric DEFAULT NULL,
  p_data_vencimento_matricula date DEFAULT NULL,
  p_valor_parcela numeric DEFAULT NULL,
  p_valor_rematricula numeric DEFAULT NULL,
  p_desconto_pontualidade numeric DEFAULT NULL,
  p_juros_atraso numeric DEFAULT NULL,
  p_multa_atraso numeric DEFAULT NULL,
  p_dia_vencimento integer DEFAULT NULL,
  p_financeiro_herdado boolean DEFAULT NULL,
  p_gerar_cobranca_inicial boolean DEFAULT NULL,
  p_gerar_cobranca_futura boolean DEFAULT NULL,
  p_sincronizar_asaas boolean DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matricula public.matriculas;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matricular_aluno_turma_financeiro(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id,
    p_valor_matricula,
    p_data_vencimento_matricula,
    p_valor_parcela,
    p_valor_rematricula,
    p_dia_vencimento,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );

  UPDATE public.matriculas
  SET desconto_pontualidade_individual = p_desconto_pontualidade,
      juros_atraso_individual = p_juros_atraso,
      multa_atraso_individual = p_multa_atraso
  WHERE id = v_matricula.id
  RETURNING * INTO v_matricula;

  RETURN v_matricula;
END;
$$;

REVOKE ALL ON FUNCTION public.matricular_aluno_turma_financeiro_individual(
  uuid, uuid, uuid, numeric, date, numeric, numeric, numeric, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro_individual(
  uuid, uuid, uuid, numeric, date, numeric, numeric, numeric, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.matricular_aluno_turma_financeiro_individual(
  uuid, uuid, uuid, numeric, date, numeric, numeric, numeric, numeric, numeric,
  integer, boolean, boolean, boolean, boolean
) IS 'Matricula aluno usando a turma como padrao e salva valores, desconto e encargos especificos da matricula.';
