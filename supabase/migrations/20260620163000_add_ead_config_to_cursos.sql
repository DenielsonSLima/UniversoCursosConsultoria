-- Migration: Add ead_config to cursos table
-- Autor: Antigravity

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS ead_config JSONB DEFAULT '{}'::jsonb;
