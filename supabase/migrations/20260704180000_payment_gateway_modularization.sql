-- Integração bancária modular.
-- Mantém o Asaas como rota padrão e abre a configuração por modalidade, ambiente,
-- forma de pagamento e provedor sem expor segredos em tabelas públicas.

CREATE TABLE IF NOT EXISTS public.payment_gateway_providers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  supports_pix BOOLEAN NOT NULL DEFAULT FALSE,
  supports_boleto BOOLEAN NOT NULL DEFAULT FALSE,
  supports_credit_card BOOLEAN NOT NULL DEFAULT FALSE,
  requires_polling BOOLEAN NOT NULL DEFAULT FALSE,
  has_public_api BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL REFERENCES public.payment_gateway_providers(code) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  label TEXT,
  configured BOOLEAN NOT NULL DEFAULT FALSE,
  api_key_configured BOOLEAN NOT NULL DEFAULT FALSE,
  access_token_configured BOOLEAN NOT NULL DEFAULT FALSE,
  public_key_configured BOOLEAN NOT NULL DEFAULT FALSE,
  client_id_configured BOOLEAN NOT NULL DEFAULT FALSE,
  client_secret_configured BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_secret_configured BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateway_credentials_provider_environment_key UNIQUE (provider_code, environment)
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modalidade TEXT NOT NULL CHECK (modalidade IN ('EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  provider_code TEXT NOT NULL REFERENCES public.payment_gateway_providers(code) ON DELETE RESTRICT,
  credential_id UUID REFERENCES public.payment_gateway_credentials(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateway_routes_unique_route UNIQUE (modalidade, payment_method, environment)
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL REFERENCES public.payment_gateway_providers(code) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  remote_customer_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateway_customers_unique_partner_provider UNIQUE (parceiro_id, provider_code, environment),
  CONSTRAINT payment_gateway_customers_unique_remote UNIQUE (provider_code, environment, remote_customer_id)
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  inscricao_online_id UUID REFERENCES public.inscricoes_online(id) ON DELETE SET NULL,
  provider_code TEXT NOT NULL REFERENCES public.payment_gateway_providers(code) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  remote_payment_id TEXT,
  remote_customer_id TEXT,
  remote_payment_link_id TEXT,
  remote_installment_id TEXT,
  remote_status TEXT,
  amount NUMERIC(14,2),
  fee_value NUMERIC(14,2),
  net_value NUMERIC(14,2),
  invoice_url TEXT,
  bank_slip_url TEXT,
  pix_payload TEXT,
  pix_encoded_image TEXT,
  transaction_receipt_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL REFERENCES public.payment_gateway_providers(code) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  event_id TEXT,
  event_type TEXT,
  remote_payment_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT payment_gateway_webhook_events_unique_event UNIQUE (provider_code, environment, event_id)
);

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS gateway_provider TEXT REFERENCES public.payment_gateway_providers(code),
  ADD COLUMN IF NOT EXISTS gateway_environment TEXT CHECK (gateway_environment IS NULL OR gateway_environment IN ('sandbox', 'production')),
  ADD COLUMN IF NOT EXISTS gateway_payment_method TEXT CHECK (gateway_payment_method IS NULL OR gateway_payment_method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_installment_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_status TEXT,
  ADD COLUMN IF NOT EXISTS gateway_invoice_url TEXT,
  ADD COLUMN IF NOT EXISTS gateway_bank_slip_url TEXT,
  ADD COLUMN IF NOT EXISTS gateway_pix_payload TEXT,
  ADD COLUMN IF NOT EXISTS gateway_pix_encoded_image TEXT,
  ADD COLUMN IF NOT EXISTS gateway_transaction_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS gateway_fee_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS gateway_net_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS gateway_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gateway_last_error TEXT;

ALTER TABLE public.inscricoes_online
  ADD COLUMN IF NOT EXISTS gateway_provider TEXT REFERENCES public.payment_gateway_providers(code),
  ADD COLUMN IF NOT EXISTS gateway_environment TEXT CHECK (gateway_environment IS NULL OR gateway_environment IN ('sandbox', 'production')),
  ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_payment_link_id TEXT;

INSERT INTO public.payment_gateway_providers (
  code,
  name,
  description,
  supports_pix,
  supports_boleto,
  supports_credit_card,
  requires_polling,
  has_public_api,
  metadata
) VALUES
  (
    'asaas',
    'Asaas',
    'API de cobranças com Pix, boleto, cartão e webhooks oficiais.',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    '{"webhook_events":["PAYMENT_CREATED","PAYMENT_UPDATED","PAYMENT_CONFIRMED","PAYMENT_RECEIVED","PAYMENT_OVERDUE","PAYMENT_DELETED","PAYMENT_REFUNDED"]}'::jsonb
  ),
  (
    'mercado_pago',
    'Mercado Pago',
    'Checkout Transparente/Orders com Pix, boleto, cartão e webhooks.',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    '{"webhook_events":["order.created","order.updated","payment.updated"]}'::jsonb
  ),
  (
    'banese_card',
    'Banese Card / Banese',
    'Integração regional para Pix e boleto. Cartão deve ser roteado para Asaas ou Mercado Pago.',
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    '{"pix_requires_private_contract":true,"card_supported":false}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  supports_pix = EXCLUDED.supports_pix,
  supports_boleto = EXCLUDED.supports_boleto,
  supports_credit_card = EXCLUDED.supports_credit_card,
  requires_polling = EXCLUDED.requires_polling,
  has_public_api = EXCLUDED.has_public_api,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.payment_gateway_credentials (provider_code, environment, label, webhook_url)
VALUES
  ('asaas', 'sandbox', 'Asaas Sandbox', NULL),
  ('asaas', 'production', 'Asaas Produção', NULL),
  ('mercado_pago', 'sandbox', 'Mercado Pago Sandbox', NULL),
  ('mercado_pago', 'production', 'Mercado Pago Produção', NULL),
  ('banese_card', 'sandbox', 'Banese Card Sandbox', NULL),
  ('banese_card', 'production', 'Banese Card Produção', NULL)
ON CONFLICT (provider_code, environment) DO NOTHING;

WITH combos(modalidade, payment_method) AS (
  VALUES
    ('EAD', 'PIX'),
    ('EAD', 'BOLETO'),
    ('EAD', 'CREDIT_CARD'),
    ('TECNICO', 'PIX'),
    ('TECNICO', 'BOLETO'),
    ('TECNICO', 'CREDIT_CARD'),
    ('LIVRE', 'PIX'),
    ('LIVRE', 'BOLETO'),
    ('LIVRE', 'CREDIT_CARD'),
    ('ESPECIALIZACAO', 'PIX'),
    ('ESPECIALIZACAO', 'BOLETO'),
    ('ESPECIALIZACAO', 'CREDIT_CARD')
),
envs(environment) AS (
  VALUES ('sandbox'), ('production')
)
INSERT INTO public.payment_gateway_routes (
  modalidade,
  payment_method,
  environment,
  provider_code,
  credential_id,
  enabled
)
SELECT
  combos.modalidade,
  combos.payment_method,
  envs.environment,
  'asaas',
  credentials.id,
  TRUE
FROM combos
CROSS JOIN envs
LEFT JOIN public.payment_gateway_credentials credentials
  ON credentials.provider_code = 'asaas'
 AND credentials.environment = envs.environment
ON CONFLICT (modalidade, payment_method, environment) DO NOTHING;

UPDATE public.contas_receber
SET gateway_provider = 'asaas',
    gateway_environment = COALESCE(gateway_environment, (SELECT environment FROM public.asaas_config LIMIT 1), 'sandbox'),
    gateway_payment_method = COALESCE(
      gateway_payment_method,
      CASE
        WHEN UPPER(COALESCE(forma_pagamento, origem_pagamento, '')) IN ('CARTAO', 'CARTÃO', 'CREDIT_CARD') THEN 'CREDIT_CARD'
        WHEN UPPER(COALESCE(forma_pagamento, origem_pagamento, '')) = 'BOLETO' THEN 'BOLETO'
        WHEN UPPER(COALESCE(forma_pagamento, origem_pagamento, '')) = 'PIX' THEN 'PIX'
        ELSE NULL
      END
    ),
    gateway_payment_id = COALESCE(gateway_payment_id, asaas_payment_id),
    gateway_payment_link_id = COALESCE(gateway_payment_link_id, asaas_payment_link_id),
    gateway_installment_id = COALESCE(gateway_installment_id, asaas_installment_id),
    gateway_status = COALESCE(gateway_status, asaas_status),
    gateway_invoice_url = COALESCE(gateway_invoice_url, asaas_invoice_url),
    gateway_bank_slip_url = COALESCE(gateway_bank_slip_url, asaas_bank_slip_url),
    gateway_transaction_receipt_url = COALESCE(gateway_transaction_receipt_url, asaas_transaction_receipt_url),
    gateway_fee_value = COALESCE(gateway_fee_value, asaas_fee_value),
    gateway_net_value = COALESCE(gateway_net_value, asaas_net_value),
    gateway_synced_at = COALESCE(gateway_synced_at, asaas_synced_at),
    gateway_last_error = COALESCE(gateway_last_error, asaas_last_error)
WHERE gateway_provider IS NULL
  AND (
    asaas_payment_id IS NOT NULL
    OR asaas_payment_link_id IS NOT NULL
    OR asaas_status IS NOT NULL
  );

UPDATE public.inscricoes_online
SET gateway_provider = 'asaas',
    gateway_environment = COALESCE(gateway_environment, (SELECT environment FROM public.asaas_config LIMIT 1), 'sandbox'),
    gateway_payment_id = COALESCE(gateway_payment_id, asaas_payment_id),
    gateway_customer_id = COALESCE(gateway_customer_id, asaas_customer_id),
    gateway_payment_link_id = COALESCE(gateway_payment_link_id, asaas_payment_link_id)
WHERE gateway_provider IS NULL
  AND (
    asaas_payment_id IS NOT NULL
    OR asaas_customer_id IS NOT NULL
    OR asaas_payment_link_id IS NOT NULL
  );

INSERT INTO public.payment_gateway_transactions (
  receivable_id,
  provider_code,
  environment,
  payment_method,
  remote_payment_id,
  remote_payment_link_id,
  remote_installment_id,
  remote_status,
  amount,
  fee_value,
  net_value,
  invoice_url,
  bank_slip_url,
  transaction_receipt_url,
  last_error,
  synced_at
)
SELECT
  id,
  'asaas',
  COALESCE(gateway_environment, (SELECT environment FROM public.asaas_config LIMIT 1), 'sandbox'),
  CASE
    WHEN UPPER(COALESCE(forma_pagamento, origem_pagamento, '')) IN ('CARTAO', 'CARTÃO', 'CREDIT_CARD') THEN 'CREDIT_CARD'
    WHEN UPPER(COALESCE(forma_pagamento, origem_pagamento, '')) = 'BOLETO' THEN 'BOLETO'
    ELSE 'PIX'
  END,
  asaas_payment_id,
  asaas_payment_link_id,
  asaas_installment_id,
  asaas_status,
  valor,
  asaas_fee_value,
  asaas_net_value,
  asaas_invoice_url,
  asaas_bank_slip_url,
  asaas_transaction_receipt_url,
  asaas_last_error,
  asaas_synced_at
FROM public.contas_receber
WHERE asaas_payment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_gateway_transactions existing
    WHERE existing.provider_code = 'asaas'
      AND existing.remote_payment_id = contas_receber.asaas_payment_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_gateway_transactions_remote_payment_uidx
  ON public.payment_gateway_transactions (provider_code, environment, remote_payment_id)
  WHERE remote_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_gateway_transactions_receivable_idx
  ON public.payment_gateway_transactions (receivable_id);

CREATE INDEX IF NOT EXISTS payment_gateway_transactions_inscricao_idx
  ON public.payment_gateway_transactions (inscricao_online_id);

CREATE INDEX IF NOT EXISTS payment_gateway_transactions_status_idx
  ON public.payment_gateway_transactions (provider_code, environment, remote_status);

CREATE INDEX IF NOT EXISTS payment_gateway_routes_lookup_idx
  ON public.payment_gateway_routes (modalidade, payment_method, environment)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS payment_gateway_webhook_events_unprocessed_idx
  ON public.payment_gateway_webhook_events (provider_code, environment, received_at)
  WHERE processed = FALSE;

CREATE INDEX IF NOT EXISTS contas_receber_gateway_payment_uidx
  ON public.contas_receber (gateway_provider, gateway_environment, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contas_receber_gateway_status_idx
  ON public.contas_receber (gateway_provider, gateway_status)
  WHERE gateway_provider IS NOT NULL;

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
  IF p_secret_name !~ '^payment_gateway_(asaas|mercado_pago|banese_card)_(sandbox|production)_(api_key|access_token|public_key|client_id|client_secret|webhook_secret|webhook_token)$' THEN
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
  IF p_secret_name !~ '^payment_gateway_(asaas|mercado_pago|banese_card)_(sandbox|production)_(api_key|access_token|public_key|client_id|client_secret|webhook_secret|webhook_token)$' THEN
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

ALTER TABLE public.payment_gateway_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_gateway_providers_gestor_read" ON public.payment_gateway_providers;
CREATE POLICY "payment_gateway_providers_gestor_read"
  ON public.payment_gateway_providers
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "payment_gateway_credentials_gestor_read" ON public.payment_gateway_credentials;
CREATE POLICY "payment_gateway_credentials_gestor_read"
  ON public.payment_gateway_credentials
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "payment_gateway_routes_gestor_read" ON public.payment_gateway_routes;
CREATE POLICY "payment_gateway_routes_gestor_read"
  ON public.payment_gateway_routes
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "payment_gateway_customers_select" ON public.payment_gateway_customers;
CREATE POLICY "payment_gateway_customers_select"
  ON public.payment_gateway_customers
  FOR SELECT
  TO authenticated
  USING (parceiro_id = public.current_aluno_id() OR public.is_gestor());

DROP POLICY IF EXISTS "payment_gateway_transactions_select" ON public.payment_gateway_transactions;
CREATE POLICY "payment_gateway_transactions_select"
  ON public.payment_gateway_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.contas_receber cr
      WHERE cr.id = receivable_id
        AND (
          cr.cliente_id = public.current_aluno_id()
          OR public.is_gestor_for_polo(cr.polo_id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.inscricoes_online io
      WHERE io.id = inscricao_online_id
        AND (
          io.aluno_id = public.current_aluno_id()
          OR (io.turma_id IS NULL AND public.is_gestor_global())
          OR EXISTS (
            SELECT 1
            FROM public.turmas t
            WHERE t.id = io.turma_id
              AND public.is_gestor_for_polo(t.polo_id)
          )
        )
    )
  );

REVOKE ALL ON public.payment_gateway_providers FROM anon, authenticated;
REVOKE ALL ON public.payment_gateway_credentials FROM anon, authenticated;
REVOKE ALL ON public.payment_gateway_routes FROM anon, authenticated;
REVOKE ALL ON public.payment_gateway_customers FROM anon, authenticated;
REVOKE ALL ON public.payment_gateway_transactions FROM anon, authenticated;
REVOKE ALL ON public.payment_gateway_webhook_events FROM anon, authenticated;

GRANT SELECT ON public.payment_gateway_providers TO authenticated;
GRANT SELECT ON public.payment_gateway_credentials TO authenticated;
GRANT SELECT ON public.payment_gateway_routes TO authenticated;
GRANT SELECT ON public.payment_gateway_customers TO authenticated;
GRANT SELECT ON public.payment_gateway_transactions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_routes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateway_webhook_events TO service_role;

COMMENT ON TABLE public.payment_gateway_routes IS
  'Define qual provedor deve ser usado por modalidade, ambiente e forma de pagamento.';
COMMENT ON TABLE public.payment_gateway_credentials IS
  'Guarda apenas metadados e flags. As chaves ficam no Supabase Vault.';
COMMENT ON TABLE public.payment_gateway_transactions IS
  'Rastreamento genérico de cobranças por provedor bancário.';
