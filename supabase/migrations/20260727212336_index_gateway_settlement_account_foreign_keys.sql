BEGIN;

CREATE INDEX IF NOT EXISTS payment_gateway_settlement_account_bank_idx
  ON public.payment_gateway_settlement_accounts (conta_bancaria_id);

CREATE INDEX IF NOT EXISTS payment_gateway_settlement_account_issuer_idx
  ON public.payment_gateway_settlement_accounts (issuer_polo_id);

COMMIT;
