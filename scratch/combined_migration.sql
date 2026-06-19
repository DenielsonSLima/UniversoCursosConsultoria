-- Migração: Tabelas de Configuração e Funções de Cálculo do Universo Cursos

-- 1. Tabela: Regras de Cobrança
CREATE TABLE IF NOT EXISTS regras_cobranca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  multa NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
  juros NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
  desconto NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  dias_desconto INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar row level security (RLS)
ALTER TABLE regras_cobranca ENABLE ROW LEVEL SECURITY;

-- Criar política simples de acesso para testes locais (leitura e escrita aberta local)
CREATE POLICY "Acesso total local regras_cobranca" 
  ON regras_cobranca FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 2. Tabela: Taxas de Pagamento
CREATE TABLE IF NOT EXISTS taxas_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  billing_type TEXT NOT NULL, -- PIX, BOLETO, CREDIT_CARD
  taxa_fixa NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  taxa_percentual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE taxas_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total local taxas_pagamento" 
  ON taxas_pagamento FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 3. Tabela: Empresas (Dados de Faturamento)
CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  telefone TEXT,
  endereco TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total local empresas" 
  ON empresas FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 4. Tabela: Polos / Unidades
CREATE TABLE IF NOT EXISTS polos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT,
  telefone TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE polos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total local polos" 
  ON polos FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 5. Tabela: Contas Bancárias
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banco TEXT NOT NULL,
  agencia TEXT NOT NULL,
  conta TEXT NOT NULL,
  tipo TEXT NOT NULL, -- CORRENTE, POUPANCA
  saldo_inicial NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total local contas_bancarias" 
  ON contas_bancarias FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ========================================================
-- FUNÇÕES DE CÁLCULO (POSTGRESQL - LÓGICA DE NEGÓCIO DO BANCO)
-- ========================================================

-- Função 1: Cálculo base de juros, multa e desconto
CREATE OR REPLACE FUNCTION calcular_valores_cobranca(
  valor_base NUMERIC,
  data_vencimento DATE,
  data_pagamento DATE,
  multa_percentual NUMERIC,
  juros_mensal_percentual NUMERIC,
  desconto_percentual NUMERIC,
  dias_antecedencia_desconto INTEGER
)
RETURNS TABLE (
  valor_multa NUMERIC,
  valor_juros NUMERIC,
  valor_desconto NUMERIC,
  valor_final NUMERIC
) AS $$
DECLARE
  dias_atraso INTEGER := data_pagamento - data_vencimento;
  dias_antecedencia INTEGER := data_vencimento - data_pagamento;
  v_multa NUMERIC := 0;
  v_juros NUMERIC := 0;
  v_desconto NUMERIC := 0;
  v_final NUMERIC := valor_base;
BEGIN
  -- 1. Calcular Multa (se houver atraso)
  IF dias_atraso > 0 THEN
    v_multa := ROUND((valor_base * (multa_percentual / 100.0)), 2);
  END IF;

  -- 2. Calcular Juros (pro-rata por dia de atraso, baseado em juros mensal)
  IF dias_atraso > 0 THEN
    -- juros diário = (juros_mensal / 30) / 100
    v_juros := ROUND((valor_base * ((juros_mensal_percentual / 30.0) / 100.0) * dias_atraso), 2);
  END IF;

  -- 3. Calcular Desconto Pontualidade (se pago em dia ou com antecedência mínima)
  IF dias_antecedencia >= dias_antecedencia_desconto AND dias_atraso <= 0 THEN
    v_desconto := ROUND((valor_base * (desconto_percentual / 100.0)), 2);
  END IF;

  -- 4. Valor Final
  v_final := valor_base + v_multa + v_juros - v_desconto;

  RETURN QUERY SELECT v_multa, v_juros, v_desconto, v_final;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função 2: Cálculo automático baseado nas regras de cobrança cadastradas
CREATE OR REPLACE FUNCTION calcular_valores_cobranca_padrao(
  valor_base NUMERIC,
  data_vencimento DATE,
  data_pagamento DATE
)
RETURNS TABLE (
  valor_multa NUMERIC,
  valor_juros NUMERIC,
  valor_desconto NUMERIC,
  valor_final NUMERIC,
  multa_aplicada NUMERIC,
  juros_aplicado NUMERIC,
  desconto_aplicado NUMERIC
) AS $$
DECLARE
  r_multa NUMERIC;
  r_juros NUMERIC;
  r_desconto NUMERIC;
  r_dias INTEGER;
BEGIN
  -- Buscar a regra padrão ativa (usando a primeira linha cadastrada)
  SELECT multa, juros, desconto, dias_desconto 
  INTO r_multa, r_juros, r_desconto, r_dias
  FROM regras_cobranca
  LIMIT 1;

  -- Fallback caso não haja regras cadastradas
  IF NOT FOUND THEN
    r_multa := 2.00;
    r_juros := 1.00;
    r_desconto := 0.00;
    r_dias := 0;
  END IF;

  RETURN QUERY 
  SELECT 
    c.valor_multa, 
    c.valor_juros, 
    c.valor_desconto, 
    c.valor_final,
    r_multa,
    r_juros,
    r_desconto
  FROM calcular_valores_cobranca(
    valor_base, 
    data_vencimento, 
    data_pagamento, 
    r_multa, 
    r_juros, 
    r_desconto, 
    r_dias
  ) c;
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================================================
-- SEED DE DADOS INICIAIS
-- ========================================================

-- Inserir regra de cobrança padrão inicial
INSERT INTO regras_cobranca (id, multa, juros, desconto, dias_desconto)
VALUES ('00000000-0000-0000-0000-000000000000', 2.00, 1.00, 0.00, 0)
ON CONFLICT (id) DO NOTHING;

