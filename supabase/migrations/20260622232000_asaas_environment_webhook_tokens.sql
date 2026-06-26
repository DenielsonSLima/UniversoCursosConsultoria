CREATE OR REPLACE FUNCTION public.asaas_get_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF p_secret_name NOT IN (
    'asaas_sandbox_api_key',
    'asaas_production_api_key',
    'asaas_webhook_token',
    'asaas_sandbox_webhook_token',
    'asaas_production_webhook_token'
  ) THEN
    RAISE EXCEPTION 'Nome de segredo não permitido.';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_set_secret(p_secret_name TEXT, p_secret_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  IF p_secret_name NOT IN (
    'asaas_sandbox_api_key',
    'asaas_production_api_key',
    'asaas_webhook_token',
    'asaas_sandbox_webhook_token',
    'asaas_production_webhook_token'
  ) THEN
    RAISE EXCEPTION 'Nome de segredo não permitido.';
  END IF;

  IF NULLIF(BTRIM(p_secret_value), '') IS NULL THEN
    RAISE EXCEPTION 'O segredo não pode ficar vazio.';
  END IF;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = p_secret_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integração Asaas'
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integração Asaas'
    );
  END IF;
END;
$$;

DO $$
DECLARE
  v_legacy_token TEXT;
BEGIN
  v_legacy_token := public.asaas_get_secret('asaas_webhook_token');
  IF v_legacy_token IS NOT NULL THEN
    PERFORM public.asaas_set_secret('asaas_sandbox_webhook_token', v_legacy_token);
  END IF;
END;
$$;
