-- Migração: Adição de campos area, descricao e versao para Cursos e descricao para Disciplinas
-- Autor: Antigravity

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS area TEXT DEFAULT 'Outros';
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT '';
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS versao TEXT DEFAULT '1.0';

ALTER TABLE public.disciplinas ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT '';

-- Atualiza dados existentes com valores padrão
UPDATE public.cursos SET area = 'Saúde' WHERE nome LIKE '%Enfermagem%' OR nome LIKE '%Radiologia%' OR nome LIKE '%Cirúrgica%';
UPDATE public.cursos SET area = 'Gestão' WHERE nome LIKE '%Segurança%' OR nome LIKE '%Excel%';
UPDATE public.cursos SET area = 'Outros' WHERE area IS NULL;
