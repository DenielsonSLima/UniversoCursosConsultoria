-- Migração: Criação de Tabelas de Gestão de Aulas por Turma e Relação Turmas/Disciplinas
-- Autor: Antigravity

-- 1. TABELA: turmas_disciplinas (Armazena configurações operacionais de disciplinas na turma)
CREATE TABLE IF NOT EXISTS public.turmas_disciplinas (
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  professor_nome TEXT,
  professor_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (turma_id, disciplina_id)
);

ALTER TABLE public.turmas_disciplinas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total local turmas_disciplinas" ON public.turmas_disciplinas;
CREATE POLICY "Acesso total local turmas_disciplinas" ON public.turmas_disciplinas FOR ALL USING (true) WITH CHECK (true);

-- 2. TABELA: aulas_turma (Armazena aulas operacionais criadas especificamente para uma turma/disciplina)
CREATE TABLE IF NOT EXISTS public.aulas_turma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  carga_horaria NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aulas_turma ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total local aulas_turma" ON public.aulas_turma;
CREATE POLICY "Acesso total local aulas_turma" ON public.aulas_turma FOR ALL USING (true) WITH CHECK (true);

-- 3. HABILITAR REALTIME
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.turmas_disciplinas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.aulas_turma;
COMMIT;
