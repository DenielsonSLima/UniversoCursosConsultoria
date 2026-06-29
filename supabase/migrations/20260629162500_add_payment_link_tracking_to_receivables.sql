ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS asaas_payment_link_id text;

CREATE INDEX IF NOT EXISTS idx_contas_receber_asaas_payment_link_id
  ON public.contas_receber (asaas_payment_link_id)
  WHERE asaas_payment_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_receber_matricula_tipo
  ON public.contas_receber (matricula_id, tipo_lancamento)
  WHERE matricula_id IS NOT NULL;
