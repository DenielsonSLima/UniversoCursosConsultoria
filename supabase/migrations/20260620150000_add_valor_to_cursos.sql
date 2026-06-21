-- Migration: 20260620150000_add_valor_to_cursos.sql
-- Description: Adiciona coluna valor para os cursos (livres, especialização, técnico) para fins de divulgação no site público.

ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS valor NUMERIC(10, 2);
