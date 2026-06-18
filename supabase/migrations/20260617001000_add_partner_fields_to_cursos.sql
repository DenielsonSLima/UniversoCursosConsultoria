-- Migração: Adição de campos parceiro_instituicao e parceiro_logo_url para cursos superiores
-- Autor: Antigravity

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS parceiro_instituicao TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS parceiro_logo_url TEXT;
