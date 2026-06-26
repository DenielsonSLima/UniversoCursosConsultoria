-- Histórico de matrícula, continuidade acadêmica e responsável financeiro.

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS responsavel_financeiro BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS responsavel_email TEXT;

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS origem_matricula_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS continuidade_tipo TEXT;

ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS matriculas_continuidade_tipo_check;

ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_continuidade_tipo_check
  CHECK (
    continuidade_tipo IS NULL
    OR continuidade_tipo IN ('TRANSFERENCIA_INTERNA', 'RETORNO', 'APROVEITAMENTO')
  );

CREATE INDEX IF NOT EXISTS matriculas_aluno_data_idx
  ON public.matriculas (aluno_id, data_matricula DESC);

CREATE INDEX IF NOT EXISTS matriculas_origem_idx
  ON public.matriculas (origem_matricula_id)
  WHERE origem_matricula_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.matricula_aproveitamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id UUID NOT NULL REFERENCES public.matriculas(id) ON DELETE CASCADE,
  matricula_origem_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE RESTRICT,
  media_final NUMERIC(5,2),
  frequencia_percent NUMERIC(5,2),
  situacao TEXT NOT NULL DEFAULT 'APROVEITADO'
    CHECK (situacao IN ('APROVEITADO', 'DISPENSADO', 'EQUIVALENCIA')),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (matricula_id, disciplina_id)
);

CREATE INDEX IF NOT EXISTS matricula_aproveitamentos_origem_idx
  ON public.matricula_aproveitamentos (matricula_origem_id);

ALTER TABLE public.matricula_aproveitamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.matricula_aproveitamentos TO anon, authenticated;

DROP POLICY IF EXISTS "Consulta aproveitamentos academicos" ON public.matricula_aproveitamentos;
CREATE POLICY "Consulta aproveitamentos academicos"
  ON public.matricula_aproveitamentos
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_status_check;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_status_check
  CHECK (status IN (
    'PENDENTE', 'PAGO', 'VENCIDO', 'SUSPENSO',
    'ESTORNADO', 'CANCELADO', 'DEVOLVIDO'
  ));

ALTER TABLE public.matricula_movimentacoes
  DROP CONSTRAINT IF EXISTS matricula_movimentacoes_tipo_check;

ALTER TABLE public.matricula_movimentacoes
  ADD CONSTRAINT matricula_movimentacoes_tipo_check
  CHECK (tipo IN (
    'MATRICULA', 'TRANCAMENTO', 'CANCELAMENTO', 'DESISTENCIA',
    'REATIVACAO', 'TRANSFERENCIA_INTERNA',
    'TRANSFERENCIA_EXTERNA_ENVIADA', 'TRANSFERENCIA_EXTERNA_RECEBIDA',
    'CONCLUSAO'
  ));

CREATE OR REPLACE FUNCTION public.movimentar_matricula_academica(
  p_matricula_id UUID,
  p_tipo TEXT,
  p_motivo TEXT,
  p_observacao TEXT DEFAULT NULL,
  p_data_movimentacao DATE DEFAULT CURRENT_DATE,
  p_data_retorno_prevista DATE DEFAULT NULL,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_status_anterior TEXT;
  v_status_novo TEXT;
BEGIN
  SELECT * INTO v_matricula
  FROM public.matriculas
  WHERE id = p_matricula_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula não encontrada.'; END IF;
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da movimentação.';
  END IF;

  v_status_anterior := v_matricula.status;
  v_status_novo := CASE UPPER(BTRIM(p_tipo))
    WHEN 'TRANCAMENTO' THEN 'TRANCADO'
    WHEN 'CANCELAMENTO' THEN 'CANCELADO'
    WHEN 'DESISTENCIA' THEN 'DESISTENTE'
    WHEN 'REATIVACAO' THEN 'ATIVO'
    WHEN 'CONCLUSAO' THEN 'CONCLUIDO'
    ELSE NULL
  END;

  IF v_status_novo IS NULL THEN RAISE EXCEPTION 'Tipo de movimentação inválido.'; END IF;
  IF v_status_anterior = v_status_novo THEN
    RAISE EXCEPTION 'A matrícula já possui o status solicitado.';
  END IF;
  IF UPPER(BTRIM(p_tipo)) = 'REATIVACAO'
     AND v_status_anterior NOT IN ('TRANCADO', 'DESISTENTE', 'CANCELADO') THEN
    RAISE EXCEPTION 'Somente matrículas trancadas, desistentes ou canceladas podem ser reativadas.';
  END IF;
  IF UPPER(BTRIM(p_tipo)) = 'CONCLUSAO'
     AND EXISTS (
       SELECT 1 FROM public.periodos_letivos
       WHERE turma_id = v_matricula.turma_id AND status <> 'FECHADO'
     ) THEN
    RAISE EXCEPTION 'Todos os períodos letivos devem estar fechados antes da conclusão.';
  END IF;

  UPDATE public.matriculas
  SET status = v_status_novo
  WHERE id = p_matricula_id
  RETURNING * INTO v_matricula;

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_origem_id, motivo, observacao, data_movimentacao,
    data_retorno_prevista, responsavel_id
  ) VALUES (
    v_matricula.id, v_matricula.aluno_id, UPPER(BTRIM(p_tipo)),
    v_status_anterior, v_status_novo, v_matricula.turma_id,
    BTRIM(p_motivo), NULLIF(BTRIM(p_observacao), ''),
    COALESCE(p_data_movimentacao, CURRENT_DATE),
    p_data_retorno_prevista, p_responsavel_id
  );

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_financeiro_movimentacao_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'TRANCAMENTO' THEN
    UPDATE public.contas_receber
    SET status = 'SUSPENSO', updated_at = now()
    WHERE matricula_id = NEW.matricula_id
      AND status IN ('PENDENTE', 'VENCIDO')
      AND data_vencimento > NEW.data_movimentacao;
  ELSIF NEW.tipo = 'REATIVACAO' THEN
    UPDATE public.contas_receber
    SET status = CASE WHEN data_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
        updated_at = now()
    WHERE matricula_id = NEW.matricula_id
      AND status = 'SUSPENSO';
  ELSIF NEW.tipo IN ('CANCELAMENTO', 'DESISTENCIA', 'TRANSFERENCIA_EXTERNA_ENVIADA') THEN
    UPDATE public.contas_receber
    SET status = 'CANCELADO', updated_at = now()
    WHERE matricula_id = NEW.matricula_id
      AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      AND data_vencimento > NEW.data_movimentacao;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ajustar_financeiro_movimentacao_matricula_trigger
  ON public.matricula_movimentacoes;
