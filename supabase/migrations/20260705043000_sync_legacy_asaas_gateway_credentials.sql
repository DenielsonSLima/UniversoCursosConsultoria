UPDATE public.payment_gateway_credentials
SET
  configured = true,
  api_key_configured = true,
  webhook_secret_configured = true,
  last_test_status = COALESCE(last_test_status, 'LEGACY_CONFIGURED'),
  last_test_message = COALESCE(
    last_test_message,
    'Chaves legadas do Asaas sandbox detectadas e vinculadas a integracao bancaria modular.'
  ),
  updated_at = NOW()
WHERE provider_code = 'asaas'
  AND environment = 'sandbox'
  AND public.asaas_get_secret('asaas_sandbox_api_key') IS NOT NULL
  AND LENGTH(public.asaas_get_secret('asaas_sandbox_api_key')) > 0;
