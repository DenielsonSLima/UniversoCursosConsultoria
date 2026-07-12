-- Store WhatsApp Meta Cloud API secrets in Supabase Vault.

CREATE OR REPLACE FUNCTION public.whatsapp_set_secret(
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
  IF p_secret_name !~ '^whatsapp_(meta_access_token|webhook_verify_token)$' THEN
    RAISE EXCEPTION 'Nome de segredo WhatsApp nao permitido.';
  END IF;

  IF NULLIF(BTRIM(p_secret_value), '') IS NULL THEN
    RAISE EXCEPTION 'O segredo WhatsApp nao pode ficar vazio.';
  END IF;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = p_secret_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integracao WhatsApp Meta Cloud API'
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integracao WhatsApp Meta Cloud API'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_get_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF p_secret_name !~ '^whatsapp_(meta_access_token|webhook_verify_token)$' THEN
    RAISE EXCEPTION 'Nome de segredo WhatsApp nao permitido.';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_set_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_get_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_set_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_get_secret(TEXT) TO service_role;
