-- Migração: Adicionar campo data_aula na tabela public.aulas_turma
-- Autor: Antigravity

ALTER TABLE public.aulas_turma ADD COLUMN IF NOT EXISTS data_aula DATE;
