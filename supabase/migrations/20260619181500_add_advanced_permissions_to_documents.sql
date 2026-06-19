-- Migration: 20260619181500_add_advanced_permissions_to_documents.sql
-- Description: Add advanced permissions and release rules to library documents.

ALTER TABLE public.biblioteca_documentos
ADD COLUMN IF NOT EXISTS curso_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS turma_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS disciplina_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS liberacao_tipo TEXT NOT NULL DEFAULT 'IMEDIATO' CHECK (liberacao_tipo IN ('IMEDIATO', 'POR_DATA', 'DISCIPLINA_INICIO')),
ADD COLUMN IF NOT EXISTS liberacao_data TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS liberacao_disciplina_id UUID REFERENCES public.disciplinas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS liberacao_dias_validade INTEGER;
