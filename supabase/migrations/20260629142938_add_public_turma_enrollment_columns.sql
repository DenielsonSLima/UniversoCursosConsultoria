-- Adiciona campos usados pelo catálogo público e pelo checkout para controlar
-- janela de inscrição, limite mínimo de vagas e bloqueio automático por lotação.

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS qtd_vagas_minima INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloquear_matriculas_apos_completar_vagas BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_inicio_inscricao DATE,
  ADD COLUMN IF NOT EXISTS data_fim_inscricao DATE;

