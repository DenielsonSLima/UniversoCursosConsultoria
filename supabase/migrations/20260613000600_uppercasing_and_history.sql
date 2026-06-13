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
