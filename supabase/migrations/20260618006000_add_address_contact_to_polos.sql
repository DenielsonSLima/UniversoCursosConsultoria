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
