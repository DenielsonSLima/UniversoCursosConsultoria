-- Migration: 20260620140000_add_soft_delete_to_comunicacao_chats.sql
-- Description:
--   - Adiciona coluna deleted_by_aluno para soft-delete pelo lado do aluno
--   - O aluno pode "apagar" o chamado da sua visão sem apagar nada do banco
--   - O gestor faz hard-delete real (removendo arquivos via código)

ALTER TABLE public.comunicacao_chats
  ADD COLUMN IF NOT EXISTS deleted_by_aluno BOOLEAN NOT NULL DEFAULT false;

-- Index para filtrar mais rápido
CREATE INDEX IF NOT EXISTS idx_comunicacao_chats_deleted_by_aluno
  ON public.comunicacao_chats (deleted_by_aluno);
