-- Migração: Adiciona flags de aceite de termos e controle de primeiro acesso no perfil do aluno
-- usado no fluxo EAD para forçar termo + atualização de senha na primeira entrada.

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS aceitou_termos_uso BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceitou_termos_uso_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termos_uso_versao TEXT DEFAULT '2026-06-25',
  ADD COLUMN IF NOT EXISTS troca_senha_obrigatoria BOOLEAN NOT NULL DEFAULT false;

UPDATE public.parceiros
SET aceitou_termos_uso = false
WHERE aceitou_termos_uso IS NULL;

UPDATE public.parceiros
SET troca_senha_obrigatoria = false
WHERE troca_senha_obrigatoria IS NULL;

