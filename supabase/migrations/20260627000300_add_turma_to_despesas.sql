-- ============================================================
-- Migração: Adicionar vínculo com Turmas em Lançamento de Despesa
-- ============================================================

ALTER TABLE despesas_lancamentos
  ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_despesas_turma_id ON despesas_lancamentos(turma_id);
