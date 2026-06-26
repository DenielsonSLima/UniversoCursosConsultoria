-- Consolidação do ciclo acadêmico dos cursos técnicos.
-- Toda mudança crítica é transacional, auditável e executada no PostgreSQL.

ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS matriculas_status_check;

ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_status_check
  CHECK (status IN (
    'ATIVO',
    'TRANCADO',
    'CANCELADO',
    'CONCLUIDO',
    'DESISTENTE',
    'TRANSFERIDO'
  ));

CREATE TABLE IF NOT EXISTS public.periodos_letivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  modulo_id UUID REFERENCES public.modulos(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL CHECK (ordem > 0),
  data_inicio DATE,
  data_fim DATE,
  status TEXT NOT NULL DEFAULT 'ABERTO'
    CHECK (status IN ('ABERTO', 'EM_FECHAMENTO', 'FECHADO')),
  fechado_em TIMESTAMPTZ,
  fechado_por UUID,
  reaberto_em TIMESTAMPTZ,
  reaberto_por UUID,
  motivo_reabertura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio),
  UNIQUE (turma_id, ordem),
  UNIQUE NULLS NOT DISTINCT (turma_id, modulo_id)
);

CREATE INDEX IF NOT EXISTS periodos_letivos_turma_status_idx
  ON public.periodos_letivos (turma_id, status, ordem);

ALTER TABLE public.turmas_disciplinas
  ADD COLUMN IF NOT EXISTS periodo_letivo_id UUID
  REFERENCES public.periodos_letivos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS turmas_disciplinas_periodo_idx
  ON public.turmas_disciplinas (periodo_letivo_id);

CREATE TABLE IF NOT EXISTS public.matricula_movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id UUID NOT NULL REFERENCES public.matriculas(id) ON DELETE RESTRICT,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'MATRICULA',
    'TRANCAMENTO',
    'DESISTENCIA',
    'REATIVACAO',
    'TRANSFERENCIA_INTERNA',
    'TRANSFERENCIA_EXTERNA_ENVIADA',
    'TRANSFERENCIA_EXTERNA_RECEBIDA',
    'CONCLUSAO'
  )),
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  turma_origem_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  turma_destino_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL,
  observacao TEXT,
  data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_retorno_prevista DATE,
  responsavel_id UUID,
  metadados JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matricula_movimentacoes_matricula_idx
  ON public.matricula_movimentacoes (matricula_id, created_at DESC);
CREATE INDEX IF NOT EXISTS matricula_movimentacoes_aluno_idx
  ON public.matricula_movimentacoes (aluno_id, created_at DESC);
