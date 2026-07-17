BEGIN;

-- Retorno oficial do Banese em 16/07/2026:
-- homologacao oferece linha digitavel + codigo de barras; em producao o banco
-- ativa o Pix no mesmo boleto. Portanto BolePix e BOLETO, nao uma rota PIX
-- independente nem uma segunda cobranca SAB Guias.
UPDATE public.payment_gateway_providers
SET description = 'Boleto em homologacao; o Banese ativara o BolePix no mesmo titulo em producao.',
    supports_pix = FALSE,
    supports_boleto = TRUE,
    supports_credit_card = FALSE,
    requires_polling = TRUE,
    metadata = (coalesce(metadata, '{}'::jsonb) - 'pix_block_reason') ||
      jsonb_build_object(
        'intended_role', 'bolepix_boleto',
        'bolepix_bank_managed', TRUE,
        'bolepix_homologation_available', FALSE,
        'bolepix_production_activation', 'O Banese acrescentara o QR Code na resposta da propria API de boletos.',
        'reconciliation_primary_method', 'polling',
        'webhook_role', 'accelerator_pending_contract'
      ),
    updated_at = now()
WHERE code = 'banese_card';

UPDATE public.payment_gateway_routes
SET enabled = FALSE,
    notes = 'BolePix usa a rota BOLETO. Nao existe rota PIX Banese separada para este convenio.',
    updated_at = now()
WHERE provider_code = 'banese_card'
  AND payment_method = 'PIX';

UPDATE public.payment_gateway_credentials
SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'banesePixHomologacaoDisponivel', FALSE,
      'bolepixBankManaged', TRUE,
      'reconciliationPrimaryMethod', 'polling',
      'notes', CASE
        WHEN environment = 'sandbox'
          THEN 'Homologacao Banese: somente linha digitavel e codigo de barras. BolePix sera ativado pelo banco em producao.'
        ELSE 'Producao permanece bloqueada ate a liberacao formal do Banese e o recebimento do exemplo JSON com os campos do QR BolePix.'
      END
    ),
    updated_at = now()
WHERE provider_code = 'banese_card';

COMMIT;
