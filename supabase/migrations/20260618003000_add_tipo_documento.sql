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