-- HABILITAR REALTIME
-- Nota: Habilita notificações de alterações em tempo real para a tabela de regras de cobrança
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE regras_cobranca;
COMMIT;
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
  ('11111111-1111-1111-1111-111111111111', 'Universo Cursos - Matriz', 'Universo Cursos e Consultoria LTDA', '00.000.000/0001-00', 'Rua V', '56', 'Loteamento São José', 'Japoatã', 'SE', '49950-000', '(79) 99602-8316 / (79) 99861-7614', 'japoata@universo.com', 'Matriz', true),
  ('22222222-2222-2222-2222-222222222222', 'Universo - Polo Aquidabã', 'Universo Cursos e Consultoria LTDA', '00.000.000/0002-00', 'Rua Eduardo Chaves', '109', 'Centro - Vizinho ao Fórum', 'Aquidabã', 'SE', '49945-000', '(79) 99602-8316 / (79) 99861-7614', 'aquidaba@universo.com', 'Filial', true),
  ('33333333-3333-3333-3333-333333333333', 'Universo - Porto da Folha', 'Universo Cursos e Consultoria LTDA', '00.000.000/0003-00', 'Rua Major João Gonçalves', '1783', 'Centro - Vizinho a Delegacia', 'Porto da Folha', 'SE', '49800-000', '(79) 99602-8316 / (79) 99861-7614', 'portodafolha@universo.com', 'Filial', false)
ON CONFLICT (id) DO NOTHING;

-- Habilitar Realtime para a tabela empresas
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE empresas;
COMMIT;
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
-- Migração: Ajuste de Polos, Contas Bancárias e Usuários para relacionamento por Polo

-- 1. Adicionar colunas de marca d'água na tabela public.polos
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS watermark_url TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS watermark_opacity NUMERIC(3, 2) DEFAULT 0.10;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS watermark_scale INTEGER DEFAULT 50;

-- 2. Ajustar tabela public.contas_bancarias para apontar para polos ao invés de empresas
-- Primeiro removemos a FK antiga se ela existir
ALTER TABLE public.contas_bancarias DROP CONSTRAINT IF EXISTS contas_bancarias_company_id_fkey;
ALTER TABLE public.contas_bancarias DROP CONSTRAINT IF EXISTS contas_bancarias_polo_id_fkey;

-- Se a coluna company_id existe, renomeamos para polo_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'contas_bancarias' 
      AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.contas_bancarias RENAME COLUMN company_id TO polo_id;
  END IF;
END $$;

-- Garantir que a coluna polo_id exista com o tipo UUID
ALTER TABLE public.contas_bancarias ADD COLUMN IF NOT EXISTS polo_id UUID;

-- CRITICAL: Deletar dados antigos da tabela contas_bancarias ANTES de adicionar o constraint da FK
-- para evitar violação de chave estrangeira com registros inconsistentes do seed anterior.
DELETE FROM public.contas_bancarias;

-- Agora adicionamos a nova restrição de FK apontando para public.polos
ALTER TABLE public.contas_bancarias 
  ADD CONSTRAINT contas_bancarias_polo_id_fkey 
  FOREIGN KEY (polo_id) 
  REFERENCES public.polos(id) 
  ON DELETE CASCADE;

-- 3. Atualizar dados de Seed de Contas Bancárias vinculando aos polos reais do seed
-- Polos do seed: 
-- Matriz - Aracaju: '44444444-4444-4444-4444-444444444444'
-- Polo Estância: '55555555-5555-5555-5555-555555555555'

