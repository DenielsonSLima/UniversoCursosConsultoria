CREATE UNIQUE INDEX IF NOT EXISTS contas_receber_matricula_matricula_uidx
  ON public.contas_receber (matricula_id)
  WHERE matricula_id IS NOT NULL
    AND tipo_lancamento = 'MATRICULA';

CREATE OR REPLACE FUNCTION public.assert_aluno_sem_matricula_curso_duplicada(
  p_aluno_id uuid,
  p_curso_id uuid,
  p_turma_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_aluno_id IS NULL OR p_curso_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_aluno_id::text), hashtext(p_curso_id::text));

  IF EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    WHERE m.aluno_id = p_aluno_id
      AND t.curso_id = p_curso_id
      AND (p_turma_id IS NULL OR m.turma_id <> p_turma_id)
      AND COALESCE(m.status, '') NOT IN ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
      AND (
        m.status IN ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO', 'ATIVO', 'TRANCADO', 'CONCLUIDO')
        OR EXISTS (
          SELECT 1
          FROM public.contas_receber cr
          WHERE cr.matricula_id = m.id
            AND cr.tipo_lancamento = 'MATRICULA'
            AND (
              cr.status = 'PAGO'
              OR cr.asaas_status IN ('RECEIVED', 'CONFIRMED')
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.inscricoes_online io
          WHERE io.matricula_id = m.id
            AND io.status = 'PAGO'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Aluno ja possui matricula ativa, pendente ou paga neste curso.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_aluno_sem_matricula_curso_duplicada(uuid, uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL::uuid
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.matriculas%ROWTYPE;
  v_turma public.turmas%ROWTYPE;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.can_write_turma(p_turma_id) THEN
    RAISE EXCEPTION 'Gestor sem permissao para matricular nesta turma.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = p_aluno_id
      AND p.tipo = 'Aluno'
  ) THEN
    RAISE EXCEPTION 'Aluno nao encontrado.';
  END IF;

  PERFORM public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id, v_turma.curso_id, p_turma_id);

  INSERT INTO public.matriculas(aluno_id, turma_id, status)
  VALUES(p_aluno_id, p_turma_id, 'ATIVO')
  ON CONFLICT(aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO'
  RETURNING * INTO v;

  PERFORM public.sync_aluno_polo_scope(v.aluno_id, v_turma.polo_id);

  INSERT INTO public.matricula_movimentacoes(
    matricula_id,
    aluno_id,
    tipo,
    status_anterior,
    status_novo,
    turma_destino_id,
    motivo,
    responsavel_id
  )
  VALUES(
    v.id,
    v.aluno_id,
    'MATRICULA',
    NULL,
    'ATIVO',
    v.turma_id,
    'Matricula realizada na turma.',
    p_responsavel_id
  )
  ON CONFLICT DO NOTHING;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid DEFAULT NULL::uuid,
  p_valor_matricula numeric DEFAULT NULL::numeric,
  p_data_vencimento_matricula date DEFAULT NULL::date,
  p_valor_parcela numeric DEFAULT NULL::numeric,
  p_valor_rematricula numeric DEFAULT NULL::numeric,
  p_dia_vencimento integer DEFAULT NULL::integer,
  p_financeiro_herdado boolean DEFAULT NULL::boolean,
  p_gerar_cobranca_inicial boolean DEFAULT NULL::boolean,
  p_gerar_cobranca_futura boolean DEFAULT NULL::boolean,
  p_sincronizar_asaas boolean DEFAULT NULL::boolean
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_flags record;
  v_turma public.turmas%ROWTYPE;
BEGIN
  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma nao encontrada.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_financeiro_for_polo(v_turma.polo_id) THEN
    RAISE EXCEPTION 'Apenas gestor autorizado pode matricular aluno com financeiro nesta turma.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = p_aluno_id
      AND p.tipo = 'Aluno'
  ) THEN
    RAISE EXCEPTION 'Aluno nao encontrado.';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_responsavel_id IS NOT NULL
     AND NOT public.is_parceiro_in_financeiro_scope(p_responsavel_id, v_turma.polo_id) THEN
    RAISE EXCEPTION 'Responsavel financeiro fora do escopo do polo.';
  END IF;

  PERFORM public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id, v_turma.curso_id, p_turma_id);

  SELECT * INTO v_flags
  FROM public.resolver_flags_financeiras_turma_matricula(
    p_turma_id,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );

  INSERT INTO public.matriculas (
    aluno_id,
    turma_id,
    status,
    valor_matricula_individual,
    valor_rematricula_individual,
    valor_parcela_individual,
    dia_vencimento_individual,
    data_primeiro_vencimento_financeiro,
    financeiro_herdado,
    gerar_cobranca_inicial,
    gerar_cobranca_futura,
    sincronizar_asaas
  )
  VALUES (
    p_aluno_id,
    p_turma_id,
    'ATIVO',
    p_valor_matricula,
    p_valor_rematricula,
    p_valor_parcela,
    p_dia_vencimento,
    COALESCE(p_data_vencimento_matricula, CURRENT_DATE),
    v_flags.financeiro_herdado,
    v_flags.gerar_cobranca_inicial,
    v_flags.gerar_cobranca_futura,
    v_flags.sincronizar_asaas_futuro
  )
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO',
        valor_matricula_individual = EXCLUDED.valor_matricula_individual,
        valor_rematricula_individual = EXCLUDED.valor_rematricula_individual,
        valor_parcela_individual = EXCLUDED.valor_parcela_individual,
        dia_vencimento_individual = EXCLUDED.dia_vencimento_individual,
        data_primeiro_vencimento_financeiro = EXCLUDED.data_primeiro_vencimento_financeiro,
        financeiro_herdado = EXCLUDED.financeiro_herdado,
        gerar_cobranca_inicial = EXCLUDED.gerar_cobranca_inicial,
        gerar_cobranca_futura = EXCLUDED.gerar_cobranca_futura,
        sincronizar_asaas = EXCLUDED.sincronizar_asaas
  RETURNING * INTO v_matricula;

  PERFORM public.sync_aluno_polo_scope(v_matricula.aluno_id, v_turma.polo_id);
  PERFORM public.gerar_cobranca_matricula(v_matricula.id);

  PERFORM public.registrar_turma_financeiro_auditoria(
    v_matricula.id,
    'MATRICULA_FINANCEIRO_FLAGS',
    jsonb_build_object(
      'origem_financeira', v_flags.origem_financeira,
      'financeiro_herdado', v_flags.financeiro_herdado,
      'gerar_cobranca_inicial', v_flags.gerar_cobranca_inicial,
      'gerar_cobranca_futura', v_flags.gerar_cobranca_futura,
      'sincronizar_asaas', v_flags.sincronizar_asaas_futuro
    ),
    'Flags financeiras resolvidas no backend durante a matricula.'
  );

  INSERT INTO public.matricula_movimentacoes (
    matricula_id,
    aluno_id,
    tipo,
    status_anterior,
    status_novo,
    turma_destino_id,
    motivo,
    responsavel_id
  ) VALUES (
    v_matricula.id,
    v_matricula.aluno_id,
    'MATRICULA',
    NULL,
    'ATIVO',
    v_matricula.turma_id,
    'Matricula realizada na turma com financeiro individual.',
    p_responsavel_id
  )
  ON CONFLICT DO NOTHING;

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.ead_buscar_alunos_disponiveis(
  p_turma_id uuid,
  p_search text DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH turma_curso AS (
    SELECT t.id AS turma_id, t.curso_id
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id
      AND c.modalidade = 'EAD'
  ),
  candidatos AS (
    SELECT
      p.id,
      p.nome,
      p.email,
      p.cpf_cnpj,
      p.telefone
    FROM public.parceiros p
    CROSS JOIN turma_curso tc
    WHERE p.tipo = 'Aluno'
      AND p.status = 'ATIVO'
      AND NOT EXISTS (
        SELECT 1
        FROM public.matriculas m
        JOIN public.turmas mt ON mt.id = m.turma_id
        WHERE m.aluno_id = p.id
          AND mt.curso_id = tc.curso_id
          AND COALESCE(m.status, '') NOT IN ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
          AND (
            m.status IN ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO', 'ATIVO', 'TRANCADO', 'CONCLUIDO')
            OR EXISTS (
              SELECT 1
              FROM public.contas_receber cr
              WHERE cr.matricula_id = m.id
                AND cr.tipo_lancamento = 'MATRICULA'
                AND (
                  cr.status = 'PAGO'
                  OR cr.asaas_status IN ('RECEIVED', 'CONFIRMED')
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.inscricoes_online io
              WHERE io.matricula_id = m.id
                AND io.status = 'PAGO'
            )
          )
      )
      AND (
        COALESCE(p_search, '') = ''
        OR p.nome ILIKE '%' || p_search || '%'
        OR p.email ILIKE '%' || p_search || '%'
        OR regexp_replace(COALESCE(p.cpf_cnpj, ''), '\D', '', 'g') LIKE '%' || regexp_replace(COALESCE(p_search, ''), '\D', '', 'g') || '%'
      )
    ORDER BY p.nome
    LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'nome', nome,
      'email', email,
      'cpfCnpj', cpf_cnpj,
      'telefone', telefone
    )
    ORDER BY nome
  ), '[]'::jsonb)
  FROM candidatos;
$$;

CREATE OR REPLACE FUNCTION public.ead_matricular_aluno_manual(
  p_turma_id uuid,
  p_aluno_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_turma record;
  v_matricula record;
BEGIN
  SELECT t.id, t.curso_id, t.polo_id, c.modalidade
  INTO v_turma
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = p_turma_id;

  IF NOT FOUND OR v_turma.modalidade <> 'EAD' THEN
    RAISE EXCEPTION 'Turma EAD nao encontrada';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.can_write_turma(p_turma_id) THEN
    RAISE EXCEPTION 'Gestor sem permissao para matricular nesta turma EAD.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parceiros WHERE id = p_aluno_id AND tipo = 'Aluno') THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  PERFORM public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id, v_turma.curso_id, p_turma_id);

  INSERT INTO public.matriculas (aluno_id, turma_id, status)
  VALUES (p_aluno_id, p_turma_id, 'ATIVO')
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO'
  RETURNING * INTO v_matricula;

  PERFORM public.sync_aluno_polo_scope(p_aluno_id, v_turma.polo_id);
  PERFORM public.ead_get_aluno_progress(p_aluno_id, v_turma.curso_id);

  RETURN jsonb_build_object(
    'success', true,
    'matriculaId', v_matricula.id,
    'status', v_matricula.status
  );
END;
$$;
