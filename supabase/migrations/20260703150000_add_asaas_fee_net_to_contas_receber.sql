-- Store checkout fee and net value calculated at Asaas charge time.
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS asaas_fee_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS asaas_net_value numeric(14,2);
