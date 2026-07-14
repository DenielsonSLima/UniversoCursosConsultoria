-- RPCs transacionais para iniciar turmas e operar períodos técnicos.

CREATE OR REPLACE FUNCTION public.alterar_status_turma_tecnica(
  p_turma_id uuid, p_status_novo text, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.turmas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turma public.turmas%rowtype;
  v_status text := upper(btrim(coalesce(p_status_novo, '')));
  v_first_period uuid;
  v_responsavel uuid;
BEGIN
  v_responsavel := internal_academic.resolve_responsavel(p_responsavel_id);
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || p_turma_id::text, 0)
  );
  IF NOT public.can_write_turma(p_turma_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta turma.';
  END IF;
  SELECT t.* INTO v_turma FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = p_turma_id AND c.modalidade = 'TECNICO'
  FOR UPDATE OF t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma técnica não encontrada.'; END IF;
  IF v_turma.status = 'FINALIZADA' THEN
    RAISE EXCEPTION 'Turma finalizada não retorna a uma fase operacional.';
  END IF;

  IF v_status = 'INSCRICOES_ABERTAS' THEN
    IF v_turma.status <> 'PLANEJADA' THEN
      RAISE EXCEPTION 'Somente turma planejada pode abrir inscrições.';
    END IF;
    IF NOT coalesce(v_turma.permitir_inscricoes_online, false) THEN
      RAISE EXCEPTION 'Habilite as inscrições online antes de abrir inscrições.';
    END IF;
    IF v_turma.data_inicio_inscricao IS NOT NULL
      AND (pg_catalog.timezone('America/Maceio', now()))::date < v_turma.data_inicio_inscricao THEN
      RAISE EXCEPTION 'A data de início das inscrições ainda não chegou.';
    END IF;
    IF v_turma.data_fim_inscricao IS NOT NULL
      AND (pg_catalog.timezone('America/Maceio', now()))::date > v_turma.data_fim_inscricao THEN
      RAISE EXCEPTION 'O período de inscrições terminou.';
    END IF;
  ELSIF v_status = 'EM_ANDAMENTO' THEN
    IF v_turma.status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS') THEN
      RAISE EXCEPTION 'A fase atual não permite iniciar a turma.';
    END IF;
    IF v_turma.data_inicio IS NULL OR v_turma.data_previsao_termino IS NULL
      OR v_turma.data_previsao_termino < v_turma.data_inicio THEN
      RAISE EXCEPTION 'Configure datas válidas para a turma antes do início.';
    END IF;
    IF (pg_catalog.timezone('America/Maceio', now()))::date < v_turma.data_inicio THEN
      RAISE EXCEPTION 'A turma só pode começar na data inicial configurada.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.periodos_letivos pl
      WHERE pl.turma_id = p_turma_id) THEN
      RAISE EXCEPTION 'A turma não possui períodos letivos.';
    END IF;
    PERFORM pl.id FROM public.periodos_letivos pl
    WHERE pl.turma_id = p_turma_id ORDER BY pl.id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.modulos m
      WHERE m.curso_id = v_turma.curso_id
        AND NOT EXISTS (SELECT 1 FROM public.periodos_letivos pl
          WHERE pl.turma_id = p_turma_id AND pl.modulo_id = m.id)
    ) OR EXISTS (
      SELECT 1 FROM public.periodos_letivos pl
      LEFT JOIN public.modulos m ON m.id = pl.modulo_id
        AND m.curso_id = v_turma.curso_id
      WHERE pl.turma_id = p_turma_id AND m.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Cada módulo do curso deve possuir exatamente um período válido.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.periodos_letivos pl
      WHERE pl.turma_id = p_turma_id
        AND (pl.data_inicio IS NULL OR pl.data_fim IS NULL
          OR pl.data_fim < pl.data_inicio OR pl.status <> 'PLANEJADO'
          OR pl.data_inicio < v_turma.data_inicio
          OR pl.data_fim > v_turma.data_previsao_termino)) THEN
      RAISE EXCEPTION 'Todos os períodos devem estar planejados e dentro das datas da turma.';
    END IF;
    IF (SELECT min(pl.data_inicio) FROM public.periodos_letivos pl
        WHERE pl.turma_id = p_turma_id) <> v_turma.data_inicio
      OR (SELECT max(pl.data_fim) FROM public.periodos_letivos pl
        WHERE pl.turma_id = p_turma_id) <> v_turma.data_previsao_termino THEN
      RAISE EXCEPTION 'Os períodos devem cobrir integralmente as datas da turma.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM (
        SELECT pl.data_inicio,
          lag(pl.data_fim) OVER (ORDER BY pl.ordem) AS previous_end
        FROM public.periodos_letivos pl WHERE pl.turma_id = p_turma_id
      ) schedule
      WHERE schedule.previous_end IS NOT NULL
        AND schedule.data_inicio <> schedule.previous_end + 1
    ) THEN
      RAISE EXCEPTION 'Os períodos devem ser sequenciais, sem lacunas ou sobreposição.';
    END IF;
    SELECT pl.id INTO v_first_period FROM public.periodos_letivos pl
    WHERE pl.turma_id = p_turma_id ORDER BY pl.ordem LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Fase técnica inválida: %.', v_status;
  END IF;

  PERFORM internal_academic.authorize_transition('TURMA_STATUS', p_turma_id, v_status);
  UPDATE public.turmas SET status = v_status WHERE id = p_turma_id
  RETURNING * INTO v_turma;

  IF v_status = 'EM_ANDAMENTO' THEN
    PERFORM internal_academic.authorize_transition('PERIODO_STATUS', v_first_period, 'ABERTO');
    UPDATE public.periodos_letivos SET status = 'ABERTO', updated_at = now()
    WHERE id = v_first_period;
  END IF;
  RETURN v_turma;
