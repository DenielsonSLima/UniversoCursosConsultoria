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
