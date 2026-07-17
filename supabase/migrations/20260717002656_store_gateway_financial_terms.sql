ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_financial_terms jsonb,
  ADD COLUMN IF NOT EXISTS gateway_financial_terms_confirmed_at timestamptz;

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_gateway_financial_terms_object;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_gateway_financial_terms_object
  CHECK (
    gateway_financial_terms IS NULL
    OR jsonb_typeof(gateway_financial_terms) = 'object'
  );

COMMENT ON COLUMN public.contas_receber.gateway_financial_terms IS
  'Snapshot imutavel dos termos financeiros confirmados pelo gateway para o titulo emitido.';

COMMENT ON COLUMN public.contas_receber.gateway_financial_terms_confirmed_at IS
  'Instante em que desconto, multa e juros do titulo foram confirmados no gateway.';

CREATE OR REPLACE FUNCTION public.protect_receivable_gateway_managed_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trusted_writer boolean :=
    coalesce(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin');
BEGIN
  IF v_trusted_writer THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF
      NEW.asaas_bank_slip_url IS NOT NULL OR
      NEW.asaas_fee_value IS NOT NULL OR
      NEW.asaas_installment_id IS NOT NULL OR
      NEW.asaas_invoice_url IS NOT NULL OR
      NEW.asaas_last_error IS NOT NULL OR
      NEW.asaas_net_value IS NOT NULL OR
      NEW.asaas_payment_id IS NOT NULL OR
      NEW.asaas_payment_link_id IS NOT NULL OR
      NEW.asaas_status IS NOT NULL OR
      NEW.asaas_synced_at IS NOT NULL OR
      NEW.asaas_transaction_receipt_url IS NOT NULL OR
      NEW.nosso_numero_asaas IS NOT NULL OR
      NEW.gateway_bank_slip_url IS NOT NULL OR
      NEW.gateway_boleto_agencia IS NOT NULL OR
      NEW.gateway_boleto_codigo_barras IS NOT NULL OR
      NEW.gateway_boleto_convenio IS NOT NULL OR
      NEW.gateway_boleto_linha_digitavel IS NOT NULL OR
      NEW.gateway_boleto_nosso_numero IS NOT NULL OR
      NEW.gateway_customer_id IS NOT NULL OR
      NEW.gateway_environment IS NOT NULL OR
      NEW.gateway_fee_value IS NOT NULL OR
      NEW.gateway_financial_terms IS NOT NULL OR
      NEW.gateway_financial_terms_confirmed_at IS NOT NULL OR
      NEW.gateway_installment_id IS NOT NULL OR
      NEW.gateway_installments IS NOT NULL OR
      NEW.gateway_invoice_url IS NOT NULL OR
      NEW.gateway_issuer_polo_id IS NOT NULL OR
      NEW.gateway_last_error IS NOT NULL OR
      NEW.gateway_net_value IS NOT NULL OR
      NEW.gateway_payment_id IS NOT NULL OR
      NEW.gateway_payment_link_id IS NOT NULL OR
      NEW.gateway_payment_method IS NOT NULL OR
      NEW.gateway_pix_encoded_image IS NOT NULL OR
      NEW.gateway_pix_payload IS NOT NULL OR
      NEW.gateway_provider IS NOT NULL OR
      NEW.gateway_status IS NOT NULL OR
      NEW.gateway_synced_at IS NOT NULL OR
      NEW.gateway_transaction_receipt_url IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Campos gerenciados pelo gateway somente podem ser gravados pelo servidor.';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.asaas_bank_slip_url,
    NEW.asaas_fee_value,
    NEW.asaas_installment_id,
    NEW.asaas_invoice_url,
    NEW.asaas_last_error,
    NEW.asaas_net_value,
    NEW.asaas_payment_id,
    NEW.asaas_payment_link_id,
    NEW.asaas_status,
    NEW.asaas_synced_at,
    NEW.asaas_transaction_receipt_url,
    NEW.nosso_numero_asaas,
    NEW.gateway_bank_slip_url,
    NEW.gateway_boleto_agencia,
    NEW.gateway_boleto_codigo_barras,
    NEW.gateway_boleto_convenio,
    NEW.gateway_boleto_linha_digitavel,
    NEW.gateway_boleto_nosso_numero,
    NEW.gateway_customer_id,
    NEW.gateway_environment,
    NEW.gateway_fee_value,
    NEW.gateway_financial_terms,
    NEW.gateway_financial_terms_confirmed_at,
    NEW.gateway_installment_id,
    NEW.gateway_installments,
    NEW.gateway_invoice_url,
    NEW.gateway_issuer_polo_id,
    NEW.gateway_last_error,
    NEW.gateway_net_value,
    NEW.gateway_payment_id,
    NEW.gateway_payment_link_id,
    NEW.gateway_payment_method,
    NEW.gateway_pix_encoded_image,
    NEW.gateway_pix_payload,
    NEW.gateway_provider,
    NEW.gateway_status,
    NEW.gateway_synced_at,
    NEW.gateway_transaction_receipt_url
  ) IS DISTINCT FROM ROW(
    OLD.asaas_bank_slip_url,
    OLD.asaas_fee_value,
    OLD.asaas_installment_id,
    OLD.asaas_invoice_url,
    OLD.asaas_last_error,
    OLD.asaas_net_value,
    OLD.asaas_payment_id,
    OLD.asaas_payment_link_id,
    OLD.asaas_status,
    OLD.asaas_synced_at,
    OLD.asaas_transaction_receipt_url,
    OLD.nosso_numero_asaas,
    OLD.gateway_bank_slip_url,
    OLD.gateway_boleto_agencia,
    OLD.gateway_boleto_codigo_barras,
    OLD.gateway_boleto_convenio,
    OLD.gateway_boleto_linha_digitavel,
    OLD.gateway_boleto_nosso_numero,
    OLD.gateway_customer_id,
    OLD.gateway_environment,
    OLD.gateway_fee_value,
    OLD.gateway_financial_terms,
    OLD.gateway_financial_terms_confirmed_at,
    OLD.gateway_installment_id,
    OLD.gateway_installments,
    OLD.gateway_invoice_url,
    OLD.gateway_issuer_polo_id,
    OLD.gateway_last_error,
    OLD.gateway_net_value,
    OLD.gateway_payment_id,
    OLD.gateway_payment_link_id,
    OLD.gateway_payment_method,
    OLD.gateway_pix_encoded_image,
    OLD.gateway_pix_payload,
    OLD.gateway_provider,
    OLD.gateway_status,
    OLD.gateway_synced_at,
    OLD.gateway_transaction_receipt_url
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Campos gerenciados pelo gateway somente podem ser alterados pelo servidor.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_receivable_gateway_managed_fields()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_receivable_gateway_managed_fields()
  TO service_role;

COMMENT ON FUNCTION public.protect_receivable_gateway_managed_fields() IS
  'Impede clientes autenticados de injetar ou alterar IDs, URLs, boleto, Pix, termos financeiros e status controlados pelos gateways.';