INSERT INTO public.contas_bancarias (id, polo_id, banco, titular, agencia, conta, tipo, saldo_inicial, data_saldo, ativo)
VALUES
  ('10110110-1101-1011-0110-110110110101', '44444444-4444-4444-4444-444444444444', 'Banco do Brasil', 'Universo Cursos LTDA', '3322-X', '12345-6', 'Corrente', 15000.00, '2024-01-01', true),
  ('10210210-2102-1021-0210-210210210202', '44444444-4444-4444-4444-444444444444', 'Nubank', 'Universo Cursos LTDA', '0001', '987654-1', 'Pagamento', 0.00, NULL, true),
  ('10310310-3103-1031-0310-310310310303', '55555555-5555-5555-5555-555555555555', 'Caixa Econômica', 'Universo Estância', '1020', '5555-0', 'Poupança', 5000.50, '2024-02-15', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Atualizar os seeds de usuarios_sistema para apontar para polos reais no campo context
UPDATE public.usuarios_sistema SET context = '44444444-4444-4444-4444-444444444444' WHERE id = 'f3333333-3333-3333-3333-333333333333';
UPDATE public.usuarios_sistema SET context = '55555555-5555-5555-5555-555555555555' WHERE id = 'f4444444-4444-4444-4444-444444444444';
UPDATE public.usuarios_sistema SET context = '44444444-4444-4444-4444-444444444444' WHERE id = 'f5555555-5555-5555-5555-555555555555';
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
-- Migração: Atualização para Caixa Alta, Escolaridade Médio em Andamento e Status Personalizados
-- Autor: Antigravity

-- 1. Alterar padrões para caixa alta
ALTER TABLE public.parceiros ALTER COLUMN status SET DEFAULT 'ATIVO';
ALTER TABLE public.matriculas ALTER COLUMN status SET DEFAULT 'ATIVO';

-- 2. Converter dados existentes para caixa alta
UPDATE public.parceiros SET 
  estado_civil = UPPER(estado_civil),
  escolaridade_anterior = UPPER(escolaridade_anterior),
  titulacao = UPPER(titulacao),
  tipo_vinculo = UPPER(tipo_vinculo),
  tipo_conta = UPPER(tipo_conta),
  tipo_convenio = UPPER(tipo_convenio),
  sexo = UPPER(sexo),
  status = UPPER(status);

UPDATE public.matriculas SET
  status = UPPER(status);

-- 3. Remover restrições antigas se existirem
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_estado_civil_check;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_escolaridade_anterior_check;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_titulacao_check;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_tipo_vinculo_check;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_tipo_conta_check;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_tipo_convenio_check;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_status_check;
ALTER TABLE public.matriculas DROP CONSTRAINT IF EXISTS matriculas_status_check;

-- 4. Adicionar novas restrições em caixa alta com suporte a novas opções
ALTER TABLE public.parceiros
  ADD CONSTRAINT parceiros_estado_civil_check CHECK (estado_civil IN ('SOLTEIRO(A)', 'CASADO(A)', 'DIVORCIADO(A)', 'VIÚVO(A)', 'UNIÃO ESTÁVEL', 'SEPARADO(A)')),
  ADD CONSTRAINT parceiros_escolaridade_anterior_check CHECK (escolaridade_anterior IN (
    'ENSINO MÉDIO COMPLETO',
    'ENSINO MÉDIO INCOMPLETO',
    'CURSANDO ENSINO MÉDIO',
    'ENSINO SUPERIOR COMPLETO',
    'ENSINO SUPERIOR INCOMPLETO',
    'PÓS-GRADUAÇÃO'
  )),
  ADD CONSTRAINT parceiros_titulacao_check CHECK (titulacao IN ('GRADUAÇÃO', 'ESPECIALIZAÇÃO', 'MESTRADO', 'DOUTORADO', 'PÓS-DOUTORADO')),
  ADD CONSTRAINT parceiros_tipo_vinculo_check CHECK (tipo_vinculo IN ('CLT', 'PJ', 'AUTÔNOMO', 'VOLUNTÁRIO', 'CONTRATO')),
  ADD CONSTRAINT parceiros_tipo_conta_check CHECK (tipo_conta IN ('CORRENTE', 'POUPANÇA')),
  ADD CONSTRAINT parceiros_tipo_convenio_check CHECK (tipo_convenio IN ('CONVÊNIO', 'CONTRATO', 'FORNECEDOR', 'PREFEITURA', 'ONG', 'SINDICATO')),
  ADD CONSTRAINT parceiros_status_check CHECK (status IN ('ATIVO', 'INATIVO', 'TRANCADO', 'CONCLUÍDO', 'DESISTENTE'));

ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_status_check CHECK (status IN ('ATIVO', 'TRANCADO', 'CANCELADO', 'CONCLUIDO', 'DESISTENTE'));
-- Migration: update get_parceiros_kpis RPC to calculate active/inactive counts

BEGIN;

DROP FUNCTION IF EXISTS public.get_parceiros_kpis();

CREATE OR REPLACE FUNCTION public.get_parceiros_kpis()
RETURNS TABLE (
  total_parceiros BIGINT,
  total_parceiros_ativos BIGINT,
  total_alunos BIGINT,
  total_alunos_ativos BIGINT,
  total_alunos_inativos BIGINT,
  total_professores BIGINT,
  total_professores_ativos BIGINT,
  total_professores_inativos BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(COUNT(*), 0)::BIGINT AS total_parceiros,
    COALESCE(COUNT(*) FILTER (WHERE status = 'ATIVO'), 0)::BIGINT AS total_parceiros_ativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno'), 0)::BIGINT AS total_alunos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno' AND status = 'ATIVO'), 0)::BIGINT AS total_alunos_ativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno' AND (status = 'INATIVO' OR status = 'CANCELADO' OR status = 'DESISTENTE')), 0)::BIGINT AS total_alunos_inativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor'), 0)::BIGINT AS total_professores,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor' AND status = 'ATIVO'), 0)::BIGINT AS total_professores_ativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor' AND status = 'INATIVO'), 0)::BIGINT AS total_professores_inativos
  FROM public.parceiros;
END;
$$ LANGUAGE plpgsql;

COMMIT;
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
-- Migração: Adição de campos parceiro_instituicao e parceiro_logo_url para cursos superiores
-- Autor: Antigravity

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS parceiro_instituicao TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS parceiro_logo_url TEXT;
-- Migração: Remover restrição check de tipo_convenio para permitir categorias customizadas/dinâmicas
-- Autor: Antigravity

ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_tipo_convenio_check;
-- Migration: Add polo_ids UUID[] column to public.parceiros for multi-polo support
ALTER TABLE public.parceiros ADD COLUMN IF NOT EXISTS polo_ids UUID[] DEFAULT '{}';
-- Migração: Adição de campo imagem_url para Cursos
-- Autor: Antigravity

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS imagem_url TEXT;
-- Migração: Refatoração de Cursos Técnicos (Campos, Restrições e RPC KPIs)
-- Autor: Antigravity

-- 1. Adicionar coluna duracao_meses na tabela de cursos se não existir
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS duracao_meses INTEGER;

-- 2. Atualizar registros existentes com padrão de meses coerente
UPDATE public.cursos 
SET duracao_meses = CASE 
  WHEN carga_horaria >= 1200 THEN 24 
  ELSE 18 
END
WHERE duracao_meses IS NULL AND modalidade = 'TECNICO';

-- 3. Atualizar restrição de exclusão na tabela turmas de CASCADE para RESTRICT
ALTER TABLE public.turmas DROP CONSTRAINT IF EXISTS turmas_curso_id_fkey;
ALTER TABLE public.turmas ADD CONSTRAINT turmas_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON DELETE RESTRICT;

