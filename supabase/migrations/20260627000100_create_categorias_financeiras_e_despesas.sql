-- ============================================================
-- Migração: Categorias Financeiras + Lançamentos de Despesas
-- ============================================================

-- ============================================================
-- 1. TABELA: CATEGORIAS FINANCEIRAS
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'DESPESA_FIXA',
    -- DESPESA_FIXA | DESPESA_VARIAVEL | OUTRO_DEBITO
  descricao    TEXT,
  status       TEXT NOT NULL DEFAULT 'ativo',  -- ativo | inativo
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE categorias_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total categorias_financeiras"
  ON categorias_financeiras FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. TABELA: DESPESAS / LANÇAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS despesas_lancamentos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id               UUID REFERENCES polos(id) ON DELETE SET NULL,
  tipo                  TEXT NOT NULL DEFAULT 'FIXA',
    -- FIXA | VARIAVEL | OUTRO_DEBITO
  descricao             TEXT NOT NULL,
  valor                 NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  data_vencimento       DATE NOT NULL,
  data_pagamento        DATE,
  valor_pago            NUMERIC(15, 2),
  status                TEXT NOT NULL DEFAULT 'PENDENTE',
    -- PENDENTE | PAGO | VENCIDO | CANCELADO
  categoria_financeira_id UUID REFERENCES categorias_financeiras(id) ON DELETE SET NULL,
  fornecedor_id         UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  forma_pagamento       TEXT,
    -- PIX | BOLETO | TED | DINHEIRO | CARTAO
  conta_bancaria_id     UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  -- Parcelas
  parcela_numero        INTEGER NOT NULL DEFAULT 1,
  total_parcelas        INTEGER NOT NULL DEFAULT 1,
  grupo_parcelas_id     UUID,  -- UUID compartilhado entre parcelas do mesmo grupo
  -- Metadados
  observacao            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE despesas_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total despesas_lancamentos"
  ON despesas_lancamentos FOR ALL USING (true) WITH CHECK (true);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_despesas_polo_id ON despesas_lancamentos(polo_id);
CREATE INDEX IF NOT EXISTS idx_despesas_tipo ON despesas_lancamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_despesas_status ON despesas_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_despesas_data_vencimento ON despesas_lancamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria ON despesas_lancamentos(categoria_financeira_id);
CREATE INDEX IF NOT EXISTS idx_despesas_grupo_parcelas ON despesas_lancamentos(grupo_parcelas_id);

-- ============================================================
-- 3. FUNÇÃO: Atualizar status vencidos automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION fn_atualizar_despesas_vencidas()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE despesas_lancamentos
  SET status = 'VENCIDO', updated_at = now()
  WHERE status = 'PENDENTE'
    AND data_vencimento < CURRENT_DATE;
END;
$$;

-- ============================================================
-- 4. SEED: Categorias Financeiras
-- ============================================================

-- Despesas Fixas
INSERT INTO categorias_financeiras (id, nome, tipo, descricao, status) VALUES
  ('cf010101-0101-0101-0101-010101010101', 'Aluguel', 'DESPESA_FIXA', 'Aluguel de imóveis e salas', 'ativo'),
  ('cf020202-0202-0202-0202-020202020202', 'Energia Elétrica', 'DESPESA_FIXA', 'Contas de luz das unidades', 'ativo'),
  ('cf030303-0303-0303-0303-030303030303', 'Internet / Telefone', 'DESPESA_FIXA', 'Serviços de conectividade', 'ativo'),
  ('cf040404-0404-0404-0404-040404040404', 'Folha de Pagamento', 'DESPESA_FIXA', 'Salários e encargos trabalhistas', 'ativo'),
  ('cf050505-0505-0505-0505-050505050505', 'Pró-labore', 'DESPESA_FIXA', 'Retirada dos sócios', 'ativo'),
  ('cf060606-0606-0606-0606-060606060606', 'Seguro', 'DESPESA_FIXA', 'Seguros patrimoniais e veiculares', 'ativo'),
  ('cf070707-0707-0707-0707-070707070707', 'Água / Gás', 'DESPESA_FIXA', 'Consumo de água e gás', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- Despesas Variáveis
INSERT INTO categorias_financeiras (id, nome, tipo, descricao, status) VALUES
  ('cf080808-0808-0808-0808-080808080808', 'Material de Escritório', 'DESPESA_VARIAVEL', 'Papelaria, impressão e suprimentos', 'ativo'),
  ('cf090909-0909-0909-0909-090909090909', 'Manutenção', 'DESPESA_VARIAVEL', 'Reparos e conservação predial', 'ativo'),
  ('cf101010-1010-1010-1010-101010101010', 'Marketing / Publicidade', 'DESPESA_VARIAVEL', 'Campanhas e divulgação', 'ativo'),
  ('cf111111-1111-1111-1111-111111111111', 'Serviços de TI', 'DESPESA_VARIAVEL', 'Suporte técnico e desenvolvimento', 'ativo'),
  ('cf121212-1212-1212-1212-121212121212', 'Transporte / Combustível', 'DESPESA_VARIAVEL', 'Deslocamentos e abastecimento', 'ativo'),
  ('cf131313-1313-1313-1313-131313131313', 'Alimentação', 'DESPESA_VARIAVEL', 'Lanches, refeições e eventos', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- Outros Débitos
INSERT INTO categorias_financeiras (id, nome, tipo, descricao, status) VALUES
  ('cf141414-1414-1414-1414-141414141414', 'Taxas Bancárias', 'OUTRO_DEBITO', 'Tarifas e taxas de manutenção bancária', 'ativo'),
  ('cf151515-1515-1515-1515-151515151515', 'Impostos e Tributos', 'OUTRO_DEBITO', 'DAS, IPTU, ISS e demais tributos', 'ativo'),
  ('cf161616-1616-1616-1616-161616161616', 'Juros e Multas', 'OUTRO_DEBITO', 'Encargos por atraso de pagamentos', 'ativo'),
  ('cf171717-1717-1717-1717-171717171717', 'Devolução / Estorno', 'OUTRO_DEBITO', 'Devoluções e estornos financeiros', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. HABILITAR REALTIME
-- ============================================================
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE categorias_financeiras;
  ALTER PUBLICATION supabase_realtime ADD TABLE despesas_lancamentos;
COMMIT;
