-- Harden WhatsApp webhook secrets and resolve students by phone + CPF,
-- allowing requests from the student's own phone or financial guardian phone.

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
  IF p_secret_name !~ '^whatsapp_(meta_access_token|webhook_verify_token|app_secret)$' THEN
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
  IF p_secret_name !~ '^whatsapp_(meta_access_token|webhook_verify_token|app_secret)$' THEN
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

CREATE OR REPLACE FUNCTION public.whatsapp_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(public.whatsapp_digits(p_phone)) BETWEEN 10 AND 15
      THEN CASE
        WHEN public.whatsapp_digits(p_phone) LIKE '55%' THEN public.whatsapp_digits(p_phone)
        ELSE '55' || public.whatsapp_digits(p_phone)
      END
    ELSE NULL
  END;
$$;

CREATE INDEX IF NOT EXISTS idx_parceiros_responsavel_whatsapp_phone_digits
  ON public.parceiros ((public.whatsapp_normalize_phone(responsavel_telefone)))
  WHERE tipo = 'Aluno';

DROP FUNCTION IF EXISTS public.whatsapp_find_aluno_by_phone(TEXT);

CREATE OR REPLACE FUNCTION public.whatsapp_find_aluno_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  telefone TEXT,
  cpf_cnpj TEXT,
  match_source TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT public.whatsapp_normalize_phone(p_phone) AS phone
  ),
  candidates AS (
    SELECT p.id, p.nome, p.telefone, p.cpf_cnpj, 'aluno'::TEXT AS match_source, 1 AS priority, p.updated_at, p.created_at
    FROM public.parceiros p, normalized n
    WHERE p.tipo = 'Aluno'
      AND n.phone IS NOT NULL
      AND public.whatsapp_normalize_phone(p.telefone) = n.phone

    UNION ALL

    SELECT p.id, p.nome, p.telefone, p.cpf_cnpj, 'responsavel_ficha'::TEXT AS match_source, 2 AS priority, p.updated_at, p.created_at
    FROM public.parceiros p, normalized n
    WHERE p.tipo = 'Aluno'
      AND n.phone IS NOT NULL
      AND p.responsavel_financeiro IS TRUE
      AND public.whatsapp_normalize_phone(p.responsavel_telefone) = n.phone
  )
  SELECT c.id, c.nome, c.telefone, c.cpf_cnpj, c.match_source
  FROM candidates c
  ORDER BY c.priority, c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_find_aluno_by_phone_and_cpf(
  p_phone TEXT,
  p_cpf TEXT
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  telefone TEXT,
  cpf_cnpj TEXT,
  match_source TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      public.whatsapp_normalize_phone(p_phone) AS phone,
      public.whatsapp_digits(p_cpf) AS cpf
  ),
  candidates AS (
    SELECT p.id, p.nome, p.telefone, p.cpf_cnpj, 'aluno'::TEXT AS match_source, 1 AS priority, p.updated_at, p.created_at
    FROM public.parceiros p, normalized n
    WHERE p.tipo = 'Aluno'
      AND n.phone IS NOT NULL
      AND n.cpf IS NOT NULL
      AND public.whatsapp_digits(p.cpf_cnpj) = n.cpf
      AND public.whatsapp_normalize_phone(p.telefone) = n.phone

    UNION ALL

    SELECT p.id, p.nome, p.telefone, p.cpf_cnpj, 'responsavel_ficha'::TEXT AS match_source, 2 AS priority, p.updated_at, p.created_at
    FROM public.parceiros p, normalized n
    WHERE p.tipo = 'Aluno'
      AND n.phone IS NOT NULL
      AND n.cpf IS NOT NULL
      AND p.responsavel_financeiro IS TRUE
      AND public.whatsapp_digits(p.cpf_cnpj) = n.cpf
      AND public.whatsapp_normalize_phone(p.responsavel_telefone) = n.phone
  )
  SELECT c.id, c.nome, c.telefone, c.cpf_cnpj, c.match_source
  FROM candidates c
  ORDER BY c.priority, c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_phone_belongs_to_aluno(
  p_aluno_id UUID,
  p_phone TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT public.whatsapp_normalize_phone(p_phone) AS phone
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros p, normalized n
    WHERE p.id = p_aluno_id
      AND p.tipo = 'Aluno'
      AND n.phone IS NOT NULL
      AND (
        public.whatsapp_normalize_phone(p.telefone) = n.phone
        OR (
          p.responsavel_financeiro IS TRUE
          AND public.whatsapp_normalize_phone(p.responsavel_telefone) = n.phone
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whatsapp_find_aluno_by_phone_and_cpf(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whatsapp_phone_belongs_to_aluno(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_find_aluno_by_phone_and_cpf(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_phone_belongs_to_aluno(UUID, TEXT) TO service_role;