-- 4. RPC para obter cursos com informações de KPIs de grade e contagem de turmas
CREATE OR REPLACE FUNCTION get_cursos_com_kpis(p_modalidade text)
RETURNS TABLE (
  id uuid,
  nome text,
  modalidade text,
  carga_horaria integer,
  status text,
  created_at timestamptz,
  area text,
  descricao text,
  versao text,
  parceiro_instituicao text,
  parceiro_logo_url text,
  imagem_url text,
  duracao_meses integer,
  carga_horaria_cadastrada numeric,
  total_turmas bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.nome,
    c.modalidade,
    c.carga_horaria,
    c.status,
    c.created_at,
    c.area,
    c.descricao,
    c.versao,
    c.parceiro_instituicao,
    c.parceiro_logo_url,
    c.imagem_url,
    c.duracao_meses,
    COALESCE((
      SELECT SUM(d.carga_horaria)
      FROM public.modulos m
      JOIN public.disciplinas d ON d.modulo_id = m.id
      WHERE m.curso_id = c.id
    ), 0)::numeric as carga_horaria_cadastrada,
    (
      SELECT COUNT(*)
      FROM public.turmas t
      WHERE t.curso_id = c.id
    )::bigint as total_turmas
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC para obter KPIs da grade curricular de um curso específico (Total, Cadastrada, Restante)
CREATE OR REPLACE FUNCTION get_curso_grade_kpis(p_curso_id uuid)
RETURNS TABLE (
  carga_horaria_total integer,
  carga_horaria_cadastrada integer,
  carga_horaria_restante integer
) AS $$
DECLARE
  v_total integer;
  v_cadastrada integer;
BEGIN
  -- Obter a carga horária total do curso
  SELECT c.carga_horaria INTO v_total
  FROM public.cursos c
  WHERE c.id = p_curso_id;

  -- Calcular a carga horária cadastrada na grade
  SELECT COALESCE(SUM(d.carga_horaria), 0)::integer INTO v_cadastrada
  FROM public.modulos m
  JOIN public.disciplinas d ON d.modulo_id = m.id
  WHERE m.curso_id = p_curso_id;

  RETURN QUERY
  SELECT 
    COALESCE(v_total, 0),
    v_cadastrada,
    (COALESCE(v_total, 0) - v_cadastrada);
END;
$$ LANGUAGE plpgsql;
-- Migração: Adicionar coluna publicar_site para publicação dos cursos e atualizar a RPC get_cursos_com_kpis
-- Autor: Antigravity

-- 1. Adicionar coluna publicar_site na tabela de cursos se não existir
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS publicar_site BOOLEAN DEFAULT false;

-- 2. Atualizar registros existentes de cursos técnicos para publicar_site = true
UPDATE public.cursos SET publicar_site = true WHERE modalidade = 'TECNICO';

-- 3. Atualizar a RPC get_cursos_com_kpis para incluir a coluna publicar_site
DROP FUNCTION IF EXISTS public.get_cursos_com_kpis(text);
CREATE OR REPLACE FUNCTION get_cursos_com_kpis(p_modalidade text)
RETURNS TABLE (
  id uuid,
  nome text,
  modalidade text,
  carga_horaria integer,
  status text,
  created_at timestamptz,
  area text,
  descricao text,
  versao text,
  parceiro_instituicao text,
  parceiro_logo_url text,
  imagem_url text,
  duracao_meses integer,
  carga_horaria_cadastrada numeric,
  total_turmas bigint,
  publicar_site boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.nome,
    c.modalidade,
    c.carga_horaria,
    c.status,
    c.created_at,
    c.area,
    c.descricao,
    c.versao,
    c.parceiro_instituicao,
    c.parceiro_logo_url,
    c.imagem_url,
    c.duracao_meses,
    COALESCE((
      SELECT SUM(d.carga_horaria)
      FROM public.modulos m
      JOIN public.disciplinas d ON d.modulo_id = m.id
      WHERE m.curso_id = c.id
    ), 0)::numeric as carga_horaria_cadastrada,
    (
      SELECT COUNT(*)
      FROM public.turmas t
      WHERE t.curso_id = c.id
    )::bigint as total_turmas,
    c.publicar_site
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
END;
$$ LANGUAGE plpgsql;
-- Migração: Adicionar colunas para fotos de detalhes e atualizar a RPC get_cursos_com_kpis
-- Autor: Antigravity

-- 1. Adicionar colunas imagem_detalhe_1 e imagem_detalhe_2 na tabela de cursos se não existirem
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS imagem_detalhe_1 TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS imagem_detalhe_2 TEXT;

-- 2. Atualizar a RPC get_cursos_com_kpis para incluir as novas colunas
DROP FUNCTION IF EXISTS public.get_cursos_com_kpis(text);
CREATE OR REPLACE FUNCTION get_cursos_com_kpis(p_modalidade text)
RETURNS TABLE (
  id uuid,
  nome text,
  modalidade text,
  carga_horaria integer,
  status text,
  created_at timestamptz,
  area text,
  descricao text,
  versao text,
  parceiro_instituicao text,
  parceiro_logo_url text,
  imagem_url text,
  duracao_meses integer,
  carga_horaria_cadastrada numeric,
  total_turmas bigint,
  publicar_site boolean,
  imagem_detalhe_1 text,
  imagem_detalhe_2 text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.nome,
    c.modalidade,
    c.carga_horaria,
    c.status,
    c.created_at,
    c.area,
    c.descricao,
    c.versao,
    c.parceiro_instituicao,
    c.parceiro_logo_url,
    c.imagem_url,
    c.duracao_meses,
    COALESCE((
      SELECT SUM(d.carga_horaria)
      FROM public.modulos m
      JOIN public.disciplinas d ON d.modulo_id = m.id
      WHERE m.curso_id = c.id
    ), 0)::numeric as carga_horaria_cadastrada,
    (
      SELECT COUNT(*)
      FROM public.turmas t
      WHERE t.curso_id = c.id
    )::bigint as total_turmas,
    c.publicar_site,
    c.imagem_detalhe_1,
    c.imagem_detalhe_2
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
END;
$$ LANGUAGE plpgsql;
-- Migração: Seed do Curso Técnico em Segurança do Trabalho e Grade Curricular
-- Autor: Antigravity

-- 1. Inserir ou atualizar o Curso de Técnico em Segurança do Trabalho com o ID existente
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria, status, area, descricao, versao, duracao_meses, publicar_site)
VALUES (
  '706a6e63-e204-4be4-80b7-29ae864ac841',
  'Técnico em Segurança do Trabalho',
  'TECNICO',
  1280,
  'ativo',
  'Gestão',
  'Formação voltada para a identificação, avaliação e controle dos riscos ocupacionais, visando a integridade física e a saúde do trabalhador no ambiente corporativo.',
  '1.0',
  24,
  true
) ON CONFLICT (id) DO UPDATE SET
  carga_horaria = 1280,
  area = 'Gestão',
  duracao_meses = 24,
  publicar_site = true,
  descricao = 'Formação voltada para a identificação, avaliação e controle dos riscos ocupacionais, visando a integridade física e a saúde do trabalhador no ambiente corporativo.';

-- 2. Inserir Módulos, Disciplinas e Aulas associados
DO $$
DECLARE
  v_curso_id UUID := '706a6e63-e204-4be4-80b7-29ae864ac841';
  v_mod1_id UUID;
  v_mod2_id UUID;
  v_mod3_id UUID;
  v_mod4_id UUID;
  v_disc_id UUID;
BEGIN
  -- Se já existirem módulos cadastrados para este curso, nós limpamos antes de reinserir (garantindo o preenchimento correto)
  DELETE FROM public.modulos WHERE curso_id = v_curso_id;
    
  -- ==========================================
  -- MÓDULO BÁSICO (Carga Horária: 360h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO BÁSICO')
  RETURNING id INTO v_mod1_id;

  -- Redação Oficial
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Redação Oficial', 60, 'Estudo e aplicação das normas e padrões de comunicação escrita oficial.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- Informática básica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Informática básica', 40, 'Fundamentos de informática, sistemas operacionais e ferramentas de escritório.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 10),
    (v_disc_id, 'Aulas Práticas', 30);

  -- Psicologia Aplicada a segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Psicologia Aplicada a segurança do trabalho', 40, 'Comportamento humano, percepção de risco e relações interpessoais no trabalho.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Normas técnicas aplicadas a segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Normas técnicas aplicadas a segurança do trabalho', 80, 'Estudo detalhado das Normas Regulamentadoras (NRs) e legislação de SST.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 80);

  -- Princípio de segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Princípio de segurança do trabalho', 40, 'Conceitos básicos de acidentes, doenças profissionais e prevenção.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Técnicas de treinamento
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Técnicas de treinamento', 40, 'Planejamento e didática para realização de palestras, DDS e treinamentos de segurança.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Metodologia do ensino
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Metodologia do ensino', 20, 'Fundamentos teóricos e práticos do processo ensino-aprendizagem.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Inglês Técnico
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Inglês Técnico', 40, 'Leitura e interpretação de manuais e documentações técnicas em inglês.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);


  -- ==========================================
  -- MÓDULO II - AUXILIAR DE SEGURANÇA DO TRABALHO (Carga Horária: 320h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO II - AUXILIAR DE SEGURANÇA DO TRABALHO')
  RETURNING id INTO v_mod2_id;

  -- Ergonomia Aplicada a segurança do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Ergonomia Aplicada a segurança do Trabalho', 40, 'Conceitos de ergonomia física, cognitiva e organizacional no ambiente laboral.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Prevenção e controle de riscos em maquinas e equipamentos
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Prevenção e controle de riscos em maquinas e equipamentos', 40, 'Proteção de máquinas, ferramentas e conformidade com a NR-12.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 32),
    (v_disc_id, 'Aulas Práticas', 8);

  -- Proteção Contra Incêndio e Explosões
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Proteção Contra Incêndio e Explosões', 60, 'Sistemas de prevenção, combate a incêndio, rota de fuga e saídas de emergência.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Análise e Gerenciamento de Riscos (Ajustado de "Análise & Guernica de Riscos")
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Análise e Gerenciamento de Riscos', 80, 'Técnicas de análise de riscos (APR, HAZOP, Árvore de Falhas) e gerenciamento preventivo.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Computação Gráfica Aplicada
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Computação Gráfica Aplicada', 40, 'Desenho técnico e representação de plantas e layouts através de softwares CAD.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Segurança na construção civil
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Segurança na construção civil', 60, 'Prevenção de acidentes e normas de segurança em canteiros de obras (NR-18).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);


  -- ==========================================
  -- MÓDULO III – MÓDULO ESPECÍFICO (Carga Horária: 320h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO III – MÓDULO ESPECÍFICO')
  RETURNING id INTO v_mod3_id;

  -- Técnicas de uso em equipamentos de medição
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Técnicas de uso em equipamentos de medição', 60, 'Operação e calibração de instrumentos de avaliação ambiental (decibelímetro, dosímetro, termômetro, etc.).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Educação Ambiental
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Educação Ambiental', 40, 'Sustentabilidade, gestão de resíduos e responsabilidade ambiental nas empresas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Doenças Ocupacionais
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Doenças Ocupacionais', 60, 'Estudo das patologias relacionadas ao trabalho e medidas de nexo causal.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- Primeiros Socorros
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Primeiros Socorros', 60, 'Procedimentos básicos de atendimento emergencial em casos de acidentes ou mal súbito.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Higiene do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Higiene do Trabalho', 60, 'Reconhecimento, avaliação e controle de riscos físicos, químicos e biológicos.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- TCC I
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'TCC I', 40, 'Introdução ao desenvolvimento do projeto de conclusão de curso.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Desenvolvimento do Trabalho de Conclusão de Curso I', 40);


  -- ==========================================
  -- MÓDULO IV – FORMAÇÃO TÉCNICA (Carga Horária: 280h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO IV – FORMAÇÃO TÉCNICA')
  RETURNING id INTO v_mod4_id;

  -- Legislação Aplicada a Segurança do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Legislação Aplicada a Segurança do Trabalho', 60, 'Direito do Trabalho, Previdenciário e responsabilidade civil/criminal em acidentes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- EPI & EPC
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'EPI & EPC', 40, 'Gestão de Equipamentos de Proteção Individual e Coletiva (seleção, treinamento e fiscalização).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Estatística aplicada a Segurança do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Estatística aplicada a Segurança do Trabalho', 40, 'Cálculo de taxas de frequência, gravidade e estatísticas de acidentes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Administração e Organização do Trabalho (Ajustado de "Administração e Urbanização do Trabalho")
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Administração e Organização do Trabalho', 40, 'Teoria geral da administração e métodos de organização do trabalho aplicados à segurança.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Programas de segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Programas de segurança do trabalho', 60, 'Elaboração e gestão de PGR, PCMSO, LTCAT e outros programas obrigatórios.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- TCC II
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'TCC II', 40, 'Finalização e apresentação do trabalho de conclusão de curso.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Desenvolvimento do Trabalho de Conclusão de Curso II', 40);

