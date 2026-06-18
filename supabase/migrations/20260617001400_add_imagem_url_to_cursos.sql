-- Migração: Adição de campo imagem_url para Cursos
-- Autor: Antigravity

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS imagem_url TEXT;