END;
$$;

CREATE OR REPLACE FUNCTION public.abrir_periodo_letivo(
  p_periodo_letivo_id uuid, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.periodos_letivos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_periodo public.periodos_letivos%rowtype; v_turma public.turmas%rowtype;
  v_previous_end date; v_next_start date; v_responsavel uuid; v_turma_id uuid;
BEGIN
  v_responsavel := internal_academic.resolve_responsavel(p_responsavel_id);
  SELECT pl.turma_id INTO v_turma_id FROM public.periodos_letivos pl
  WHERE pl.id = p_periodo_letivo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado.'; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || v_turma_id::text, 0)
  );
  SELECT pl.* INTO v_periodo
  FROM public.periodos_letivos pl JOIN public.turmas t ON t.id = pl.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE pl.id = p_periodo_letivo_id AND c.modalidade = 'TECNICO'
  FOR UPDATE OF pl, t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado.'; END IF;
  SELECT t.* INTO v_turma FROM public.turmas t WHERE t.id = v_periodo.turma_id;
  IF NOT public.can_write_turma(v_periodo.turma_id) THEN
    RAISE EXCEPTION 'Sem permissão para abrir este período.';
  END IF;
  IF v_turma.status <> 'EM_ANDAMENTO' OR v_periodo.status <> 'PLANEJADO' THEN
    RAISE EXCEPTION 'A turma deve estar em andamento e o período planejado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.periodos_letivos pl
    WHERE pl.turma_id = v_periodo.turma_id
      AND pl.status IN ('ABERTO', 'EM_FECHAMENTO')) THEN
    RAISE EXCEPTION 'Já existe um período aberto.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.periodos_letivos pl
    WHERE pl.turma_id = v_periodo.turma_id AND pl.ordem < v_periodo.ordem
      AND pl.status <> 'FECHADO') THEN
    RAISE EXCEPTION 'Feche todos os períodos anteriores.';
  END IF;
  SELECT max(pl.data_fim) INTO v_previous_end FROM public.periodos_letivos pl
  WHERE pl.turma_id = v_periodo.turma_id AND pl.ordem < v_periodo.ordem;
  SELECT min(pl.data_inicio) INTO v_next_start FROM public.periodos_letivos pl
  WHERE pl.turma_id = v_periodo.turma_id AND pl.ordem > v_periodo.ordem;
  IF (v_previous_end IS NULL AND v_periodo.data_inicio <> v_turma.data_inicio)
    OR (v_previous_end IS NOT NULL AND v_periodo.data_inicio <> v_previous_end + 1)
    OR (v_next_start IS NULL AND v_periodo.data_fim <> v_turma.data_previsao_termino)
    OR (v_next_start IS NOT NULL AND v_next_start <> v_periodo.data_fim + 1) THEN
    RAISE EXCEPTION 'Corrija lacunas ou sobreposições no cronograma.';
  END IF;
  PERFORM internal_academic.authorize_transition(
    'PERIODO_STATUS', p_periodo_letivo_id, 'ABERTO'
  );
  UPDATE public.periodos_letivos SET status = 'ABERTO', updated_at = now()
  WHERE id = p_periodo_letivo_id RETURNING * INTO v_periodo;
  RETURN v_periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.fechar_periodo_letivo(
  p_periodo_letivo_id uuid, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.periodos_letivos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_periodo public.periodos_letivos%rowtype; v_pendencias jsonb;
  v_resumo jsonb; v_responsavel uuid; v_turma_id uuid;
BEGIN
  v_responsavel := internal_academic.resolve_responsavel(p_responsavel_id);
  SELECT pl.turma_id INTO v_turma_id FROM public.periodos_letivos pl
  WHERE pl.id = p_periodo_letivo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado.'; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || v_turma_id::text, 0)
  );
  SELECT pl.* INTO v_periodo FROM public.periodos_letivos pl
  JOIN public.turmas t ON t.id = pl.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE pl.id = p_periodo_letivo_id AND t.status = 'EM_ANDAMENTO'
    AND c.modalidade = 'TECNICO' FOR UPDATE OF t, pl;
  IF NOT FOUND OR v_periodo.status <> 'ABERTO' THEN
    RAISE EXCEPTION 'Somente o período aberto de turma em andamento pode ser fechado.';
  END IF;
  IF NOT public.can_write_turma(v_periodo.turma_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  v_pendencias := public.get_pendencias_fechamento_periodo(p_periodo_letivo_id);
  IF NOT coalesce((v_pendencias ->> 'podeFechar')::boolean, false) THEN
    RAISE EXCEPTION 'Existem pendências acadêmicas: %', v_pendencias::text;
  END IF;
  SELECT jsonb_build_object('pendencias', v_pendencias,
    'resultados', coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb)) INTO v_resumo
  FROM (SELECT r.* FROM public.v_diario_notas_resultados r
    JOIN public.turmas_disciplinas td ON td.turma_id = r.turma_id
      AND td.disciplina_id = r.disciplina_id
    WHERE td.periodo_letivo_id = p_periodo_letivo_id) result;
  PERFORM internal_academic.authorize_transition(
    'PERIODO_STATUS', p_periodo_letivo_id, 'FECHADO'
  );
  PERFORM internal_academic.authorize_transition(
    'PERIODO_AUDIT', p_periodo_letivo_id, 'FECHADO'
  );
  UPDATE public.periodos_letivos SET status = 'FECHADO', fechado_em = now(),
    fechado_por = v_responsavel, updated_at = now()
  WHERE id = p_periodo_letivo_id RETURNING * INTO v_periodo;
  PERFORM internal_academic.authorize_transition(
    'FECHAMENTO_INSERT', p_periodo_letivo_id, 'FECHADO'
  );
  INSERT INTO public.fechamentos_academicos
    (periodo_letivo_id, turma_id, resumo, fechado_por)
  VALUES (v_periodo.id, v_periodo.turma_id, coalesce(v_resumo, '{}'::jsonb), v_responsavel);
  RETURN v_periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_periodo_letivo(
  p_periodo_letivo_id uuid, p_motivo text, p_responsavel_id uuid DEFAULT NULL
)
RETURNS public.periodos_letivos LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_periodo public.periodos_letivos%rowtype; v_responsavel uuid;
  v_turma_id uuid; v_fechamento_id uuid;
