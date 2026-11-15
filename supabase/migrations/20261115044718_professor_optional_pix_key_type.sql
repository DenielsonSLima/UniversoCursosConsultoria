BEGIN;

ALTER TABLE public.parceiros
  ADD COLUMN tipo_chave_pix text;

ALTER TABLE public.parceiros
  ADD CONSTRAINT parceiros_tipo_chave_pix_allowed
    CHECK (tipo_chave_pix IS NULL OR tipo_chave_pix IN ('CPF', 'CNPJ', 'PHONE', 'EMAIL', 'EVP')),
  ADD CONSTRAINT parceiros_typed_pix_requires_key
    CHECK (tipo_chave_pix IS NULL OR nullif(btrim(chave_pix), '') IS NOT NULL);

COMMENT ON COLUMN public.parceiros.tipo_chave_pix IS
  'Tipo Pix informado explicitamente. NULL preserva a chave legada sem inferir CPF ou telefone.';

COMMIT;
