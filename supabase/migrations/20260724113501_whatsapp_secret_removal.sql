-- Permite que a Edge Function administrativa remova credenciais do WhatsApp
-- sem expor o Vault ao cliente autenticado.

CREATE OR REPLACE FUNCTION public.whatsapp_delete_connection_secret(
  p_connection_id UUID,
  p_secret_kind TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_name TEXT;
BEGIN
  IF p_secret_kind NOT IN ('access_token', 'app_secret', 'verify_token') THEN
    RAISE EXCEPTION 'Tipo de segredo WhatsApp não permitido.';
  END IF;

  v_secret_name :=
    'whatsapp_connection_'
    || replace(p_connection_id::text, '-', '')
    || '_'
    || p_secret_kind;

  DELETE FROM vault.secrets
  WHERE name = v_secret_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_delete_legacy_secret(
  p_secret_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF p_secret_name NOT IN (
    'whatsapp_meta_access_token',
    'whatsapp_app_secret',
    'whatsapp_webhook_verify_token'
  ) THEN
    RAISE EXCEPTION 'Segredo legado WhatsApp não permitido.';
  END IF;

  DELETE FROM vault.secrets
  WHERE name = p_secret_name;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_delete_connection_secret(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_delete_legacy_secret(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_delete_connection_secret(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_delete_legacy_secret(TEXT)
  TO service_role;
