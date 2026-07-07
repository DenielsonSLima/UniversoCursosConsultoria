-- Normaliza códigos legados de provedores para o padrão do roteador modular.
-- Evita falhas de roteamento quando o cadastro ainda usa formatos antigos
-- como `mercado-pago`, `asaas-checkout` ou `banese`.

BEGIN;

UPDATE public.payment_gateway_routes
SET provider_code = 'mercado_pago'
WHERE provider_code IN ('mercado-pago', 'mercado pago', 'mercado_pago_checkout', 'mercadopago');

UPDATE public.payment_gateway_routes
SET provider_code = 'mercado_pago'
WHERE provider_code IN ('Mercado Pago', 'Mercado_Pago');

UPDATE public.payment_gateway_routes
SET provider_code = 'banese_card'
WHERE provider_code IN ('banese', 'banese-card', 'banese_card_checkout', 'banesecard', 'Banese');

UPDATE public.payment_gateway_routes
SET provider_code = 'asaas'
WHERE provider_code IN ('asaas-checkout', 'asaas_checkout', 'asaas checkout', 'Asaas');

UPDATE public.payment_gateway_credentials
SET provider_code = 'mercado_pago'
WHERE provider_code IN ('mercado-pago', 'mercado pago', 'mercado_pago_checkout', 'mercadopago');

UPDATE public.payment_gateway_credentials
SET provider_code = 'mercado_pago'
WHERE provider_code IN ('Mercado Pago', 'Mercado_Pago');

UPDATE public.payment_gateway_credentials
SET provider_code = 'banese_card'
WHERE provider_code IN ('banese', 'banese-card', 'banese_card_checkout', 'banesecard', 'Banese');

UPDATE public.payment_gateway_credentials
SET provider_code = 'asaas'
WHERE provider_code IN ('asaas-checkout', 'asaas_checkout', 'asaas checkout', 'Asaas');

UPDATE public.payment_gateway_transactions
SET provider_code = 'mercado_pago'
WHERE provider_code IN ('mercado-pago', 'mercado pago', 'mercado_pago_checkout', 'mercadopago', 'Mercado Pago', 'Mercado_Pago');

UPDATE public.payment_gateway_transactions
SET provider_code = 'banese_card'
WHERE provider_code IN ('banese', 'banese-card', 'banese_card_checkout', 'banesecard', 'Banese');

UPDATE public.payment_gateway_transactions
SET provider_code = 'asaas'
WHERE provider_code IN ('asaas-checkout', 'asaas_checkout', 'asaas checkout', 'Asaas');

UPDATE public.payment_gateway_webhook_events
SET provider_code = 'mercado_pago'
WHERE provider_code IN ('mercado-pago', 'mercado pago', 'mercado_pago_checkout', 'mercadopago', 'Mercado Pago', 'Mercado_Pago');

UPDATE public.payment_gateway_webhook_events
SET provider_code = 'banese_card'
WHERE provider_code IN ('banese', 'banese-card', 'banese_card_checkout', 'banesecard', 'Banese');

UPDATE public.payment_gateway_webhook_events
SET provider_code = 'asaas'
WHERE provider_code IN ('asaas-checkout', 'asaas_checkout', 'asaas checkout', 'Asaas');

UPDATE public.contas_receber
SET gateway_provider = 'mercado_pago'
WHERE gateway_provider IN ('mercado-pago', 'mercado pago', 'mercado_pago_checkout', 'mercadopago', 'Mercado Pago', 'Mercado_Pago');

UPDATE public.contas_receber
SET gateway_provider = 'banese_card'
WHERE gateway_provider IN ('banese', 'banese-card', 'banese_card_checkout', 'banesecard', 'Banese');

UPDATE public.contas_receber
SET gateway_provider = 'asaas'
WHERE gateway_provider IN ('asaas-checkout', 'asaas_checkout', 'asaas checkout', 'Asaas');

UPDATE public.inscricoes_online
SET gateway_provider = 'mercado_pago'
WHERE gateway_provider IN ('mercado-pago', 'mercado pago', 'mercado_pago_checkout', 'mercadopago', 'Mercado Pago', 'Mercado_Pago');

UPDATE public.inscricoes_online
SET gateway_provider = 'banese_card'
WHERE gateway_provider IN ('banese', 'banese-card', 'banese_card_checkout', 'banesecard', 'Banese');

UPDATE public.inscricoes_online
SET gateway_provider = 'asaas'
WHERE gateway_provider IN ('asaas-checkout', 'asaas_checkout', 'asaas checkout', 'Asaas');

UPDATE public.payment_gateway_providers
SET name = 'Banese Card',
    description = 'Banco Banese Card para Pix/SAB Guias e boleto em homologação. Cartão de crédito não é suportado neste fluxo.',
    supports_pix = TRUE,
    supports_boleto = TRUE,
    supports_credit_card = FALSE,
    requires_polling = TRUE,
    has_public_api = FALSE,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'card_supported', false,
      'checkout_blocked', true,
      'checkout_block_reason', 'Aguardando homologação Banese Card de payload por cobrança, exibição do retorno bancário e conciliação.'
    ),
    updated_at = now()
WHERE code = 'banese_card';

UPDATE public.payment_gateway_credentials
SET label = CASE environment
  WHEN 'production' THEN 'Banese Card Produção'
  ELSE 'Banese Card Sandbox'
END,
updated_at = now()
WHERE provider_code = 'banese_card'
  AND (label IS NULL OR label ILIKE '%Banese%');

COMMIT;
