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

