BEGIN;

-- Dados escolares explícitos do aluno. Os campos permanecem opcionais para não
-- invalidar cadastros legados incompletos; a obrigatoriedade no ato da inscrição
-- deve ser validada pelo fluxo técnico que consumir estes dados.
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS situacao_ensino_medio text,
  ADD COLUMN IF NOT EXISTS serie_ensino_medio_atual smallint,
  ADD COLUMN IF NOT EXISTS escola_ensino_medio text,
  ADD COLUMN IF NOT EXISTS ano_previsto_conclusao_ensino_medio smallint;

COMMENT ON COLUMN public.parceiros.situacao_ensino_medio IS
  'Situação escolar para ingresso técnico: CURSANDO ou CONCLUIDO.';
COMMENT ON COLUMN public.parceiros.serie_ensino_medio_atual IS
  'Série atual do ensino médio (2 ou 3), quando a situação for CURSANDO.';
COMMENT ON COLUMN public.parceiros.escola_ensino_medio IS
  'Escola em que o aluno cursa ou concluiu o ensino médio.';
COMMENT ON COLUMN public.parceiros.ano_previsto_conclusao_ensino_medio IS
  'Ano previsto de conclusão, informado apenas para aluno que ainda está cursando.';

-- Backfill conservador: somente valores legados que possuem significado
-- inequívoco são convertidos. ENSINO MÉDIO INCOMPLETO não significa, por si só,
-- que o aluno ainda esteja matriculado e por isso não é inferido como CURSANDO.
UPDATE public.parceiros
SET situacao_ensino_medio = CASE
  WHEN upper(btrim(escolaridade_anterior)) = 'ENSINO MÉDIO COMPLETO' THEN 'CONCLUIDO'
  WHEN upper(btrim(escolaridade_anterior)) = 'CURSANDO ENSINO MÉDIO' THEN 'CURSANDO'
  ELSE situacao_ensino_medio
END
WHERE tipo = 'Aluno'
  AND situacao_ensino_medio IS NULL
  AND upper(btrim(escolaridade_anterior)) IN (
    'ENSINO MÉDIO COMPLETO',
    'CURSANDO ENSINO MÉDIO'
  );

UPDATE public.parceiros
SET escola_ensino_medio = NULLIF(btrim(instituicao_origem), '')
WHERE tipo = 'Aluno'
  AND escola_ensino_medio IS NULL
  AND NULLIF(btrim(instituicao_origem), '') IS NOT NULL
  AND situacao_ensino_medio IN ('CURSANDO', 'CONCLUIDO');

ALTER TABLE public.parceiros
  DROP CONSTRAINT IF EXISTS parceiros_situacao_ensino_medio_check,
  DROP CONSTRAINT IF EXISTS parceiros_serie_ensino_medio_atual_check,
  DROP CONSTRAINT IF EXISTS parceiros_escola_ensino_medio_not_blank_check,
  DROP CONSTRAINT IF EXISTS parceiros_ano_previsto_conclusao_ensino_medio_check,
  DROP CONSTRAINT IF EXISTS parceiros_dados_ensino_medio_coerentes_check;

ALTER TABLE public.parceiros
  ADD CONSTRAINT parceiros_situacao_ensino_medio_check
    CHECK (
      situacao_ensino_medio IS NULL
      OR situacao_ensino_medio IN ('CURSANDO', 'CONCLUIDO')
    ),
  ADD CONSTRAINT parceiros_serie_ensino_medio_atual_check
    CHECK (
      serie_ensino_medio_atual IS NULL
      OR serie_ensino_medio_atual BETWEEN 2 AND 3
    ),
  ADD CONSTRAINT parceiros_escola_ensino_medio_not_blank_check
    CHECK (
      escola_ensino_medio IS NULL
      OR btrim(escola_ensino_medio) <> ''
    ),
  ADD CONSTRAINT parceiros_ano_previsto_conclusao_ensino_medio_check
    CHECK (
      ano_previsto_conclusao_ensino_medio IS NULL
      OR ano_previsto_conclusao_ensino_medio BETWEEN 1900 AND 2200
    ),
  ADD CONSTRAINT parceiros_dados_ensino_medio_coerentes_check
    CHECK (
      coalesce(situacao_ensino_medio = 'CURSANDO', false)
      OR (
        serie_ensino_medio_atual IS NULL
        AND ano_previsto_conclusao_ensino_medio IS NULL
      )
    );

-- Regras de elegibilidade por turma técnica. O padrão do banco preserva o
-- comportamento legado (subsequente). A interface de novas turmas pode optar
-- explicitamente por concomitante a partir da série mínima configurada.
ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS aceita_concomitante boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceita_subsequente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS serie_minima_ensino_medio smallint NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.turmas.aceita_concomitante IS
  'Permite aluno que ainda cursa o ensino médio.';
COMMENT ON COLUMN public.turmas.aceita_subsequente IS
  'Permite aluno que já concluiu o ensino médio.';
COMMENT ON COLUMN public.turmas.serie_minima_ensino_medio IS
  'Série mínima aceita quando a turma permite ingresso concomitante.';

-- A turma técnica que já está divulgada para matrícula online deve aceitar a
-- jornada concomitante definida para a landing (a partir da 2ª série).
UPDATE public.turmas t
SET aceita_concomitante = true,
    serie_minima_ensino_medio = 2
FROM public.cursos c
WHERE c.id = t.curso_id
  AND c.modalidade = 'TECNICO'
  AND t.status = 'INSCRICOES_ABERTAS'
  AND coalesce(t.permitir_inscricoes_online, false);

ALTER TABLE public.turmas
  DROP CONSTRAINT IF EXISTS turmas_serie_minima_ensino_medio_check,
  DROP CONSTRAINT IF EXISTS turmas_forma_ingresso_ensino_medio_check;

ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_serie_minima_ensino_medio_check
    CHECK (serie_minima_ensino_medio BETWEEN 2 AND 3),
  ADD CONSTRAINT turmas_forma_ingresso_ensino_medio_check
    CHECK (aceita_concomitante OR aceita_subsequente);

COMMIT;