END $$;
-- Migração: Seed do Curso Técnico em Enfermagem e Grade Curricular
-- Autor: Antigravity

-- 1. Inserir ou atualizar o Curso de Técnico em Enfermagem
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria, status, area, descricao, versao, duracao_meses, publicar_site)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'Técnico em Enfermagem',
  'TECNICO',
  1800,
  'ativo',
  'Saúde',
  'Formação completa para atuação na promoção, prevenção, recuperação e reabilitação da saúde, com sólida base teórica, prática e estágio supervisionado.',
  '1.0',
  24,
  true
) ON CONFLICT (id) DO UPDATE SET
  carga_horaria = 1800,
  area = 'Saúde',
  duracao_meses = 24,
  publicar_site = true;

-- 2. Inserir Módulos, Disciplinas e Aulas associados
DO $$
DECLARE
  v_curso_id UUID := 'c0000000-0000-0000-0000-000000000001';
  v_mod1_id UUID;
  v_mod2_id UUID;
  v_mod3_id UUID;
  v_disc_id UUID;
BEGIN
  -- Limpar módulos existentes para este curso para garantir preenchimento sem duplicidade
  DELETE FROM public.modulos WHERE curso_id = v_curso_id;
    
  -- ==========================================
  -- MÓDULO I - AMBIENTAÇÃO PROFISSIONAL (Carga Horária: 270h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO I - AMBIENTAÇÃO PROFISSIONAL')
  RETURNING id INTO v_mod1_id;

  -- Relações Humanas no Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Relações Humanas no Trabalho', 20, 'Estudo das relações interpessoais, ética no trabalho e postura profissional em equipe de saúde.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Informática Básica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Informática Básica', 30, 'Introdução ao uso de computadores, prontuário eletrônico e sistemas hospitalares.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 10);

  -- História da Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'História da Enfermagem', 30, 'Evolução histórica da profissão, marcos da enfermagem moderna e Florence Nightingale.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 30);

  -- Anatomia e Fisiologia Humana
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Anatomia e Fisiologia Humana', 80, 'Estudo dos sistemas do corpo humano, seus órgãos, funções e correlações anatômicas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Princípios de Nutrição e Dietética
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Princípios de Nutrição e Dietética', 30, 'Fundamentos da nutrição humana, tipos de dietas hospitalares e cuidados alimentares.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 30);

  -- Microbiologia, Parasitologia e Patologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Microbiologia, Parasitologia e Patologia', 40, 'Morfologia de microorganismos, agentes infecciosos e noções de patologia básica.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 10);

  -- Noções de Primeiros Socorros
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Noções de Primeiros Socorros', 40, 'Atendimento emergencial de primeiros socorros, suporte básico de vida e traumas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 10);


  -- ==========================================
  -- MÓDULO II - INTRODUÇÃO ÀS ESPECIALIDADES TÉCNICAS EM ENFERMAGEM (Carga Horária: 1000h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO II - INTRODUÇÃO ÀS ESPECIALIDADES TÉCNICAS EM ENFERMAGEM')
  RETURNING id INTO v_mod2_id;

  -- Psicologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Psicologia', 20, 'Aspectos psicológicos do paciente hospitalizado, acolhimento e luto.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Ética Profissional e Legislação em Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Ética Profissional e Legislação em Enfermagem', 20, 'Código de ética dos profissionais de enfermagem, COFEN/COREN e legislação aplicada.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Fundamentos da Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Fundamentos da Enfermagem', 210, 'Teorias do cuidado, técnicas básicas de assistência, verificação de sinais vitais e estágio de fundamentos.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 80),
    (v_disc_id, 'Aulas Práticas', 40),
    (v_disc_id, 'Estágio Supervisionado', 90);

  -- Técnicas Básicas
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Técnicas Básicas', 40, 'Procedimentos fundamentais de auxílio ao paciente (higienização, transporte, leito).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Teoria do Cuidado
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Teoria do Cuidado', 20, 'Estudo das principais teorias científicas de enfermagem e sistematização do cuidado.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Princípios de Farmacologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Princípios de Farmacologia', 50, 'Cálculo de medicação, diluição, vias de administração de medicamentos e farmacocinética.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 50);

  -- Enfermagem Médica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem Médica', 110, 'Assistência a pacientes acometidos por afecções clínicas e crônicas e estágio clínico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 10),
    (v_disc_id, 'Estágio Supervisionado', 60);

  -- Enfermagem Cirúrgica e em Centro Cirúrgico
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem Cirúrgica e em Centro Cirúrgico', 110, 'Cuidados pré, trans e pós-operatórios, instrumentação cirúrgica, CME e estágio cirúrgico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 50);

  -- Enfermagem em Saúde Mental
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Saúde Mental', 60, 'Transtornos psiquiátricos, reforma psiquiátrica, assistência humanizada e estágio em saúde mental.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Estágio Supervisionado', 30);

  -- Enfermagem em Saúde Coletiva
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Saúde Coletiva', 90, 'Ações preventivas no SUS, imunização, vigilância epidemiológica e estágio em saúde pública.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 10),
    (v_disc_id, 'Estágio Supervisionado', 40);

  -- Assistência à Saúde do Idoso
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Assistência à Saúde do Idoso', 60, 'Aspectos do envelhecimento, patologias geriátricas e estágio geriátrico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Estágio Supervisionado', 30);

  -- Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia', 130, 'Assistência pré-natal, parto, puerpério, cuidados ao recém-nascido e estágio obstétrico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 50),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 60);

  -- Enfermagem em Urgência e Emergência
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Urgência e Emergência', 80, 'Protocolos de urgência e emergência (SAMU, pronto-socorro) e estágio correlacionado.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 10),
    (v_disc_id, 'Estágio Supervisionado', 40);


  -- ==========================================
  -- MÓDULO III - GERENCIAMENTO DE ENFERMAGEM (Carga Horária: 530h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO III - GERENCIAMENTO DE ENFERMAGEM')
  RETURNING id INTO v_mod3_id;

  -- Administração em Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Administração em Enfermagem', 120, 'Gerenciamento de equipes, dimensionamento de pessoal de enfermagem, liderança e estágio gerencial.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 30),
    (v_disc_id, 'Estágio Supervisionado', 60);

  -- Técnicas no Controle de Infecção Hospitalar
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Técnicas no Controle de Infecção Hospitalar', 30, 'Medidas de prevenção da infecção hospitalar, CCIH e higienização.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 10);

  -- Técnicas Especializadas em Enfermagem a Pacientes na UTI
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Técnicas Especializadas em Enfermagem a Pacientes na UTI', 90, 'Cuidados a pacientes críticos na unidade de terapia intensiva e estágio em UTI.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 40);

  -- Humanização da Assistência
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Humanização da Assistência', 30, 'Políticas de humanização da assistência ao paciente e familiares na saúde pública e privada.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 10);

  -- Enfermagem em Saúde da Criança e do Adolescente
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Enfermagem em Saúde da Criança e do Adolescente', 110, 'Pediatria e hebiatria, crescimento e desenvolvimento, patologias comuns e estágio pediátrico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 50);

  -- Assistência de Enfermagem em Oncologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Assistência de Enfermagem em Oncologia', 100, 'Cuidados paliativos, quimioterapia, radioterapia e estágio oncológico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 50);

  -- Projeto Cientifico em Enfermagem - PCE
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Projeto Cientifico em Enfermagem - PCE', 50, 'Elaboração e apresentação de projeto científico e pesquisa acadêmica de conclusão.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 30);

