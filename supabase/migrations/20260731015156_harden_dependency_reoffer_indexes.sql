BEGIN;

-- Versão local alinhada ao registro criado pelo MCP Supabase.

-- Índices de suporte às FKs do fluxo de dependência. Além das consultas
-- operacionais, eles evitam varreduras integrais durante UPDATE/DELETE das
-- entidades referenciadas.
CREATE INDEX IF NOT EXISTS politicas_cobranca_dependencia_curso_idx
  ON public.politicas_cobranca_dependencia (curso_id)
  WHERE curso_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS politicas_cobranca_dependencia_polo_idx
  ON public.politicas_cobranca_dependencia (polo_id)
  WHERE polo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS politicas_cobranca_dependencia_disciplina_idx
  ON public.politicas_cobranca_dependencia (disciplina_id)
  WHERE disciplina_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS matricula_componentes_disciplina_idx
  ON public.matricula_componentes (disciplina_id);

CREATE INDEX IF NOT EXISTS matricula_disciplina_tentativas_politica_idx
  ON public.matricula_disciplina_tentativas (politica_id);

CREATE INDEX IF NOT EXISTS matricula_disciplina_tentativas_turma_origem_idx
  ON public.matricula_disciplina_tentativas (turma_origem_id);

CREATE INDEX IF NOT EXISTS matricula_dependencia_eventos_conta_receber_idx
  ON public.matricula_dependencia_eventos (conta_receber_id)
  WHERE conta_receber_id IS NOT NULL;

COMMIT;
