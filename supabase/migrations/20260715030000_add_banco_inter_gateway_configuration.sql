-- Cadastra o Banco Inter com credenciais separadas por ambiente.
-- Client Secret, certificado e chave privada nunca ficam em tabelas publicas:
-- os valores sao gravados exclusivamente no Supabase Vault pela service_role.

INSERT INTO public.payment_gateway_providers (
  code,
  name,
  description,
  supports_pix,
  supports_boleto,
  supports_credit_card,
  requires_polling,
  has_public_api,
  active,
  metadata
)
VALUES (
  'banco_inter',
  'Banco Inter',
  'API oficial do Inter Empresas para Pix Cobranca e Boleto com Pix, com OAuth e certificado mTLS.',
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  TRUE,
  TRUE,
  jsonb_build_object(
    'intended_role', 'pix_bolepix',
    'authentication', 'oauth2_mtls',
    'account_header_optional', TRUE,
    'sandbox_base_url', 'https://cdpj-sandbox.partners.uatinter.co',
    'production_base_url', 'https://cdpj.partners.bancointer.com.br',
    'scopes', ARRAY[
      'cob.read', 'cob.write', 'cobv.read', 'cobv.write', 'pix.read',
      'webhook.read', 'webhook.write',
      'boleto-cobranca.read', 'boleto-cobranca.write'
    ],
    'checkout_blocked', TRUE,
    'checkout_block_reason', 'Aguardando homologacao das credenciais, emissao e callbacks do Banco Inter.'
  )
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  supports_pix = EXCLUDED.supports_pix,
  supports_boleto = EXCLUDED.supports_boleto,
  supports_credit_card = EXCLUDED.supports_credit_card,
  requires_polling = EXCLUDED.requires_polling,
  has_public_api = EXCLUDED.has_public_api,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.payment_gateway_credentials (
  provider_code,
  environment,
  label,
  configured,
  metadata
)
VALUES
  ('banco_inter', 'sandbox', 'Banco Inter Sandbox', FALSE, '{}'::jsonb),
  ('banco_inter', 'production', 'Banco Inter Producao', FALSE, '{}'::jsonb)
ON CONFLICT (provider_code, environment) DO UPDATE SET
  label = EXCLUDED.label,
  updated_at = now();

-- O cadastro anterior do Banese estava vazio e nao era usado por nenhuma rota.
-- Mantemos o registro por compatibilidade historica, mas fora da configuracao ativa.
UPDATE public.payment_gateway_providers
SET active = FALSE,
    updated_at = now()
WHERE code = 'banese_card'
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_gateway_routes
    WHERE provider_code = 'banese_card'
  );

CREATE OR REPLACE FUNCTION public.payment_gateway_set_secret(
  p_secret_name TEXT,
  p_secret_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  IF p_secret_name !~ '^payment_gateway_(asaas|mercado_pago|banco_inter|banese_card)_(sandbox|production)_(api_key|access_token|public_key|client_id|client_secret|webhook_secret|webhook_token|crt_access_token|certificate_pem|private_key_pem)$' THEN
    RAISE EXCEPTION 'Nome de segredo nao permitido.';
  END IF;

  IF NULLIF(BTRIM(p_secret_value), '') IS NULL THEN
    RAISE EXCEPTION 'O segredo nao pode ficar vazio.';
  END IF;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = p_secret_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integracao bancaria'
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integracao bancaria'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_gateway_get_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF p_secret_name !~ '^payment_gateway_(asaas|mercado_pago|banco_inter|banese_card)_(sandbox|production)_(api_key|access_token|public_key|client_id|client_secret|webhook_secret|webhook_token|crt_access_token|certificate_pem|private_key_pem)$' THEN
    RAISE EXCEPTION 'Nome de segredo nao permitido.';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_gateway_set_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_gateway_get_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_gateway_set_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_gateway_get_secret(TEXT) TO service_role;

COMMENT ON FUNCTION public.payment_gateway_set_secret(TEXT, TEXT) IS
  'Grava segredos de gateways no Vault. Executavel apenas pela service_role.';
COMMENT ON FUNCTION public.payment_gateway_get_secret(TEXT) IS
  'Le segredos de gateways no Vault. Executavel apenas pela service_role.';