CREATE TRIGGER ajustar_financeiro_movimentacao_matricula_trigger
AFTER INSERT ON public.matricula_movimentacoes
FOR EACH ROW
EXECUTE FUNCTION public.ajustar_financeiro_movimentacao_matricula();

CREATE OR REPLACE FUNCTION public.processar_continuidade_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma_destino public.turmas%ROWTYPE;
BEGIN
  IF NEW.tipo NOT IN ('INTERNA_TURMA', 'INTERNA_POLO')
     OR NEW.matricula_origem_id IS NULL
     OR NEW.matricula_destino_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_turma_destino
  FROM public.turmas
  WHERE id = NEW.turma_destino_id;

  UPDATE public.matriculas
  SET origem_matricula_id = NEW.matricula_origem_id,
      continuidade_tipo = 'TRANSFERENCIA_INTERNA'
  WHERE id = NEW.matricula_destino_id;

  INSERT INTO public.matricula_aproveitamentos (
    matricula_id,
    matricula_origem_id,
    disciplina_id,
    media_final,
    frequencia_percent,
    situacao,
    observacao
  )
  SELECT
    NEW.matricula_destino_id,
    NEW.matricula_origem_id,
    resultado.disciplina_id,
    resultado.media_final,
    resultado.frequencia_percent,
    'APROVEITADO',
    'Aproveitamento automático por transferência interna.'
  FROM public.matriculas origem
  JOIN public.turmas_disciplinas destino_disciplina
    ON destino_disciplina.turma_id = NEW.turma_destino_id
  CROSS JOIN LATERAL public.get_diario_resultados(
    origem.turma_id,
    destino_disciplina.disciplina_id
  ) resultado
  WHERE origem.id = NEW.matricula_origem_id
    AND resultado.aluno_id = origem.aluno_id
    AND resultado.resultado_final = 'APROVADO'
  ON CONFLICT (matricula_id, disciplina_id) DO UPDATE SET
    matricula_origem_id = EXCLUDED.matricula_origem_id,
    media_final = EXCLUDED.media_final,
    frequencia_percent = EXCLUDED.frequencia_percent,
    situacao = EXCLUDED.situacao,
    observacao = EXCLUDED.observacao;

  -- A matrícula criada pela transferência não cobra uma segunda taxa inicial.
  DELETE FROM public.contas_receber
  WHERE matricula_id = NEW.matricula_destino_id
    AND tipo_lancamento = 'MATRICULA'
    AND status IN ('PENDENTE', 'VENCIDO')
    AND data_pagamento IS NULL;

  -- Mantém o histórico pago na origem e move somente obrigações futuras.
  UPDATE public.contas_receber
  SET matricula_id = NEW.matricula_destino_id,
      turma_id = NEW.turma_destino_id,
      polo_id = v_turma_destino.polo_id,
      status = CASE WHEN data_vencimento < CURRENT_DATE THEN 'VENCIDO' ELSE 'PENDENTE' END,
      descricao = regexp_replace(descricao, ' - .*$', '') || ' - ' || v_turma_destino.nome,
      updated_at = now()
  WHERE matricula_id = NEW.matricula_origem_id
    AND status IN ('PENDENTE', 'VENCIDO', 'SUSPENSO')
    AND data_vencimento >= NEW.data_transferencia;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS processar_continuidade_transferencia_trigger
  ON public.transferencias_academicas;
