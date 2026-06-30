ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS asaas_transaction_receipt_url TEXT;

COMMENT ON COLUMN public.contas_receber.asaas_transaction_receipt_url IS
  'URL oficial do comprovante de transacao retornado pelo Asaas para pagamentos, estornos ou baixas.';
