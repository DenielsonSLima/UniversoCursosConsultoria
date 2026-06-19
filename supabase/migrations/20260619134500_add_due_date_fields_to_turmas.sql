-- Migração: Adição de dia_vencimento_padrao e cronograma_financeiro na tabela turmas
-- Autor: Antigravity

ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS dia_vencimento_padrao INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS cronograma_financeiro JSONB DEFAULT '[]'::jsonb;
