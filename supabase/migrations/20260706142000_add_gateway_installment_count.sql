ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_installments INTEGER;

ALTER TABLE public.payment_gateway_transactions
  ADD COLUMN IF NOT EXISTS installments INTEGER;

COMMENT ON COLUMN public.contas_receber.gateway_installments IS
  'Quantidade de parcelas solicitada na criacao da cobranca do gateway modular.';

COMMENT ON COLUMN public.payment_gateway_transactions.installments IS
  'Quantidade de parcelas solicitada na transacao do gateway modular.';
