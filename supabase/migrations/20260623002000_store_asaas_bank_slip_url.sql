ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS asaas_bank_slip_url TEXT,
  ADD COLUMN IF NOT EXISTS asaas_installment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contas_receber_asaas_installment_id
  ON public.contas_receber (asaas_installment_id)
  WHERE asaas_installment_id IS NOT NULL;
