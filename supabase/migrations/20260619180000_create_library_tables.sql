-- Migration: 20260619180000_create_library_tables.sql
-- Description: Create biblioteca_pastas and biblioteca_documentos tables with RLS and realtime.

-- ========================================================
-- 1. TABELA: PASTAS DA BIBLIOTECA
-- ========================================================
CREATE TABLE IF NOT EXISTS public.biblioteca_pastas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  parent_id UUID REFERENCES public.biblioteca_pastas(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.parceiros(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================================
-- 2. TABELA: DOCUMENTOS DA BIBLIOTECA
-- ========================================================
CREATE TABLE IF NOT EXISTS public.biblioteca_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pasta_id UUID REFERENCES public.biblioteca_pastas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo_arquivo TEXT NOT NULL CHECK (tipo_arquivo IN ('PDF', 'DOC', 'XLS', 'IMG', 'VIDEO', 'OTHER')),
  tamanho TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  publico_alvo TEXT NOT NULL DEFAULT 'TODOS' CHECK (publico_alvo IN ('ALUNOS', 'PROFESSORES', 'INTERNO', 'TODOS')),
  abrangencia TEXT NOT NULL DEFAULT 'GLOBAL' CHECK (abrangencia IN ('GLOBAL', 'POLO_ESPECIFICO')),
  polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL,
  acessos INTEGER NOT NULL DEFAULT 0,
  teacher_id UUID REFERENCES public.parceiros(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT 'Gestor',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================================
-- 3. SEGURANÇA (RLS)
-- ========================================================
ALTER TABLE public.biblioteca_pastas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local biblioteca_pastas" ON public.biblioteca_pastas FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.biblioteca_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local biblioteca_documentos" ON public.biblioteca_documentos FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 4. REALTIME PUBLICATION
-- ========================================================
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.biblioteca_pastas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.biblioteca_documentos;
COMMIT;