BEGIN
  IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo.'; END IF;
  v_responsavel := internal_academic.resolve_responsavel(p_responsavel_id);
  SELECT pl.turma_id INTO v_turma_id FROM public.periodos_letivos pl
  WHERE pl.id = p_periodo_letivo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado.'; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || v_turma_id::text, 0)
  );
  SELECT pl.* INTO v_periodo FROM public.periodos_letivos pl
  JOIN public.turmas t ON t.id = pl.turma_id
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE pl.id = p_periodo_letivo_id AND t.status = 'EM_ANDAMENTO'
    AND c.modalidade = 'TECNICO' FOR UPDATE OF t, pl;
  IF NOT FOUND OR v_periodo.status <> 'FECHADO' THEN RAISE EXCEPTION 'Período não fechado.'; END IF;
  IF NOT public.can_write_turma(v_periodo.turma_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF EXISTS (SELECT 1 FROM public.periodos_letivos pl WHERE pl.turma_id = v_periodo.turma_id
    AND (pl.status IN ('ABERTO', 'EM_FECHAMENTO')
      OR (pl.ordem > v_periodo.ordem AND pl.status = 'FECHADO'))) THEN
    RAISE EXCEPTION 'Somente o último período fechado pode ser reaberto.';
  END IF;
  PERFORM internal_academic.authorize_transition(
    'PERIODO_STATUS', p_periodo_letivo_id, 'ABERTO'
  );
  PERFORM internal_academic.authorize_transition(
    'PERIODO_AUDIT', p_periodo_letivo_id, 'ABERTO'
  );
  UPDATE public.periodos_letivos SET status = 'ABERTO', reaberto_em = now(),
    reaberto_por = v_responsavel, motivo_reabertura = btrim(p_motivo), updated_at = now()
  WHERE id = p_periodo_letivo_id RETURNING * INTO v_periodo;
  SELECT f.id INTO v_fechamento_id FROM public.fechamentos_academicos f
  WHERE f.periodo_letivo_id = p_periodo_letivo_id AND f.status = 'FECHADO'
  ORDER BY f.fechado_em DESC LIMIT 1 FOR UPDATE;
  IF v_fechamento_id IS NULL THEN
    RAISE EXCEPTION 'O fechamento acadêmico do período não foi encontrado.';
  END IF;
  PERFORM internal_academic.authorize_transition(
    'FECHAMENTO_UPDATE', v_fechamento_id, 'REABERTO'
  );
  UPDATE public.fechamentos_academicos SET status = 'REABERTO', reaberto_em = now(),
    reaberto_por = v_responsavel, motivo_reabertura = btrim(p_motivo)
  WHERE id = v_fechamento_id;
  RETURN v_periodo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.alterar_status_turma_tecnica(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.abrir_periodo_letivo(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fechar_periodo_letivo(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reabrir_periodo_letivo(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_status_turma_tecnica(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.abrir_periodo_letivo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fechar_periodo_letivo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_periodo_letivo(uuid, text, uuid) TO authenticated, service_role;
