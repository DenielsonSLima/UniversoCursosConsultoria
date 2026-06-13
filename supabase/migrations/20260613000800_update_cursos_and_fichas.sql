-- Migração: Criação de Tabelas para Grade Curricular, Ficha de Matrícula e Checklist de Estágio
-- Autor: Antigravity

-- ========================================================
-- 1. TABELA: MODULOS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local modulos" ON public.modulos FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 2. TABELA: DISCIPLINAS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.disciplinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id UUID NOT NULL REFERENCES public.modulos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  carga_horaria INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.disciplinas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local disciplinas" ON public.disciplinas FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 3. TABELA: AULAS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.aulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  carga_horaria NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local aulas" ON public.aulas FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 4. TABELA: MODELOS_FICHAS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.modelos_fichas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo_curso TEXT NOT NULL, -- 'Ensino Superior' | 'Cursos Técnicos' | 'Cursos Livres'
  status TEXT NOT NULL DEFAULT 'ativo',
  requer_assinatura BOOLEAN NOT NULL DEFAULT true,
  texto_contrato TEXT,
  campos_customizados JSONB DEFAULT '[]',
  curso_especifico_id UUID REFERENCES public.cursos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.modelos_fichas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local modelos_fichas" ON public.modelos_fichas FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 5. TABELA: CONFIG_CHECKLIST_ESTAGIO
-- ========================================================
CREATE TABLE IF NOT EXISTS public.config_checklist_estagio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id UUID UNIQUE NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  instrumentos_avaliativos JSONB DEFAULT '[]',
  checklist_ucs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.config_checklist_estagio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local config_checklist_estagio" ON public.config_checklist_estagio FOR ALL USING (true) WITH CHECK (true);

-- HABILITAR REALTIME
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.modulos;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.disciplinas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.aulas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.modelos_fichas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.config_checklist_estagio;
COMMIT;