CREATE INDEX IF NOT EXISTS matricula_movimentacoes_turma_origem_idx
  ON public.matricula_movimentacoes (turma_origem_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.transferencias_academicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  matricula_origem_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  matricula_destino_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'INTERNA_TURMA',
    'INTERNA_POLO',
    'EXTERNA_ENVIADA',
    'EXTERNA_RECEBIDA'
  )),
  turma_origem_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  turma_destino_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  instituicao_origem TEXT,
  instituicao_destino TEXT,
  curso_origem TEXT,
  curso_destino TEXT,
  motivo TEXT NOT NULL,
  observacao TEXT,
  data_transferencia DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'CONCLUIDA'
    CHECK (status IN ('SOLICITADA', 'CONCLUIDA', 'CANCELADA')),
  responsavel_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transferencias_academicas_aluno_idx
  ON public.transferencias_academicas (aluno_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transferencias_academicas_origem_idx
  ON public.transferencias_academicas (turma_origem_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transferencias_academicas_destino_idx
  ON public.transferencias_academicas (turma_destino_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fechamentos_academicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_letivo_id UUID NOT NULL REFERENCES public.periodos_letivos(id) ON DELETE RESTRICT,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL DEFAULT 'PERIODO' CHECK (tipo IN ('PERIODO', 'TURMA')),
  status TEXT NOT NULL DEFAULT 'FECHADO' CHECK (status IN ('FECHADO', 'REABERTO')),
  resumo JSONB NOT NULL DEFAULT '{}'::JSONB,
  fechado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_por UUID,
  reaberto_em TIMESTAMPTZ,
  reaberto_por UUID,
  motivo_reabertura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fechamentos_academicos_periodo_idx
  ON public.fechamentos_academicos (periodo_letivo_id, fechado_em DESC);
CREATE INDEX IF NOT EXISTS fechamentos_academicos_turma_idx
  ON public.fechamentos_academicos (turma_id, fechado_em DESC);

CREATE OR REPLACE FUNCTION public.validar_turma_unica_ead()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cursos c
    WHERE c.id = NEW.curso_id
      AND c.modalidade = 'EAD'
  ) AND EXISTS (
    SELECT 1
    FROM public.turmas t
    WHERE t.curso_id = NEW.curso_id
      AND t.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Este curso EAD já possui uma turma operacional.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_turma_unica_ead_trigger ON public.turmas;
CREATE TRIGGER validar_turma_unica_ead_trigger
BEFORE INSERT OR UPDATE OF curso_id ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.validar_turma_unica_ead();

ALTER TABLE public.periodos_letivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matricula_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_academicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos_academicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura periodos letivos" ON public.periodos_letivos;
CREATE POLICY "Leitura periodos letivos"
  ON public.periodos_letivos FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Leitura movimentacoes matricula" ON public.matricula_movimentacoes;
CREATE POLICY "Leitura movimentacoes matricula"
  ON public.matricula_movimentacoes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Leitura transferencias academicas" ON public.transferencias_academicas;
CREATE POLICY "Leitura transferencias academicas"
  ON public.transferencias_academicas FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Leitura fechamentos academicos" ON public.fechamentos_academicos;
CREATE POLICY "Leitura fechamentos academicos"
  ON public.fechamentos_academicos FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.periodos_letivos TO anon, authenticated;
GRANT SELECT ON public.matricula_movimentacoes TO anon, authenticated;
GRANT SELECT ON public.transferencias_academicas TO anon, authenticated;
GRANT SELECT ON public.fechamentos_academicos TO anon, authenticated;

-- Um período por módulo para cada turma técnica existente.
INSERT INTO public.periodos_letivos (
  turma_id,
  modulo_id,
  nome,
  ordem,
  data_inicio,
  data_fim
)
SELECT
  t.id,
  m.id,
  m.nome,
  ROW_NUMBER() OVER (
    PARTITION BY t.id
    ORDER BY m.nome, m.id
  )::INTEGER,
  t.data_inicio,
  t.data_previsao_termino
FROM public.turmas t
JOIN public.cursos c ON c.id = t.curso_id
JOIN public.modulos m ON m.curso_id = c.id
WHERE c.modalidade = 'TECNICO'
ON CONFLICT DO NOTHING;

-- Garante configuração turma/disciplina e associa cada disciplina ao período do módulo.
INSERT INTO public.turmas_disciplinas (
  turma_id,
  disciplina_id,
  periodo_letivo_id,
  concluida
)
SELECT
  t.id,
  d.id,
  pl.id,
  FALSE
FROM public.turmas t
JOIN public.cursos c ON c.id = t.curso_id
JOIN public.modulos m ON m.curso_id = c.id
JOIN public.disciplinas d ON d.modulo_id = m.id
JOIN public.periodos_letivos pl
  ON pl.turma_id = t.id
 AND pl.modulo_id = m.id
WHERE c.modalidade = 'TECNICO'
ON CONFLICT (turma_id, disciplina_id) DO UPDATE
SET periodo_letivo_id = EXCLUDED.periodo_letivo_id;

CREATE OR REPLACE FUNCTION public.sincronizar_periodos_turma_tecnica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cursos
    WHERE id = NEW.curso_id AND modalidade = 'TECNICO'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.periodos_letivos (
    turma_id, modulo_id, nome, ordem, data_inicio, data_fim
  )
  SELECT
    NEW.id,
    m.id,
    m.nome,
    ROW_NUMBER() OVER (ORDER BY m.nome, m.id)::INTEGER,
    NEW.data_inicio,
    NEW.data_previsao_termino
  FROM public.modulos m
  WHERE m.curso_id = NEW.curso_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.turmas_disciplinas (
    turma_id, disciplina_id, periodo_letivo_id, concluida
  )
  SELECT
    NEW.id,
    d.id,
    pl.id,
    FALSE
  FROM public.disciplinas d
  JOIN public.modulos m ON m.id = d.modulo_id
  JOIN public.periodos_letivos pl
    ON pl.turma_id = NEW.id
   AND pl.modulo_id = m.id
  WHERE m.curso_id = NEW.curso_id
  ON CONFLICT (turma_id, disciplina_id) DO UPDATE
    SET periodo_letivo_id = EXCLUDED.periodo_letivo_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_periodos_turma_tecnica_trigger ON public.turmas;
CREATE TRIGGER sincronizar_periodos_turma_tecnica_trigger
AFTER INSERT ON public.turmas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_periodos_turma_tecnica();

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

CREATE OR REPLACE FUNCTION public.matricular_aluno_turma(
  p_aluno_id UUID,
  p_turma_id UUID,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
BEGIN
  INSERT INTO public.matriculas (aluno_id, turma_id, status)
  VALUES (p_aluno_id, p_turma_id, 'ATIVO')
  ON CONFLICT (aluno_id, turma_id) DO UPDATE
    SET status = 'ATIVO'
  RETURNING * INTO v_matricula;

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_destino_id, motivo, responsavel_id
  ) VALUES (
    v_matricula.id, v_matricula.aluno_id, 'MATRICULA', NULL, 'ATIVO',
    v_matricula.turma_id, 'Matrícula realizada na turma.', p_responsavel_id
  );

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferir_matricula_academica(
  p_matricula_id UUID,
  p_tipo TEXT,
  p_motivo TEXT,
  p_turma_destino_id UUID DEFAULT NULL,
  p_instituicao_destino TEXT DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_data_transferencia DATE DEFAULT CURRENT_DATE,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origem public.matriculas%ROWTYPE;
  v_destino public.matriculas%ROWTYPE;
  v_tipo TEXT := UPPER(BTRIM(p_tipo));
  v_transferencia_id UUID;
BEGIN
  SELECT * INTO v_origem
  FROM public.matriculas
  WHERE id = p_matricula_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula de origem não encontrada.'; END IF;
  IF v_origem.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'Somente matrículas ativas podem ser transferidas.';
  END IF;
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da transferência.';
  END IF;

  IF v_tipo IN ('INTERNA_TURMA', 'INTERNA_POLO') THEN
    IF p_turma_destino_id IS NULL OR p_turma_destino_id = v_origem.turma_id THEN
      RAISE EXCEPTION 'Selecione uma turma de destino diferente da origem.';
    END IF;

    INSERT INTO public.matriculas (aluno_id, turma_id, status, data_matricula)
    VALUES (
      v_origem.aluno_id,
      p_turma_destino_id,
      'ATIVO',
      COALESCE(p_data_transferencia, CURRENT_DATE)::TIMESTAMPTZ
    )
    ON CONFLICT (aluno_id, turma_id) DO UPDATE
      SET status = 'ATIVO'
    RETURNING * INTO v_destino;

    UPDATE public.matriculas SET status = 'TRANSFERIDO'
    WHERE id = v_origem.id;
  ELSIF v_tipo = 'EXTERNA_ENVIADA' THEN
    IF NULLIF(BTRIM(p_instituicao_destino), '') IS NULL THEN
      RAISE EXCEPTION 'Informe a instituição de destino.';
    END IF;
    UPDATE public.matriculas SET status = 'TRANSFERIDO'
    WHERE id = v_origem.id;
  ELSE
    RAISE EXCEPTION 'Tipo de transferência inválido.';
  END IF;

  INSERT INTO public.transferencias_academicas (
    aluno_id, matricula_origem_id, matricula_destino_id, tipo,
    turma_origem_id, turma_destino_id, instituicao_destino,
    motivo, observacao, data_transferencia, responsavel_id
  ) VALUES (
    v_origem.aluno_id, v_origem.id, v_destino.id, v_tipo,
    v_origem.turma_id, p_turma_destino_id,
    NULLIF(BTRIM(p_instituicao_destino), ''),
    BTRIM(p_motivo), NULLIF(BTRIM(p_observacao), ''),
    COALESCE(p_data_transferencia, CURRENT_DATE), p_responsavel_id
  )
  RETURNING id INTO v_transferencia_id;

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_origem_id, turma_destino_id, motivo, observacao,
    data_movimentacao, responsavel_id,
    metadados
  ) VALUES (
    v_origem.id,
    v_origem.aluno_id,
    CASE WHEN v_tipo = 'EXTERNA_ENVIADA'
      THEN 'TRANSFERENCIA_EXTERNA_ENVIADA'
      ELSE 'TRANSFERENCIA_INTERNA'
    END,
    v_origem.status,
    'TRANSFERIDO',
    v_origem.turma_id,
    p_turma_destino_id,
    BTRIM(p_motivo),
    NULLIF(BTRIM(p_observacao), ''),
    COALESCE(p_data_transferencia, CURRENT_DATE),
    p_responsavel_id,
    jsonb_build_object(
      'transferencia_id', v_transferencia_id,
      'nova_matricula_id', v_destino.id,
      'instituicao_destino', NULLIF(BTRIM(p_instituicao_destino), '')
    )
  );

  IF v_destino.id IS NOT NULL THEN
    INSERT INTO public.matricula_movimentacoes (
      matricula_id, aluno_id, tipo, status_anterior, status_novo,
      turma_origem_id, turma_destino_id, motivo, observacao,
      data_movimentacao, responsavel_id,
      metadados
    ) VALUES (
      v_destino.id, v_destino.aluno_id, 'TRANSFERENCIA_INTERNA',
      NULL, 'ATIVO', v_origem.turma_id, v_destino.turma_id,
      BTRIM(p_motivo), NULLIF(BTRIM(p_observacao), ''),
      COALESCE(p_data_transferencia, CURRENT_DATE), p_responsavel_id,
      jsonb_build_object(
        'transferencia_id', v_transferencia_id,
        'matricula_origem_id', v_origem.id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'transferenciaId', v_transferencia_id,
    'matriculaOrigemId', v_origem.id,
    'matriculaDestinoId', v_destino.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receber_transferencia_externa(
  p_aluno_id UUID,
  p_turma_destino_id UUID,
  p_instituicao_origem TEXT,
  p_curso_origem TEXT,
  p_motivo TEXT,
  p_observacao TEXT DEFAULT NULL,
  p_data_transferencia DATE DEFAULT CURRENT_DATE,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS public.matriculas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula public.matriculas%ROWTYPE;
  v_transferencia_id UUID;
BEGIN
  IF NULLIF(BTRIM(p_instituicao_origem), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a instituição de origem.';
  END IF;
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da transferência.';
  END IF;

  INSERT INTO public.matriculas (aluno_id, turma_id, status, data_matricula)
  VALUES (
    p_aluno_id,
    p_turma_destino_id,
    'ATIVO',
    COALESCE(p_data_transferencia, CURRENT_DATE)::TIMESTAMPTZ
  )
  ON CONFLICT (aluno_id, turma_id) DO UPDATE SET status = 'ATIVO'
  RETURNING * INTO v_matricula;

  INSERT INTO public.transferencias_academicas (
    aluno_id, matricula_destino_id, tipo, turma_destino_id,
    instituicao_origem, curso_origem, motivo, observacao,
    data_transferencia, responsavel_id
  ) VALUES (
    p_aluno_id, v_matricula.id, 'EXTERNA_RECEBIDA', p_turma_destino_id,
    BTRIM(p_instituicao_origem), NULLIF(BTRIM(p_curso_origem), ''),
    BTRIM(p_motivo), NULLIF(BTRIM(p_observacao), ''),
    COALESCE(p_data_transferencia, CURRENT_DATE), p_responsavel_id
  )
  RETURNING id INTO v_transferencia_id;

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_destino_id, motivo, observacao, data_movimentacao,
    responsavel_id, metadados
  ) VALUES (
    v_matricula.id, p_aluno_id, 'TRANSFERENCIA_EXTERNA_RECEBIDA',
    NULL, 'ATIVO', p_turma_destino_id, BTRIM(p_motivo),
    NULLIF(BTRIM(p_observacao), ''),
    COALESCE(p_data_transferencia, CURRENT_DATE), p_responsavel_id,
    jsonb_build_object(
      'transferencia_id', v_transferencia_id,
      'instituicao_origem', BTRIM(p_instituicao_origem),
      'curso_origem', NULLIF(BTRIM(p_curso_origem), '')
    )
  );

  RETURN v_matricula;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pendencias_fechamento_periodo(
  p_periodo_letivo_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH periodo AS (
    SELECT * FROM public.periodos_letivos WHERE id = p_periodo_letivo_id
  ),
  disciplinas_periodo AS (
    SELECT td.disciplina_id, td.concluida
    FROM public.turmas_disciplinas td
    WHERE td.periodo_letivo_id = p_periodo_letivo_id
  ),
  alunos_ativos AS (
    SELECT m.aluno_id
    FROM public.matriculas m
    JOIN periodo p ON p.turma_id = m.turma_id
    WHERE m.status = 'ATIVO'
  ),
  sem_aula AS (
    SELECT dp.disciplina_id
    FROM disciplinas_periodo dp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.aulas_turma a
      JOIN periodo p ON p.turma_id = a.turma_id
      WHERE a.disciplina_id = dp.disciplina_id
    )
  ),
  sem_nota AS (
    SELECT aa.aluno_id, dp.disciplina_id
    FROM alunos_ativos aa
    CROSS JOIN disciplinas_periodo dp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.diario_notas dn
      JOIN periodo p ON p.turma_id = dn.turma_id
      WHERE dn.aluno_id = aa.aluno_id
        AND dn.disciplina_id = dp.disciplina_id
    )
  )
  SELECT jsonb_build_object(
    'disciplinasNaoConcluidas',
      (SELECT COUNT(*) FROM disciplinas_periodo WHERE concluida = FALSE),
    'disciplinasSemAula',
      (SELECT COUNT(*) FROM sem_aula),
    'lancamentosDeNotaPendentes',
      (SELECT COUNT(*) FROM sem_nota),
    'podeFechar',
      (SELECT COUNT(*) FROM disciplinas_periodo) > 0
      AND (SELECT COUNT(*) FROM disciplinas_periodo WHERE concluida = FALSE) = 0
      AND (SELECT COUNT(*) FROM sem_aula) = 0
      AND (SELECT COUNT(*) FROM sem_nota) = 0
  );
$$;

CREATE OR REPLACE FUNCTION public.get_turma_alunos_academico(
  p_turma_id UUID
)
RETURNS TABLE (
  matricula_id UUID,
  aluno_id UUID,
  nome TEXT,
  cpf TEXT,
  data_nascimento DATE,
  data_matricula TIMESTAMPTZ,
  status TEXT,
  frequencia_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    p.id,
    p.nome,
    p.cpf_cnpj,
    p.data_nascimento,
    m.data_matricula,
    m.status,
    ROUND(AVG(v.frequencia_percent), 1)
  FROM public.matriculas m
  JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.v_diario_notas_resultados v
    ON v.turma_id = m.turma_id
   AND v.aluno_id = m.aluno_id
  WHERE m.turma_id = p_turma_id
  GROUP BY m.id, p.id, p.nome, p.cpf_cnpj, p.data_nascimento, m.data_matricula, m.status
  ORDER BY p.nome;
$$;

CREATE OR REPLACE FUNCTION public.get_turma_resumo_academico(
  p_turma_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matriculas_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'ATIVO') AS ativos
    FROM public.matriculas
    WHERE turma_id = p_turma_id
  ),
  resultados AS (
    SELECT
      ROUND(AVG(frequencia_percent), 1) AS frequencia_media,
      COUNT(DISTINCT aluno_id) FILTER (
        WHERE resultado_final = 'REPROVADO'
           OR frequencia_percent < 75
      ) AS alunos_risco
    FROM public.v_diario_notas_resultados
    WHERE turma_id = p_turma_id
  ),
  disciplinas_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE concluida) AS concluidas
    FROM public.turmas_disciplinas
    WHERE turma_id = p_turma_id
  )
  SELECT jsonb_build_object(
    'totalMatriculas', ms.total,
    'alunosAtivos', ms.ativos,
    'frequenciaMedia', r.frequencia_media,
    'alunosEmRisco', r.alunos_risco,
    'progressoCurso', CASE
      WHEN ds.total > 0 THEN ROUND((ds.concluidas::NUMERIC / ds.total) * 100)
      ELSE NULL
    END
  )
  FROM matriculas_stats ms
  CROSS JOIN resultados r
  CROSS JOIN disciplinas_stats ds;
$$;

CREATE OR REPLACE FUNCTION public.get_diarios_turma(
  p_turma_id UUID
)
RETURNS TABLE (
  modulo_id UUID,
  modulo_nome TEXT,
  periodo_letivo_id UUID,
  periodo_status TEXT,
  disciplina_id UUID,
  disciplina_nome TEXT,
  professor_nome TEXT,
  carga_horaria NUMERIC,
  horas_realizadas NUMERIC,
  aulas_count BIGINT,
  progresso_percent NUMERIC,
  horas_status TEXT,
  horas_diferenca NUMERIC,
  concluida BOOLEAN,
  modulo_total_disciplinas BIGINT,
  modulo_progresso_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH horas AS (
    SELECT disciplina_id, SUM(carga_horaria) AS realizadas, COUNT(*) AS quantidade
    FROM public.aulas_turma
    WHERE turma_id = p_turma_id
    GROUP BY disciplina_id
  )
  SELECT
    mo.id,
    mo.nome,
    pl.id,
    COALESCE(pl.status, 'ABERTO'),
    d.id,
    d.nome,
    COALESCE(td.professor_nome, 'Não atribuído'),
    d.carga_horaria,
    COALESCE(h.realizadas, 0),
    COALESCE(h.quantidade, 0),
    CASE
      WHEN d.carga_horaria > 0
        THEN LEAST(100, ROUND((COALESCE(h.realizadas, 0) / d.carga_horaria) * 100, 1))
      ELSE 0
    END,
    CASE
      WHEN COALESCE(h.realizadas, 0) = d.carga_horaria THEN 'EXATA'
      WHEN COALESCE(h.realizadas, 0) > d.carga_horaria THEN 'EXCESSO'
      ELSE 'PENDENTE'
    END,
    ABS(d.carga_horaria - COALESCE(h.realizadas, 0)),
    COALESCE(td.concluida, FALSE),
    COUNT(*) OVER (PARTITION BY mo.id),
    ROUND(
      (
        (
          COUNT(*) FILTER (WHERE COALESCE(td.concluida, FALSE))
          OVER (PARTITION BY mo.id)
        )::NUMERIC
        / NULLIF(COUNT(*) OVER (PARTITION BY mo.id), 0)
      ) * 100
    )
  FROM public.turmas t
  JOIN public.modulos mo ON mo.curso_id = t.curso_id
  JOIN public.disciplinas d ON d.modulo_id = mo.id
  LEFT JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = d.id
  LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
  LEFT JOIN horas h ON h.disciplina_id = d.id
  WHERE t.id = p_turma_id
  ORDER BY pl.ordem NULLS LAST, mo.created_at, d.created_at, d.nome;
$$;

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
    SELECT aluno_id
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
    SELECT
      aluno_id,
      COUNT(*) FILTER (WHERE status = 'F') AS total,
      COUNT(*) AS lancamentos
    FROM public.diario_frequencia
    WHERE turma_id = p_turma_id
      AND disciplina_id = p_disciplina_id
    GROUP BY aluno_id
  ),
  base AS (
    SELECT
      a.aluno_id,
      n.nota_p,
      n.nota_ti,
      n.nota_tg,
      n.nota_s,
      n.nota_cq,
      n.nota_o,
      n.nota_rec,
      ta.total AS aulas,
      COALESCE(f.total, 0) AS faltas,
      CASE
        WHEN ta.total > 0 AND COALESCE(f.lancamentos, 0) = ta.total
          THEN ROUND(((ta.total - COALESCE(f.total, 0))::NUMERIC / ta.total) * 100)
        ELSE NULL
      END AS frequencia,
      CASE
        WHEN n.aluno_id IS NULL THEN NULL
        ELSE LEAST(
          10.00,
          ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0 + n.nota_cq + n.nota_o)::NUMERIC, 1)
        )
      END AS parcial
    FROM alunos a
    CROSS JOIN total_aulas ta
    LEFT JOIN faltas f ON f.aluno_id = a.aluno_id
    LEFT JOIN public.diario_notas n
      ON n.turma_id = p_turma_id
     AND n.disciplina_id = p_disciplina_id
     AND n.aluno_id = a.aluno_id
  ),
  finais AS (
    SELECT
      b.*,
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
    f.nota_p,
    f.nota_ti,
    f.nota_tg,
    f.nota_s,
    f.nota_cq,
    f.nota_o,
    f.nota_rec,
    f.aulas,
    f.faltas,
    f.frequencia,
    f.parcial,
    f.final,
    CASE
      WHEN f.parcial IS NULL THEN 'SEM_LANCAMENTO'
      WHEN f.frequencia IS NULL THEN 'FREQUENCIA_PENDENTE'
      WHEN f.frequencia < 75 THEN 'REPROVADO_FREQUENCIA'
      WHEN f.final >= 6 THEN 'APROVADO'
      WHEN f.nota_rec IS NULL THEN 'EM_RECUPERACAO'
      ELSE 'REPROVADO'
    END
  FROM finais f;
$$;

CREATE OR REPLACE FUNCTION public.fechar_periodo_letivo(
  p_periodo_letivo_id UUID,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS public.periodos_letivos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo public.periodos_letivos%ROWTYPE;
  v_pendencias JSONB;
  v_resumo JSONB;
BEGIN
  SELECT * INTO v_periodo
  FROM public.periodos_letivos
  WHERE id = p_periodo_letivo_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Período letivo não encontrado.'; END IF;
  IF v_periodo.status = 'FECHADO' THEN RAISE EXCEPTION 'O período já está fechado.'; END IF;

  v_pendencias := public.get_pendencias_fechamento_periodo(p_periodo_letivo_id);
  IF NOT COALESCE((v_pendencias ->> 'podeFechar')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'Existem pendências acadêmicas: %', v_pendencias::TEXT;
  END IF;

  SELECT jsonb_build_object(
    'pendencias', v_pendencias,
    'resultados', COALESCE(jsonb_agg(to_jsonb(r)), '[]'::JSONB)
  )
  INTO v_resumo
  FROM (
    SELECT v.*
    FROM public.v_diario_notas_resultados v
    JOIN public.turmas_disciplinas td
      ON td.turma_id = v.turma_id
     AND td.disciplina_id = v.disciplina_id
    WHERE td.periodo_letivo_id = p_periodo_letivo_id
  ) r;

  UPDATE public.periodos_letivos
  SET status = 'FECHADO',
      fechado_em = now(),
      fechado_por = p_responsavel_id,
      updated_at = now()
  WHERE id = p_periodo_letivo_id
  RETURNING * INTO v_periodo;

  INSERT INTO public.fechamentos_academicos (
    periodo_letivo_id, turma_id, resumo, fechado_por
  ) VALUES (
    v_periodo.id, v_periodo.turma_id, COALESCE(v_resumo, '{}'::JSONB), p_responsavel_id
  );

  RETURN v_periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_periodo_letivo(
  p_periodo_letivo_id UUID,
  p_motivo TEXT,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS public.periodos_letivos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo public.periodos_letivos%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da reabertura.';
  END IF;

  UPDATE public.periodos_letivos
  SET status = 'ABERTO',
      reaberto_em = now(),
      reaberto_por = p_responsavel_id,
      motivo_reabertura = BTRIM(p_motivo),
      updated_at = now()
  WHERE id = p_periodo_letivo_id
    AND status = 'FECHADO'
  RETURNING * INTO v_periodo;

  IF NOT FOUND THEN RAISE EXCEPTION 'O período não está fechado.'; END IF;

  UPDATE public.fechamentos_academicos
  SET status = 'REABERTO',
      reaberto_em = now(),
      reaberto_por = p_responsavel_id,
      motivo_reabertura = BTRIM(p_motivo)
  WHERE id = (
    SELECT id
    FROM public.fechamentos_academicos
    WHERE periodo_letivo_id = p_periodo_letivo_id
      AND status = 'FECHADO'
    ORDER BY fechado_em DESC
    LIMIT 1
  );

  RETURN v_periodo;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_turma_academica(
  p_turma_id UUID,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS public.turmas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_turma public.turmas%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.periodos_letivos WHERE turma_id = p_turma_id
  ) THEN
    RAISE EXCEPTION 'A turma não possui períodos letivos configurados.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.periodos_letivos
    WHERE turma_id = p_turma_id AND status <> 'FECHADO'
  ) THEN
    RAISE EXCEPTION 'Todos os períodos letivos devem estar fechados.';
  END IF;

  UPDATE public.turmas
  SET status = 'FINALIZADA'
  WHERE id = p_turma_id
  RETURNING * INTO v_turma;

  IF NOT FOUND THEN RAISE EXCEPTION 'Turma não encontrada.'; END IF;

  INSERT INTO public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_origem_id, motivo, responsavel_id
  )
  SELECT
    m.id, m.aluno_id, 'CONCLUSAO', m.status, 'CONCLUIDO',
    m.turma_id, 'Conclusão após fechamento acadêmico da turma.', p_responsavel_id
  FROM public.matriculas m
  WHERE m.turma_id = p_turma_id
    AND m.status = 'ATIVO';

  UPDATE public.matriculas
  SET status = 'CONCLUIDO'
  WHERE turma_id = p_turma_id
    AND status = 'ATIVO';

  RETURN v_turma;
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_avaliacao_estagio(
  p_criterios JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_comportamento NUMERIC(4,2);
  v_registros NUMERIC(4,2);
  v_tecnicas NUMERIC(4,2);
BEGIN
  SELECT COALESCE(SUM(COALESCE(NULLIF(item.value ->> 'nota', '')::NUMERIC, 0)), 0)
  INTO v_comportamento
  FROM jsonb_each(COALESCE(p_criterios -> 'Comportamento', '{}'::JSONB)) item;

  SELECT COALESCE(SUM(COALESCE(NULLIF(item.value ->> 'nota', '')::NUMERIC, 0)), 0)
  INTO v_registros
  FROM jsonb_each(COALESCE(p_criterios -> 'Desempenho nos Registros', '{}'::JSONB)) item;

  SELECT COALESCE(SUM(COALESCE(NULLIF(item.value ->> 'nota', '')::NUMERIC, 0)), 0)
  INTO v_tecnicas
  FROM jsonb_each(COALESCE(p_criterios -> 'Desempenho das Técnicas', '{}'::JSONB)) item;

  IF v_comportamento NOT BETWEEN 0 AND 2 THEN
    RAISE EXCEPTION 'A nota de comportamento deve ficar entre 0 e 2.';
  END IF;
  IF v_registros NOT BETWEEN 0 AND 2 THEN
    RAISE EXCEPTION 'A nota de registros deve ficar entre 0 e 2.';
  END IF;
  IF v_tecnicas NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'A nota de técnicas deve ficar entre 0 e 6.';
  END IF;

  RETURN jsonb_build_object(
    'comportamento', v_comportamento,
    'registros', v_registros,
    'tecnicas', v_tecnicas,
    'final', v_comportamento + v_registros + v_tecnicas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_avaliacao_estagio(
  p_turma_id UUID,
  p_disciplina_id UUID,
  p_aluno_id UUID,
  p_frequencia NUMERIC,
  p_criterios JSONB,
  p_checklist JSONB,
  p_perfil_aluno TEXT,
  p_instrutor_nome TEXT,
  p_data_avaliacao DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notas JSONB;
  v_avaliacao public.matriculas_estagios%ROWTYPE;
BEGIN
  IF p_frequencia NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'A frequência do estágio deve ficar entre 0 e 100.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.matriculas m
    WHERE m.turma_id = p_turma_id
      AND m.aluno_id = p_aluno_id
      AND m.status = 'ATIVO'
  ) THEN
    RAISE EXCEPTION 'O aluno não possui matrícula ativa nesta turma.';
  END IF;

  v_notas := public.calcular_avaliacao_estagio(COALESCE(p_criterios, '{}'::JSONB));

  INSERT INTO public.matriculas_estagios (
    turma_id,
    disciplina_id,
    aluno_id,
    nota_comportamento,
    nota_registros,
    nota_tecnicas,
    frequencia_estagio,
    criterios_detalhes,
    checklist_procedimentos,
    perfil_aluno,
    instrutor_nome,
    data_avaliacao
  )
  VALUES (
    p_turma_id,
    p_disciplina_id,
    p_aluno_id,
    (v_notas ->> 'comportamento')::NUMERIC,
    (v_notas ->> 'registros')::NUMERIC,
    (v_notas ->> 'tecnicas')::NUMERIC,
    p_frequencia,
    COALESCE(p_criterios, '{}'::JSONB),
    COALESCE(p_checklist, '[]'::JSONB),
    COALESCE(p_perfil_aluno, ''),
    COALESCE(p_instrutor_nome, ''),
    COALESCE(p_data_avaliacao, CURRENT_DATE)
  )
  ON CONFLICT (turma_id, disciplina_id, aluno_id)
  DO UPDATE SET
    nota_comportamento = EXCLUDED.nota_comportamento,
    nota_registros = EXCLUDED.nota_registros,
    nota_tecnicas = EXCLUDED.nota_tecnicas,
    frequencia_estagio = EXCLUDED.frequencia_estagio,
    criterios_detalhes = EXCLUDED.criterios_detalhes,
    checklist_procedimentos = EXCLUDED.checklist_procedimentos,
    perfil_aluno = EXCLUDED.perfil_aluno,
    instrutor_nome = EXCLUDED.instrutor_nome,
    data_avaliacao = EXCLUDED.data_avaliacao
  RETURNING * INTO v_avaliacao;

  RETURN to_jsonb(v_avaliacao);
END;
$$;

CREATE OR REPLACE FUNCTION public.bloquear_edicao_periodo_fechado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_turma_id UUID;
  v_disciplina_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_turma_id := OLD.turma_id;
    v_disciplina_id := OLD.disciplina_id;
  ELSE
    v_turma_id := NEW.turma_id;
    v_disciplina_id := NEW.disciplina_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.turmas_disciplinas td
    JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    WHERE td.turma_id = v_turma_id
      AND td.disciplina_id = v_disciplina_id
      AND pl.status = 'FECHADO'
  ) THEN
    RAISE EXCEPTION 'O período letivo desta disciplina está fechado.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloquear_diario_notas_periodo_fechado ON public.diario_notas;
CREATE TRIGGER bloquear_diario_notas_periodo_fechado
BEFORE INSERT OR UPDATE OR DELETE ON public.diario_notas
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_periodo_fechado();

DROP TRIGGER IF EXISTS bloquear_diario_frequencia_periodo_fechado ON public.diario_frequencia;
CREATE TRIGGER bloquear_diario_frequencia_periodo_fechado
BEFORE INSERT OR UPDATE OR DELETE ON public.diario_frequencia
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_periodo_fechado();

DROP TRIGGER IF EXISTS bloquear_diario_praticas_periodo_fechado ON public.diario_praticas;
CREATE TRIGGER bloquear_diario_praticas_periodo_fechado
BEFORE INSERT OR UPDATE OR DELETE ON public.diario_praticas
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_periodo_fechado();

DROP TRIGGER IF EXISTS bloquear_diario_observacoes_periodo_fechado ON public.diario_observacoes;
CREATE TRIGGER bloquear_diario_observacoes_periodo_fechado
BEFORE INSERT OR UPDATE OR DELETE ON public.diario_observacoes
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_periodo_fechado();

REVOKE ALL ON FUNCTION public.movimentar_matricula_academica(UUID, TEXT, TEXT, TEXT, DATE, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.matricular_aluno_turma(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transferir_matricula_academica(UUID, TEXT, TEXT, UUID, TEXT, TEXT, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receber_transferencia_externa(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pendencias_fechamento_periodo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_turma_alunos_academico(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_turma_resumo_academico(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_diarios_turma(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_diario_resultados(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fechar_periodo_letivo(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reabrir_periodo_letivo(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_turma_academica(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calcular_avaliacao_estagio(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salvar_avaliacao_estagio(UUID, UUID, UUID, NUMERIC, JSONB, JSONB, TEXT, TEXT, DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.movimentar_matricula_academica(UUID, TEXT, TEXT, TEXT, DATE, DATE, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.matricular_aluno_turma(UUID, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_matricula_academica(UUID, TEXT, TEXT, UUID, TEXT, TEXT, DATE, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receber_transferencia_externa(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pendencias_fechamento_periodo(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_turma_alunos_academico(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_turma_resumo_academico(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_diarios_turma(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_diario_resultados(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_periodo_letivo(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_periodo_letivo(UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_turma_academica(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_avaliacao_estagio(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_avaliacao_estagio(UUID, UUID, UUID, NUMERIC, JSONB, JSONB, TEXT, TEXT, DATE) TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.periodos_letivos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matricula_movimentacoes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transferencias_academicas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
