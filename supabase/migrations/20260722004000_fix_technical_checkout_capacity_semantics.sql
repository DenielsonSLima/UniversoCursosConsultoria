BEGIN;

-- qtd_vagas_minima indica o minimo pedagogico/comercial para formacao da turma;
-- apenas vagas_totais e o teto de novas matriculas.
CREATE OR REPLACE FUNCTION public.asaas_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean DEFAULT false
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_turma record;
  v_existing public.matriculas%ROWTYPE;
  v_matricula public.matriculas%ROWTYPE;
  v_target_status text;
  v_capacidade integer := 0;
  v_ocupacao bigint := 0;
  v_aluno_ja_ocupa boolean := false;
BEGIN
  IF p_aluno_id IS NULL OR p_turma_id IS NULL THEN
    RAISE EXCEPTION 'Aluno e turma sao obrigatorios para registrar a matricula.'
      USING ERRCODE = '22004';
  END IF;

  SELECT
    t.id,
    t.curso_id,
    t.polo_id,
    t.vagas_totais,
    t.bloquear_matriculas_apos_completar_vagas,
    c.modalidade
  INTO v_turma
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada.';
  END IF;

  PERFORM public.assert_aluno_sem_matricula_curso_duplicada(
    p_aluno_id,
    v_turma.curso_id,
    p_turma_id
  );

  IF v_turma.modalidade = 'TECNICO' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'technical_checkout_capacity:' || p_turma_id::text,
        0
      )
    );

    SELECT
      t.id,
      t.curso_id,
      t.polo_id,
      t.vagas_totais,
      t.bloquear_matriculas_apos_completar_vagas,
      c.modalidade
    INTO v_turma
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id
    FOR UPDATE OF t;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Turma nao encontrada.';
    END IF;
  END IF;

  SELECT m.*
  INTO v_existing
  FROM public.matriculas m
  WHERE m.aluno_id = p_aluno_id
    AND m.turma_id = p_turma_id
  ORDER BY
    CASE WHEN pg_catalog.upper(COALESCE(m.status, '')) IN (
      'ATIVO',
      'CONCLUIDO',
      'PENDENTE',
      'AGUARDANDO_PAGAMENTO',
      'AGUARDANDO_CONFIRMACAO'
    ) THEN 0 ELSE 1 END,
    m.data_matricula DESC NULLS LAST,
    m.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_target_status := CASE
      WHEN pg_catalog.upper(COALESCE(v_existing.status, '')) IN (
        'CANCELADO', 'DESISTENTE', 'TRANCADO', 'VENCIDO'
      ) THEN 'PENDENTE'
      ELSE v_existing.status
    END;
  ELSE
    v_target_status := 'PENDENTE';
  END IF;

  IF v_turma.modalidade = 'TECNICO'
     AND COALESCE(
       v_turma.bloquear_matriculas_apos_completar_vagas,
       true
     )
     AND pg_catalog.upper(COALESCE(v_target_status, '')) IN (
       'ATIVO',
       'CONCLUIDO',
       'PENDENTE',
       'AGUARDANDO_PAGAMENTO',
       'AGUARDANDO_CONFIRMACAO'
     ) THEN
    v_capacidade := COALESCE(v_turma.vagas_totais, 0);

    IF v_capacidade > 0 THEN
      SELECT
        pg_catalog.count(DISTINCT m.aluno_id),
        COALESCE(
          pg_catalog.bool_or(m.aluno_id = p_aluno_id),
          false
        )
      INTO v_ocupacao, v_aluno_ja_ocupa
      FROM public.matriculas m
      WHERE m.turma_id = p_turma_id
        AND pg_catalog.upper(COALESCE(m.status, '')) IN (
          'ATIVO',
          'CONCLUIDO',
          'PENDENTE',
          'AGUARDANDO_PAGAMENTO',
          'AGUARDANDO_CONFIRMACAO'
        );

      IF NOT v_aluno_ja_ocupa AND v_ocupacao >= v_capacidade THEN
        RAISE EXCEPTION 'Turma sem vagas disponiveis para nova matricula.'
          USING
            ERRCODE = 'P0001',
            DETAIL = pg_catalog.format(
              'Turma %s: capacidade %s, ocupacao %s.',
              p_turma_id,
              v_capacidade,
              v_ocupacao
            );
      END IF;
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.matriculas
    SET status = v_target_status,
        financeiro_herdado = false,
        gerar_cobranca_inicial = true,
        gerar_cobranca_futura = COALESCE(
          p_gerar_cobranca_futura,
          false
        ),
        sincronizar_asaas = true
    WHERE id = v_existing.id
    RETURNING * INTO v_matricula;
  ELSE
    INSERT INTO public.matriculas (
      aluno_id,
      turma_id,
      status,
      financeiro_herdado,
      gerar_cobranca_inicial,
      gerar_cobranca_futura,
      sincronizar_asaas
    )
    VALUES (
      p_aluno_id,
      p_turma_id,
      'PENDENTE',
      false,
      true,
      COALESCE(p_gerar_cobranca_futura, false),
      true
    )
    RETURNING * INTO v_matricula;
  END IF;

  RETURN v_matricula;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asaas_checkout_upsert_matricula(
  uuid,
  uuid,
  boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.asaas_checkout_upsert_matricula(
  uuid,
  uuid,
  boolean
) TO authenticated, service_role;

COMMIT;
