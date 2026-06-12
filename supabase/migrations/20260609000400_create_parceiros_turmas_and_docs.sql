-- Migração: Criação de Tabelas de Parceiros, Cursos, Turmas, Matrículas e Documentação
-- Autor: Antigravity

-- ========================================================
-- 1. TABELA: CURSOS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.cursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  modalidade TEXT NOT NULL CHECK (modalidade IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD', 'SUPERIOR')),
  carga_horaria INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo', -- 'ativo' | 'inativo'
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local cursos" ON public.cursos FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 2. TABELA: PARCEIROS (Unified Aluno, Professor, PJ, PF)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.parceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('Aluno', 'Professor', 'PJ', 'PF')),
  nome TEXT NOT NULL,
  cpf_cnpj TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf VARCHAR(2),
  polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo', -- 'ativo' | 'inativo' | 'trancado' | 'formado'
  observacao TEXT,
  foto_url TEXT,
  
  -- Aluno Specific Fields
  data_nascimento DATE,
  sexo TEXT,
  rg TEXT,
  orgao_emissor TEXT,
  nacionalidade TEXT DEFAULT 'Brasileira',
  naturalidade TEXT,
  titulo_eleitor TEXT,
  reservista TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  nome_social TEXT,
  responsavel_nome TEXT,
  responsavel_cpf TEXT,
  responsavel_parentesco TEXT,

  -- Professor Specific Fields
  especialidade TEXT,

  -- PJ Specific Fields
  tipo_pj TEXT, -- 'Prefeitura' | 'Empresa Privada'

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local parceiros" ON public.parceiros FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 3. TABELA: TURMAS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.turmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
  data_inicio DATE,
  data_previsao_termino DATE,
  turno TEXT NOT NULL CHECK (turno IN ('MATUTINO', 'VESPERTINO', 'NOTURNO', 'EAD')),
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'FINALIZADA')),
  vagas_totais INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local turmas" ON public.turmas FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 4. TABELA: MATRÍCULAS
-- ========================================================
CREATE TABLE IF NOT EXISTS public.matriculas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'trancado', 'cancelado', 'concluido')),
  data_matricula TIMESTAMPTZ DEFAULT now(),
  UNIQUE (aluno_id, turma_id)
);

ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local matriculas" ON public.matriculas FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 5. TABELA: DOCUMENTOS DO ALUNO
-- ========================================================
CREATE TABLE IF NOT EXISTS public.documentos_aluno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  nome_documento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'entregue', 'rejeitado')),
  arquivo_url TEXT,
  observacao TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (aluno_id, nome_documento)
);

ALTER TABLE public.documentos_aluno ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local documentos_aluno" ON public.documentos_aluno FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 6. TRIGGER: AUTO-CRIAR CHECKLIST DE DOCUMENTOS PARA ALUNOS
-- ========================================================
CREATE OR REPLACE FUNCTION public.criar_checklist_documentos_aluno()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'Aluno' THEN
    INSERT INTO public.documentos_aluno (aluno_id, nome_documento, status)
    VALUES
      (NEW.id, 'RG / CNH (Frente e Verso)', 'pendente'),
      (NEW.id, 'CPF', 'pendente'),
      (NEW.id, 'Comprovante de Residência', 'pendente'),
      (NEW.id, 'Histórico Escolar', 'pendente'),
      (NEW.id, 'Certidão de Nascimento/Casamento', 'pendente'),
      (NEW.id, 'Foto 3x4', 'pendente')
    ON CONFLICT (aluno_id, nome_documento) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_criar_checklist_documentos_aluno
AFTER INSERT ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.criar_checklist_documentos_aluno();

-- ========================================================
-- 7. BUCKET DE STORAGE E POLÍCIAS DE ARQUIVOS
-- ========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Permissao insercao storage" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "Permissao leitura storage" ON storage.objects FOR SELECT USING (bucket_id = 'documentos');
CREATE POLICY "Permissao atualizacao storage" ON storage.objects FOR UPDATE USING (bucket_id = 'documentos');
CREATE POLICY "Permissao delecao storage" ON storage.objects FOR DELETE USING (bucket_id = 'documentos');

-- ========================================================
-- 8. SEED DE DADOS INICIAIS
-- ========================================================

-- Cursos Seeds
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Técnico em Enfermagem', 'TECNICO', 1200),
  ('c0000000-0000-0000-0000-000000000002', 'Técnico em Radiologia', 'TECNICO', 1200),
  ('c0000000-0000-0000-0000-000000000003', 'Excel Avançado para Negócios', 'LIVRE', 40),
  ('c0000000-0000-0000-0000-000000000004', 'Especialização em Instrumentação Cirúrgica', 'ESPECIALIZACAO', 360),
  ('c0000000-0000-0000-0000-000000000005', 'Gestão Hospitalar EAD', 'EAD', 800)
ON CONFLICT (id) DO NOTHING;

-- Turmas Seeds
-- Polo Matriz: '44444444-4444-4444-4444-444444444444'
-- Polo Estância: '55555555-5555-5555-5555-555555555555'
INSERT INTO public.turmas (id, codigo, nome, curso_id, polo_id, data_inicio, data_previsao_termino, turno, status, vagas_totais)
VALUES
  ('d0000000-0000-0000-0000-000000000001', '2024.1-ENF-N-JAP', 'Técnico em Enfermagem - Noturno - 2024.1', 'c0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '2024-02-01', '2026-02-01', 'NOTURNO', 'EM_ANDAMENTO', 40),
  ('d0000000-0000-0000-0000-000000000002', '2023.2-RAD-M-AQU', 'Técnico em Radiologia - Matutino - 2023.2', 'c0000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', '2023-08-01', '2025-02-01', 'MATUTINO', 'FINALIZADA', 30),
  ('d0000000-0000-0000-0000-000000000003', 'LIVRE-EXCEL-N-JAP', 'Excel Avançado - Noturno', 'c0000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', '2024-03-10', '2024-04-10', 'NOTURNO', 'EM_ANDAMENTO', 20),
  ('d0000000-0000-0000-0000-000000000004', 'ESP-INST-V-POR', 'Espec. Instrumentação - Vespertino', 'c0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', '2024-01-15', '2024-07-15', 'VESPERTINO', 'EM_ANDAMENTO', 25),
  ('d0000000-0000-0000-0000-000000000005', '2024.1-GEST-EAD', 'Gestão Hospitalar - EAD - 2024.1', 'c0000000-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444', '2024-02-01', '2025-02-01', 'EAD', 'EM_ANDAMENTO', 100)
ON CONFLICT (id) DO NOTHING;
-- Parceiros and Matrículas tables start empty to allow custom registrations during testing.


-- HABILITAR REALTIME PARA AS NOVAS TABELAS
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cursos;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.parceiros;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.turmas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matriculas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos_aluno;
COMMIT;

-- ========================================================
-- 9. RPC: BUSCAR KPIS DE PARCEIROS
-- ========================================================
CREATE OR REPLACE FUNCTION public.get_parceiros_kpis()
RETURNS TABLE (
  total_parceiros BIGINT,
  total_alunos BIGINT,
  total_professores BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(COUNT(*), 0)::BIGINT AS total_parceiros,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno'), 0)::BIGINT AS total_alunos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor'), 0)::BIGINT AS total_professores
  FROM public.parceiros;
END;
$$ LANGUAGE plpgsql;

