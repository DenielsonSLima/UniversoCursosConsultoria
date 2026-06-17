-- Migração: Detalhamento da Tabela Empresas, Seed de Dados e Habilitação de Realtime

-- 1. Excluir tabela anterior se existir para recriar com campos detalhados
DROP TABLE IF EXISTS empresas CASCADE;

-- 2. Recriar tabela de empresas com todos os campos necessários do frontend
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  endereco TEXT,
  numero TEXT,
  bairro TEXT,
  cidade TEXT,
  uf VARCHAR(2),
  cep TEXT,
  telefone TEXT,
  email TEXT,
  tipo TEXT NOT NULL DEFAULT 'Filial', -- 'Matriz' ou 'Filial'
  logo_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total local empresas" 
  ON empresas FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 3. Inserir os dados iniciais do mockup (Seeding)
INSERT INTO empresas (id, nome_fantasia, razao_social, cnpj, endereco, numero, bairro, cidade, uf, cep, telefone, email, tipo, ativo)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Universo Cursos - Matriz', 'Universo Cursos e Consultoria LTDA', '00.000.000/0001-00', 'R. V', '56', 'Lot. São José', 'Japoatã', 'SE', '49950-000', '(79) 99602-8316', 'japoata@universo.com', 'Matriz', true),
  ('22222222-2222-2222-2222-222222222222', 'Universo - Polo Aquidabã', 'Universo Cursos e Consultoria LTDA', '00.000.000/0002-00', 'Av. Sete de Setembro', '500', 'Centro', 'Aquidabã', 'SE', '49945-000', '(79) 99999-0002', 'aquidaba@universo.com', 'Filial', true),
  ('33333333-3333-3333-3333-333333333333', 'Universo - Porto da Folha', 'Universo Cursos e Consultoria LTDA', '00.000.000/0003-00', 'Rua da Liberdade', '230', 'Comércio', 'Porto da Folha', 'SE', '49800-000', '(79) 99999-0003', 'portodafolha@universo.com', 'Filial', false)
ON CONFLICT (id) DO NOTHING;

-- Habilitar Realtime para a tabela empresas
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE empresas;
COMMIT;
