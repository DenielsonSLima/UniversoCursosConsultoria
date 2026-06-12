-- Migração: Criação de Tabelas Restantes do Módulo de Configurações, Seed de Dados e Realtime

-- ========================================================
-- 1. ALTERAÇÕES NA TABELA EXISTENTE: EMPRESAS (Para Marca D'água)
-- ========================================================
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS watermark_url TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS watermark_opacity NUMERIC(3, 2) DEFAULT 0.10;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS watermark_scale INTEGER DEFAULT 50;

-- ========================================================
-- 2. TABELA: POLOS
-- ========================================================
DROP TABLE IF EXISTS polos CASCADE;
CREATE TABLE polos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado VARCHAR(2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo', -- 'ativo' | 'inativo'
  is_matriz BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE polos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local polos" ON polos FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 3. TABELA: CONTAS BANCÁRIAS
-- ========================================================
DROP TABLE IF EXISTS contas_bancarias CASCADE;
CREATE TABLE contas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  banco TEXT NOT NULL,
  titular TEXT NOT NULL,
  agencia TEXT NOT NULL,
  conta TEXT NOT NULL,
  tipo TEXT NOT NULL, -- Corrente, Poupança, Pagamento, etc.
  saldo_inicial NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  data_saldo DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local contas_bancarias" ON contas_bancarias FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 4. TABELA: CATEGORIAS
-- ========================================================
DROP TABLE IF EXISTS categorias CASCADE;
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL, -- aluno, professor, pf, pj
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo', -- ativo | inativo
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local categorias" ON categorias FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 5. TABELA: TAXAS DE PAGAMENTO
-- ========================================================
DROP TABLE IF EXISTS taxas_pagamento CASCADE;
CREATE TABLE taxas_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forma TEXT NOT NULL,
  prazo TEXT NOT NULL,
  taxa NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE taxas_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local taxas_pagamento" ON taxas_pagamento FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 6. TABELA: USUÁRIOS DO SISTEMA
-- ========================================================
DROP TABLE IF EXISTS usuarios_sistema CASCADE;
CREATE TABLE usuarios_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  perfil TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Ativo', -- Ativo | Inativo
  context TEXT NOT NULL DEFAULT 'global', -- global ou UUID da empresa
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE usuarios_sistema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local usuarios_sistema" ON usuarios_sistema FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 7. TABELA: CONFIGURAÇÕES DE MENSAGERIA
-- ========================================================
DROP TABLE IF EXISTS mensageria_config CASCADE;
CREATE TABLE mensageria_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT UNIQUE NOT NULL, -- whatsapp | email
  -- Whatsapp Fields
  wa_provider TEXT,
  wa_instance_name TEXT,
  wa_instance_url TEXT,
  wa_token TEXT,
  wa_status TEXT DEFAULT 'conectado',
  -- Email Fields
  smtp_server TEXT,
  smtp_port TEXT,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_sender_name TEXT,
  smtp_sender_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mensageria_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local mensageria_config" ON mensageria_config FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 8. TABELA: TEMPLATES DE MENSAGENS
-- ========================================================
DROP TABLE IF EXISTS templates_mensagens CASCADE;
CREATE TABLE templates_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  gatilho TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE templates_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local templates_mensagens" ON templates_mensagens FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 9. TABELA: INTEGRAÇÃO ASAAS
-- ========================================================
DROP TABLE IF EXISTS asaas_config CASCADE;
CREATE TABLE asaas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL DEFAULT 'sandbox', -- sandbox | production
  api_key TEXT,
  wallet_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE asaas_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total local asaas_config" ON asaas_config FOR ALL USING (true) WITH CHECK (true);


-- ========================================================
-- SEED DE DADOS INICIAIS (Apenas UUIDs válidos em Hexadecimal)
-- ========================================================

-- Seed: Polos
INSERT INTO polos (id, company_id, nome, cnpj, cidade, estado, status, is_matriz)
VALUES
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Matriz - Aracaju', '00.000.000/0001-00', 'Aracaju', 'SE', 'ativo', true),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Polo Estância', '00.000.000/0002-11', 'Estância', 'SE', 'ativo', false)
ON CONFLICT (id) DO NOTHING;

-- Seed: Contas Bancárias
INSERT INTO contas_bancarias (id, company_id, banco, titular, agencia, conta, tipo, saldo_inicial, data_saldo, ativo)
VALUES
  ('10110110-1101-1011-0110-110110110101', '11111111-1111-1111-1111-111111111111', 'Banco do Brasil', 'Universo Cursos LTDA', '3322-X', '12345-6', 'Corrente', 15000.00, '2024-01-01', true),
  ('10210210-2102-1021-0210-210210210202', '11111111-1111-1111-1111-111111111111', 'Nubank', 'Universo Cursos LTDA', '0001', '987654-1', 'Pagamento', 0.00, NULL, true),
  ('10310310-3103-1031-0310-310310310303', '22222222-2222-2222-2222-222222222222', 'Caixa Econômica', 'Universo Aquidabã', '1020', '5555-0', 'Poupança', 5000.50, '2024-02-15', true)
ON CONFLICT (id) DO NOTHING;

-- Seed: Categorias
INSERT INTO categorias (id, nome, tipo, descricao, status)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'Supermercado', 'pj', 'Fornecedores de alimentos', 'ativo'),
  ('c2222222-2222-2222-2222-222222222222', 'Posto de Combustível', 'pj', 'Fornecimento de combustível', 'ativo'),
  ('c3333333-3333-3333-3333-333333333333', 'Aluno Bolsista', 'aluno', 'Alunos com bolsa integral', 'ativo'),
  ('c4444444-4444-4444-4444-444444444444', 'Professor Substituto', 'professor', 'Professores temporários', 'ativo'),
  ('c5555555-5555-5555-5555-555555555555', 'Prestador de Serviço TI', 'pf', 'Manutenção e suporte', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- Seed: Taxas
INSERT INTO taxas_pagamento (id, forma, prazo, taxa)
VALUES
  ('d1111111-1111-1111-1111-111111111111', 'Cartão de Crédito', '30 dias', 3.99),
  ('d2222222-2222-2222-2222-222222222222', 'Cartão de Débito', '1 dia', 1.99),
  ('d3333333-3333-3333-3333-333333333333', 'Pix', 'Imediato', 0.00)
ON CONFLICT (id) DO NOTHING;

-- Seed: Usuários
INSERT INTO usuarios_sistema (id, nome, email, perfil, status, context)
VALUES
  ('f1111111-1111-1111-1111-111111111111', 'Administrador Master', 'gestor@universo.com', 'Gestor', 'Ativo', 'global'),
  ('f2222222-2222-2222-2222-222222222222', 'Coordenação Pedagógica', 'pedagogico@universo.com', 'Coordenador', 'Ativo', 'global'),
  ('f3333333-3333-3333-3333-333333333333', 'Secretaria Japoatã', 'sec.japoata@universo.com', 'Operacional', 'Ativo', '11111111-1111-1111-1111-111111111111'),
  ('f4444444-4444-4444-4444-444444444444', 'Financeiro Aquidabã', 'fin.aquidaba@universo.com', 'Financeiro', 'Ativo', '22222222-2222-2222-2222-222222222222'),
  ('f5555555-5555-5555-5555-555555555555', 'Atendimento Porto', 'atend.porto@universo.com', 'Operacional', 'Inativo', '33333333-3333-3333-3333-333333333333')
ON CONFLICT (id) DO NOTHING;

-- Seed: Mensageria
INSERT INTO mensageria_config (id, tipo, wa_provider, wa_instance_name, wa_instance_url, wa_token, wa_status)
VALUES
  ('e1111111-1111-1111-1111-111111111111', 'whatsapp', 'evolution', 'instancia1', 'https://api.whatsapp.exemplo.com', 'token-secreto-12345', 'conectado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO mensageria_config (id, tipo, smtp_server, smtp_port, smtp_user, smtp_pass, smtp_sender_name, smtp_sender_email)
VALUES
  ('e2222222-2222-2222-2222-222222222222', 'email', 'smtp.mailgun.org', '587', 'postmaster@sandbox.mailgun.org', 'senha-secreta-email', 'Equipe Financeiro', 'financeiro@escola.com')
ON CONFLICT (id) DO NOTHING;

-- Seed: Templates
INSERT INTO templates_mensagens (id, nome, gatilho, conteudo)
VALUES
  ('b1111111-1111-1111-1111-111111111111', 'Boleto Vence Amanhã', '1 dia antes do vencimento', 'Olá {{nome_parceiro}}, lembramos que a sua mensalidade referente ao curso {{nome_curso}} vence amanhã ({{data_vencimento}}). Copie o código Pix: {{codigo_pix}}'),
  ('b2222222-2222-2222-2222-222222222222', 'Boas Vindas ao Curso', 'Matrícula confirmada', 'Seja muito bem-vindo(a), {{nome_parceiro}}! Estamos felizes em tê-lo no curso {{nome_curso}}. Seu acesso ao portal já está liberado.'),
  ('b3333333-3333-3333-3333-333333333333', 'Aviso de Inadimplência', '5 dias de atraso', 'Oi {{nome_parceiro}}. Percebemos que não localizamos o pagamento da parcela vencida em {{data_vencimento}}. Para evitar bloqueios, regularize sua situação através do link: {{link_pagamento}}')
ON CONFLICT (id) DO NOTHING;

-- Seed: Asaas Config
INSERT INTO asaas_config (id, environment, api_key, wallet_id)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'sandbox', '', '')
ON CONFLICT (id) DO NOTHING;

-- Seed: Marca D'água padrão nas empresas existentes
UPDATE empresas SET watermark_opacity = 0.10, watermark_scale = 50 WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE empresas SET watermark_url = 'https://cdn-icons-png.flaticon.com/512/2942/2942544.png', watermark_opacity = 0.15, watermark_scale = 80 WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE empresas SET watermark_opacity = 0.10, watermark_scale = 50 WHERE id = '33333333-3333-3333-3333-333333333333';

-- HABILITAR REALTIME PARA TODAS AS NOVAS TABELAS
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE polos;
  ALTER PUBLICATION supabase_realtime ADD TABLE contas_bancarias;
  ALTER PUBLICATION supabase_realtime ADD TABLE categorias;
  ALTER PUBLICATION supabase_realtime ADD TABLE taxas_pagamento;
  ALTER PUBLICATION supabase_realtime ADD TABLE usuarios_sistema;
  ALTER PUBLICATION supabase_realtime ADD TABLE mensageria_config;
  ALTER PUBLICATION supabase_realtime ADD TABLE templates_mensagens;
  ALTER PUBLICATION supabase_realtime ADD TABLE asaas_config;
COMMIT;
