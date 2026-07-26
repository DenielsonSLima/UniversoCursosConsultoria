-- Consolida promoção e remoção de credenciais em transações únicas.

CREATE OR REPLACE FUNCTION public.whatsapp_set_connection_secrets(
  p_connection_id UUID,
  p_access_token TEXT DEFAULT NULL,
  p_app_secret TEXT DEFAULT NULL,
  p_verify_token TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF NULLIF(btrim(p_access_token), '') IS NOT NULL THEN
    PERFORM public.whatsapp_set_connection_secret(
      p_connection_id,
      'access_token',
      p_access_token
    );
  END IF;
  IF NULLIF(btrim(p_app_secret), '') IS NOT NULL THEN
    PERFORM public.whatsapp_set_connection_secret(
      p_connection_id,
      'app_secret',
      p_app_secret
    );
  END IF;
  IF NULLIF(btrim(p_verify_token), '') IS NOT NULL THEN
    PERFORM public.whatsapp_set_connection_secret(
      p_connection_id,
      'verify_token',
      p_verify_token
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_remove_connection_secret(
  p_connection_id UUID,
  p_secret_kind TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_is_matriz BOOLEAN;
  v_legacy_secret_name TEXT;
  v_credential_label TEXT;
BEGIN
  IF p_secret_kind NOT IN ('access_token', 'app_secret', 'verify_token') THEN
    RAISE EXCEPTION 'Tipo de segredo WhatsApp não permitido.';
  END IF;

  SELECT is_matriz_financeira
  INTO v_is_matriz
  FROM public.whatsapp_conexoes
  WHERE id = p_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conexão WhatsApp não encontrada.';
  END IF;

  PERFORM public.whatsapp_delete_connection_secret(
    p_connection_id,
    p_secret_kind
  );

  IF v_is_matriz THEN
    v_legacy_secret_name := CASE p_secret_kind
      WHEN 'access_token' THEN 'whatsapp_meta_access_token'
      WHEN 'app_secret' THEN 'whatsapp_app_secret'
      ELSE 'whatsapp_webhook_verify_token'
    END;
    PERFORM public.whatsapp_delete_legacy_secret(v_legacy_secret_name);
  END IF;

  v_credential_label := CASE p_secret_kind
    WHEN 'access_token' THEN 'Access Token'
    WHEN 'app_secret' THEN 'App Secret'
    ELSE 'Verify Token'
  END;

  UPDATE public.whatsapp_conexoes
  SET
    status = 'inativo',
    token_configured = CASE
      WHEN p_secret_kind = 'access_token' THEN false
      ELSE token_configured
    END,
    app_secret_configured = CASE
      WHEN p_secret_kind = 'app_secret' THEN false
      ELSE app_secret_configured
    END,
    verify_token_configured = CASE
      WHEN p_secret_kind = 'verify_token' THEN false
      ELSE verify_token_configured
    END,
    webhook_verified_at = CASE
      WHEN p_secret_kind = 'verify_token' THEN NULL
      ELSE webhook_verified_at
    END,
    last_health_check_at = NULL,
    last_error = v_credential_label || ' removido pelo gestor.',
    updated_at = now()
  WHERE id = p_connection_id;

  IF v_is_matriz THEN
    UPDATE public.mensageria_config
    SET
      wa_enabled = false,
      wa_status = 'inativo',
      wa_last_health_check_at = NULL,
      updated_at = now()
    WHERE tipo = 'whatsapp';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_set_connection_secrets(
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_remove_connection_secret(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_set_connection_secrets(
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_remove_connection_secret(UUID, TEXT)
  TO service_role;
