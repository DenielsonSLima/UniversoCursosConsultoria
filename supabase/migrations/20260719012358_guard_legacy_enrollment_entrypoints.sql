BEGIN;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' AND NOT (
    public.gestor_has_module('gestao')
    AND public.can_write_turma(p_turma_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para matricular aluno nesta turma.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id, p_turma_id, 'ATIVO'
  );
  RETURN internal_academic.legacy_matricular_aluno_turma(
    p_aluno_id, p_turma_id, p_responsavel_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL,
  p_valor_matricula numeric DEFAULT NULL,
  p_data_vencimento_matricula date DEFAULT NULL,
  p_valor_parcela numeric DEFAULT NULL,
  p_valor_rematricula numeric DEFAULT NULL,
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
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' AND NOT (
    public.gestor_has_module('gestao')
    AND public.can_write_turma(p_turma_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para matricular aluno nesta turma.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM internal_academic.authorize_enrollment_upsert(
    p_aluno_id, p_turma_id, 'ATIVO'
  );
  RETURN internal_academic.legacy_matricular_aluno_turma_financeiro(
    p_aluno_id, p_turma_id, p_responsavel_id, p_valor_matricula,
    coalesce(
      p_data_vencimento_matricula,
      (pg_catalog.timezone('America/Maceio', now()))::date
    ),
    p_valor_parcela, p_valor_rematricula,
    p_dia_vencimento, p_financeiro_herdado, p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura, p_sincronizar_asaas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma(uuid, uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer,
  boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer,
  boolean, boolean, boolean, boolean
) TO authenticated, service_role;

COMMIT;
