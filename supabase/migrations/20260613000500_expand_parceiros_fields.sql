-- Migração: Expansão dos campos da tabela parceiros para suporte completo
-- a fichas de matrícula de cursos técnicos regulamentados (MEC/SETEC)
-- Autor: Antigravity

-- ========================================================
-- 1. CAMPOS PESSOAIS ADICIONAIS (Aluno e PF)
-- ========================================================
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS estado_civil TEXT CHECK (estado_civil IN ('Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Separado(a)')),
  ADD COLUMN IF NOT EXISTS pcd BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pcd_tipo TEXT,
  ADD COLUMN IF NOT EXISTS nome_social TEXT,
  ADD COLUMN IF NOT EXISTS rg_data_emissao DATE,
  ADD COLUMN IF NOT EXISTS rg_uf_emissao VARCHAR(2),
  ADD COLUMN IF NOT EXISTS responsavel_telefone TEXT;

-- ========================================================
-- 2. CAMPOS DE ESCOLARIDADE (Aluno)
-- ========================================================
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS escolaridade_anterior TEXT CHECK (escolaridade_anterior IN (
    'Ensino Médio Completo',
    'Ensino Médio Incompleto',
    'Ensino Superior Completo',
    'Ensino Superior Incompleto',
    'Pós-Graduação'
  )),
  ADD COLUMN IF NOT EXISTS instituicao_origem TEXT,
  ADD COLUMN IF NOT EXISTS ano_conclusao_ensino_medio TEXT;

-- ========================================================
-- 3. CAMPOS ACADÊMICOS E PROFISSIONAIS (Professor)
-- ========================================================
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS titulacao TEXT CHECK (titulacao IN ('Graduação', 'Especialização', 'Mestrado', 'Doutorado', 'Pós-Doutorado')),
  ADD COLUMN IF NOT EXISTS area_formacao TEXT,
  ADD COLUMN IF NOT EXISTS registro_profissional TEXT,   -- CRM, COREN, CRO...
  ADD COLUMN IF NOT EXISTS numero_registro TEXT,
  ADD COLUMN IF NOT EXISTS instituicao_formacao TEXT,
  ADD COLUMN IF NOT EXISTS tipo_vinculo TEXT CHECK (tipo_vinculo IN ('CLT', 'PJ', 'Autônomo', 'Voluntário', 'Contrato'));

-- ========================================================
-- 4. CAMPOS FINANCEIROS (Professor e PF)
-- ========================================================
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS chave_pix TEXT,
  ADD COLUMN IF NOT EXISTS banco TEXT,
  ADD COLUMN IF NOT EXISTS agencia TEXT,
  ADD COLUMN IF NOT EXISTS conta TEXT,
  ADD COLUMN IF NOT EXISTS tipo_conta TEXT CHECK (tipo_conta IN ('Corrente', 'Poupança'));

-- ========================================================
-- 5. CAMPOS DO PRESTADOR PF (tipo = 'PF')
-- ========================================================
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT;

-- ========================================================
-- 6. CAMPOS DA EMPRESA PJ (tipo = 'PJ')
-- ========================================================
ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS responsavel_cargo TEXT,
  ADD COLUMN IF NOT EXISTS tipo_convenio TEXT CHECK (tipo_convenio IN ('Convênio', 'Contrato', 'Fornecedor', 'Prefeitura', 'ONG', 'Sindicato'));

-- ========================================================
-- 7. ATUALIZAR TRIGGER: CHECKLIST DE DOCUMENTOS DO ALUNO
-- Adiciona documentos específicos de cursos da área da saúde
-- ========================================================
CREATE OR REPLACE FUNCTION public.criar_checklist_documentos_aluno()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'Aluno' THEN
    INSERT INTO public.documentos_aluno (aluno_id, nome_documento, status)
    VALUES
      -- Documentos base (todos os cursos)
      (NEW.id, 'RG / CNH (Frente e Verso)', 'pendente'),
      (NEW.id, 'CPF', 'pendente'),
      (NEW.id, 'Comprovante de Residência', 'pendente'),
      (NEW.id, 'Histórico Escolar / Certificado de Conclusão', 'pendente'),
      (NEW.id, 'Certidão de Nascimento ou Casamento', 'pendente'),
      (NEW.id, 'Foto 3x4 Recente', 'pendente'),
      -- Documentos adicionais recomendados
      (NEW.id, 'Título de Eleitor (se maior de 18)', 'pendente'),
      (NEW.id, 'Certificado de Reservista (homens)', 'pendente'),
      (NEW.id, 'Declaração de Escolaridade', 'pendente')
    ON CONFLICT (aluno_id, nome_documento) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- O trigger já existe, a função foi substituída (CREATE OR REPLACE)
