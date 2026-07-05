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
  IF p_secret_name !~ '^payment_gateway_(asaas|mercado_pago|banese_card)_(sandbox|production)_(api_key|access_token|public_key|client_id|client_secret|webhook_secret|webhook_token|crt_access_token)$' THEN
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
      'Segredo gerenciado pela integração bancária'
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integração bancária'
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
  IF p_secret_name !~ '^payment_gateway_(asaas|mercado_pago|banese_card)_(sandbox|production)_(api_key|access_token|public_key|client_id|client_secret|webhook_secret|webhook_token|crt_access_token)$' THEN
    RAISE EXCEPTION 'Nome de segredo não permitido.';
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