END $$;
-- Migração: Seed do Curso Técnico em Radiologia e Grade Curricular
-- Autor: Antigravity

-- 1. Inserir ou atualizar o Curso de Técnico em Radiologia
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria, status, area, descricao, versao, duracao_meses, publicar_site)
VALUES (
  'c0000000-0000-0000-0000-000000000002',
  'Técnico em Radiologia',
  'TECNICO',
  1620,
  'ativo',
  'Saúde',
  'Formação capacitada para realização de exames radiográficos convencionais e especiais, processamento de imagens químicas e digitais, tomografia computadorizada e ressonância magnética.',
  '1.0',
  24,
  true
) ON CONFLICT (id) DO UPDATE SET
  carga_horaria = 1620,
  area = 'Saúde',
  duracao_meses = 24,
  publicar_site = true;

-- 2. Inserir Módulos, Disciplinas e Aulas associados
DO $$
DECLARE
  v_curso_id UUID := 'c0000000-0000-0000-0000-000000000002';
  v_mod1_id UUID;
  v_mod2_id UUID;
  v_mod3_id UUID;
  v_mod4_id UUID;
  v_disc_id UUID;
BEGIN
  -- Limpar módulos existentes para este curso para garantir preenchimento sem duplicidade
  DELETE FROM public.modulos WHERE curso_id = v_curso_id;
    
  -- ==========================================
  -- MÓDULO I - FUNDAMENTOS DA SAÚDE (Carga Horária: 300h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO I - FUNDAMENTOS DA SAÚDE')
  RETURNING id INTO v_mod1_id;

  -- Psicologia das Relações Humanas
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Psicologia das Relações Humanas', 20, 'Estudo das dinâmicas interpessoais, ética e postura ética e profissional no acolhimento ao paciente.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Higiene, Profilaxia e Orientação para Autocuidado
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Higiene, Profilaxia e Orientação para Autocuidado', 60, 'Prevenção de doenças ocupacionais, higienização hospitalar e qualidade de vida.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Anatomia e Fisiologia Humana Aplicada à Radiologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Anatomia e Fisiologia Humana Aplicada à Radiologia', 80, 'Estudo completo da anatomia esquelética, órgãos e sistemas com foco na exatidão do posicionamento radiográfico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Promoções de Saúde e Segurança no Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Promoções de Saúde e Segurança no Trabalho', 40, 'Legislação trabalhista e medidas de proteção e bem-estar no ambiente laboral da radiologia.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Biossegurança nas Ações de Saúde
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Biossegurança nas Ações de Saúde', 60, 'Prevenção de infecções hospitalares, desinfecção de equipamentos e controle de contaminantes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Primeiros Socorros
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Primeiros Socorros', 40, 'Procedimentos imediatos e suporte básico de vida em situações emergenciais no ambiente de exames.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);


  -- ==========================================
  -- MÓDULO II - FUNDAMENTOS DA RADIOLOGIA (Carga Horária: 420h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO II - FUNDAMENTOS DA RADIOLOGIA')
  RETURNING id INTO v_mod2_id;

  -- História da Radiologia e Física das Radiações
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'História da Radiologia e Física das Radiações', 40, 'Evolução histórica do Raio-X e os princípios físicos da produção de radiação ionizante.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Legislação e Ética Profissional
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Legislação e Ética Profissional', 40, 'Códigos de conduta em radiologia, responsabilidade civil e regulação legal da profissão.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Fundamentos de Enfermagem Aplicados à Radiologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Fundamentos de Enfermagem Aplicados à Radiologia', 80, 'Cuidados de enfermagem básicos em ambientes radiológicos e auxílio a pacientes em exames.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Proteção Radiológica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Proteção Radiológica', 60, 'Estudo das normas CNEN e diretrizes protetivas contra radiação para profissionais e pacientes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Estudo Radiológico das Doenças
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Estudo Radiológico das Doenças', 80, 'Identificação básica de manifestações patológicas nas imagens radiográficas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Estágio I
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Estágio I', 120, 'Prática profissional supervisionada em radiologia convencional de baixa complexidade.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Estágio Supervisionado', 120);


  -- ==========================================
  -- MÓDULO III - TÉCNICAS RADIOLÓGICAS (Carga Horária: 580h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO III - TÉCNICAS RADIOLÓGICAS')
  RETURNING id INTO v_mod3_id;

  -- Incidências Radiográficas Básicas
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Incidências Radiográficas Básicas', 120, 'Posicionamento radiográfico de rotina de membros, tronco e crânio.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 80),
    (v_disc_id, 'Aulas Práticas', 40);

  -- Processamento Químico de Filmes
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Processamento Químico de Filmes', 40, 'Funcionamento da câmara escura e revelação manual/automática em química analógica.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Processamento de Imagens Digitais
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Processamento de Imagens Digitais', 40, 'Tecnologias de radiologia digital CR e DR e manipulação eletrônica de contraste e brilho.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Exames Radiológicos com Contraste
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Exames Radiológicos com Contraste', 40, 'Aplicação clínica de contrastes iodados, baritados e reações adversas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Incidências Radiográficas Especiais
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Incidências Radiográficas Especiais', 80, 'Posicionamentos e angulações de alta complexidade e estudos complementares.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Mamografia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Mamografia', 40, 'Técnicas de compressão, incidências mamográficas e diagnóstico de mama.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Tomografia Computadorizada
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Tomografia Computadorizada', 40, 'Princípios físicos do tomógrafo, aquisição helicoidal e reconstruções 3D.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Estágio II
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Estágio II', 180, 'Prática profissional em exames contrastados e incidências especiais.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Estágio Supervisionado', 180);


  -- ==========================================
  -- MÓDULO IV - RADIOLOGIA AVANÇADA (Carga Horária: 320h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO IV - RADIOLOGIA AVANÇADA')
  RETURNING id INTO v_mod4_id;

  -- Informática Instrumental
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Informática Instrumental', 40, 'Uso de sistemas PACS, DICOM e ferramentas digitais básicas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 28),
    (v_disc_id, 'Aulas Práticas', 12);

  -- Gestão de Serviços Radiológicos
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Gestão de Serviços Radiológicos', 40, 'Administração, controle de insumos e fluxo de atendimento em clínicas e hospitais.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Ressonância Magnética
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Ressonância Magnética', 40, 'Princípios físicos do magnetismo nuclear, bobinas e aquisição de imagens por RM.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Radiologia Odontológica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Radiologia Odontológica', 40, 'Técnicas intrabucais (periapical) e extrabucais (panorâmica).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Noções de Medicina Nuclear
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Noções de Medicina Nuclear', 20, 'Uso de radiofármacos para fins de diagnósticos cintilográficos.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Noções de Radioterapia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Noções de Radioterapia', 20, 'Planejamento e administração de radiação terapêutica em oncologia.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Estágio III
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Estágio III', 120, 'Prática profissional avançada em tomografia, ressonância ou odontológica.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Estágio Supervisionado', 120);

END $$;
-- Migration: Adiciona coluna tipo_documento na tabela parceiros
-- Contexto: A nova Carteira Nacional de Identificação (CIN) substitui o antigo RG.
-- O campo aceita: CIN, CNH, PASSAPORTE, CARTEIRA PROFISSIONAL, RG (ANTIGO)

ALTER TABLE parceiros
ADD COLUMN IF NOT EXISTS tipo_documento TEXT 
  DEFAULT 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'
  CHECK (tipo_documento IN (
    'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    'CNH',
    'PASSAPORTE',
    'CARTEIRA PROFISSIONAL',
    'RG (ANTIGO)'
  ));

-- Atualiza registros existentes que tinham RG: preenche com 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO' (padrão)
UPDATE parceiros
SET tipo_documento = 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'
WHERE tipo_documento IS NULL;

-- Adiciona comentário à coluna para documentação
COMMENT ON COLUMN parceiros.tipo_documento IS 
  'Tipo do documento de identificação do parceiro/aluno. Novo padrão: Carteira Nacional de Identificação (CIN) — substitui o antigo RG.';
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
-- Migração: Adição de coluna watermark_rotate para controle de rotação da marca d'água
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS watermark_rotate BOOLEAN DEFAULT true;
-- Migração: Adição de colunas de endereço, contato e logotipo na tabela public.polos
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Atualizar o polo Matriz com os dados atuais da empresa principal
UPDATE public.polos p
SET 
  endereco = e.endereco,
  numero = e.numero,
  bairro = e.bairro,
  cep = e.cep,
  telefone = e.telefone,
  email = e.email,
  logo_url = e.logo_url
FROM public.empresas e
WHERE p.is_matriz = true AND p.company_id = e.id;
-- Migração: Função RPC para cálculo de regras financeiras da turma (sem lógica no frontend)
-- Autor: Antigravity

CREATE OR REPLACE FUNCTION public.calcular_regras_financeiras_turma(
  valor_parcela NUMERIC,
  desconto_pontualidade NUMERIC,
  juros_atraso_percentual NUMERIC,
  multa_atraso NUMERIC
)
RETURNS TABLE (
  valor_com_desconto NUMERIC,
  juros_calculados NUMERIC,
  valor_com_atraso NUMERIC
) AS $$
DECLARE
  v_desconto NUMERIC := COALESCE(desconto_pontualidade, 0);
  v_juros NUMERIC := ROUND((valor_parcela * (COALESCE(juros_atraso_percentual, 0) / 100.0)), 2);
  v_multa NUMERIC := COALESCE(multa_atraso, 0);
BEGIN
  RETURN QUERY SELECT
    ROUND(GREATEST(0, valor_parcela - v_desconto), 2) AS valor_com_desconto,
    v_juros AS juros_calculados,
    ROUND(valor_parcela + v_juros + v_multa, 2) AS valor_com_atraso;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
-- Migração: Adição de campos de configuração financeira na tabela turmas
-- Autor: Antigravity

ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS valor_matricula NUMERIC(10,2) NOT NULL DEFAULT 150.00;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS valor_rematricula NUMERIC(10,2) NOT NULL DEFAULT 100.00;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS qtd_parcelas INTEGER NOT NULL DEFAULT 22;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS valor_parcela NUMERIC(10,2) NOT NULL DEFAULT 350.00;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS desconto_pontualidade NUMERIC(10,2) NOT NULL DEFAULT 20.00;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS juros_atraso NUMERIC(5,2) NOT NULL DEFAULT 2.00;
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS multa_atraso NUMERIC(10,2) NOT NULL DEFAULT 5.00;

-- Garantir privilégios para os roles do Supabase
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

