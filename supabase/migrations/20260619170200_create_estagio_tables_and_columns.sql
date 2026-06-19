-- Migração: Criação de tabelas e colunas para o Módulo de Estágio Supervisionado
-- Autor: Antigravity

-- 1. ADICIONAR COLUNAS NA TABELA: disciplinas (Desmembramento de Carga Horária)
ALTER TABLE public.disciplinas 
ADD COLUMN IF NOT EXISTS carga_horaria_teoria INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS carga_horaria_pratica INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS carga_horaria_estagio INT DEFAULT 0;

-- 2. CRIAR TABELA: matriculas_estagios (Avaliações e Checklist de Estágio do Aluno)
CREATE TABLE IF NOT EXISTS public.matriculas_estagios (
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  nota_comportamento NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_comportamento BETWEEN 0.0 AND 2.0),
  nota_registros NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_registros BETWEEN 0.0 AND 2.0),
  nota_tecnicas NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_tecnicas BETWEEN 0.0 AND 6.0),
  nota_final NUMERIC(4,2) GENERATED ALWAYS AS (nota_comportamento + nota_registros + nota_tecnicas) STORED,
  frequencia_estagio NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (frequencia_estagio BETWEEN 0.0 AND 100.0),
  criterios_detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  checklist_procedimentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  perfil_aluno TEXT NOT NULL DEFAULT '',
  instrutor_nome TEXT NOT NULL DEFAULT '',
  data_avaliacao DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (turma_id, disciplina_id, aluno_id)
);

-- 3. HABILITAR SEGURANÇA EM NÍVEL DE LINHA (RLS) E POLÍTICAS
ALTER TABLE public.matriculas_estagios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total local matriculas_estagios" ON public.matriculas_estagios;
CREATE POLICY "Acesso total local matriculas_estagios" ON public.matriculas_estagios FOR ALL USING (true) WITH CHECK (true);

-- 4. ADICIONAR TABELA À PUBLICAÇÃO REALTIME DO SUPABASE
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matriculas_estagios;
COMMIT;
