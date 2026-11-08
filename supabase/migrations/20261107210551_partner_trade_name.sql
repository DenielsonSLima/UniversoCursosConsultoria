-- Razão social continua em parceiros.nome; fantasia tem persistência própria.
ALTER TABLE public.parceiros ADD COLUMN IF NOT EXISTS nome_fantasia text;

COMMENT ON COLUMN public.parceiros.nome_fantasia IS
  'Nome fantasia da pessoa jurídica, informado no cadastro ou confirmado por CNPJ. Razão social permanece em nome.';
