BEGIN;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_creation_token uuid;

COMMENT ON COLUMN public.contas_receber.gateway_creation_token IS
  'Token efemero de ownership da tentativa de criacao no gateway; impede POST e cleanup concorrentes.';

CREATE INDEX IF NOT EXISTS contas_receber_gateway_creation_token_idx
  ON public.contas_receber (gateway_creation_token)
  WHERE gateway_creation_token IS NOT NULL;

COMMIT;
