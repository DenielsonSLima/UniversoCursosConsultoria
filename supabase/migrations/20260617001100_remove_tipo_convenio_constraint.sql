-- Migração: Remover restrição check de tipo_convenio para permitir categorias customizadas/dinâmicas
-- Autor: Antigravity

ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_tipo_convenio_check;