CREATE TRIGGER processar_continuidade_transferencia_trigger
AFTER INSERT ON public.transferencias_academicas
FOR EACH ROW
EXECUTE FUNCTION public.processar_continuidade_transferencia();

CREATE OR REPLACE FUNCTION public.get_diario_resultados(
  p_turma_id UUID,
  p_disciplina_id UUID
)
RETURNS TABLE (
  turma_id UUID,
  disciplina_id UUID,
  aluno_id UUID,
  nota_p NUMERIC,
  nota_ti NUMERIC,
  nota_tg NUMERIC,
  nota_s NUMERIC,
  nota_cq NUMERIC,
  nota_o NUMERIC,
  nota_rec NUMERIC,
  total_aulas BIGINT,
  total_faltas BIGINT,
  frequencia_percent NUMERIC,
  media_parcial NUMERIC,
  media_final NUMERIC,
  resultado_final TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH alunos AS (
    SELECT id AS matricula_id, aluno_id
    FROM public.matriculas
    WHERE turma_id = p_turma_id
      AND status NOT IN ('CANCELADO', 'DESISTENTE', 'TRANSFERIDO')
  ),
  total_aulas AS (
    SELECT COUNT(*) AS total
    FROM public.aulas_turma
    WHERE turma_id = p_turma_id
      AND disciplina_id = p_disciplina_id
  ),
  faltas AS (
    SELECT aluno_id,
           COUNT(*) FILTER (WHERE status = 'F') AS total,
           COUNT(*) AS lancamentos
    FROM public.diario_frequencia
    WHERE turma_id = p_turma_id
      AND disciplina_id = p_disciplina_id
    GROUP BY aluno_id
  ),
  base AS (
    SELECT
      a.matricula_id,
      a.aluno_id,
      n.nota_p, n.nota_ti, n.nota_tg, n.nota_s,
      n.nota_cq, n.nota_o, n.nota_rec,
      ta.total AS aulas,
      COALESCE(f.total, 0) AS faltas,
      CASE
        WHEN ap.id IS NOT NULL THEN ap.frequencia_percent
        WHEN ta.total > 0 AND COALESCE(f.lancamentos, 0) = ta.total
          THEN ROUND(((ta.total - COALESCE(f.total, 0))::NUMERIC / ta.total) * 100)
        ELSE NULL
      END AS frequencia,
      CASE
        WHEN ap.id IS NOT NULL THEN ap.media_final
        WHEN n.aluno_id IS NULL THEN NULL
        ELSE LEAST(
          10.00,
          ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0
            + n.nota_cq + n.nota_o)::NUMERIC, 1)
        )
      END AS parcial,
      ap.id AS aproveitamento_id
    FROM alunos a
    CROSS JOIN total_aulas ta
    LEFT JOIN faltas f ON f.aluno_id = a.aluno_id
    LEFT JOIN public.diario_notas n
      ON n.turma_id = p_turma_id
     AND n.disciplina_id = p_disciplina_id
     AND n.aluno_id = a.aluno_id
    LEFT JOIN public.matricula_aproveitamentos ap
      ON ap.matricula_id = a.matricula_id
     AND ap.disciplina_id = p_disciplina_id
  ),
  finais AS (
    SELECT b.*,
      CASE
        WHEN b.parcial IS NULL THEN NULL
        WHEN b.nota_rec IS NOT NULL AND b.nota_rec > b.parcial THEN b.nota_rec
        ELSE b.parcial
      END AS final
    FROM base b
  )
  SELECT
    p_turma_id,
    p_disciplina_id,
    f.aluno_id,
    f.nota_p, f.nota_ti, f.nota_tg, f.nota_s,
    f.nota_cq, f.nota_o, f.nota_rec,
    f.aulas, f.faltas, f.frequencia, f.parcial, f.final,
    CASE
      WHEN f.aproveitamento_id IS NOT NULL THEN 'APROVEITADO'
      WHEN f.parcial IS NULL THEN 'SEM_LANCAMENTO'
      WHEN f.frequencia IS NULL THEN 'FREQUENCIA_PENDENTE'
      WHEN f.frequencia < 75 THEN 'REPROVADO_FREQUENCIA'
      WHEN f.final >= 6 THEN 'APROVADO'
      WHEN f.nota_rec IS NULL THEN 'EM_RECUPERACAO'
      ELSE 'REPROVADO'
    END
  FROM finais f;
$$;

GRANT EXECUTE ON FUNCTION public.movimentar_matricula_academica(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, UUID
) TO anon, authenticated;
