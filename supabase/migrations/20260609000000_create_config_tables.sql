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
