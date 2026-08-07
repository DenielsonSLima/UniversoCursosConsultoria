-- Estado operacional da Meta isolado por conexão WhatsApp.
-- Segredos continuam exclusivamente no Vault; a tabela expõe apenas flags.

ALTER TABLE public.whatsapp_conexoes
  ADD COLUMN IF NOT EXISTS embedded_signup_config_id TEXT,
  ADD COLUMN IF NOT EXISTS business_portfolio_id TEXT,
  ADD COLUMN IF NOT EXISTS app_secret_configured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verify_token_configured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waba_subscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coexistence_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contacts_sync_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS contacts_sync_request_id TEXT,
  ADD COLUMN IF NOT EXISTS history_sync_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS history_sync_request_id TEXT,
  ADD COLUMN IF NOT EXISTS history_sync_progress NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS last_account_event TEXT,
  ADD COLUMN IF NOT EXISTS last_account_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.whatsapp_conexoes
  DROP CONSTRAINT IF EXISTS whatsapp_conexoes_contacts_sync_status_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conexoes_history_sync_status_check,
  DROP CONSTRAINT IF EXISTS whatsapp_conexoes_history_sync_progress_check;

ALTER TABLE public.whatsapp_conexoes
  ADD CONSTRAINT whatsapp_conexoes_contacts_sync_status_check
    CHECK (
      contacts_sync_status IN (
        'not_requested',
        'requested',
        'receiving',
        'completed',
        'error'
      )
    ),
  ADD CONSTRAINT whatsapp_conexoes_history_sync_status_check
    CHECK (
      history_sync_status IN (
        'not_requested',
        'requested',
        'receiving',
        'completed',
        'declined',
        'error'
      )
    ),
  ADD CONSTRAINT whatsapp_conexoes_history_sync_progress_check
    CHECK (
      history_sync_progress IS NULL
      OR history_sync_progress BETWEEN 0 AND 100
    );

UPDATE public.whatsapp_conexoes AS connection
SET
  app_secret_configured = EXISTS (
    SELECT 1
    FROM vault.secrets AS secret
    WHERE secret.name =
      'whatsapp_connection_'
      || replace(connection.id::text, '-', '')
      || '_app_secret'
  ),
  verify_token_configured = EXISTS (
    SELECT 1
    FROM vault.secrets AS secret
    WHERE secret.name =
      'whatsapp_connection_'
      || replace(connection.id::text, '-', '')
      || '_verify_token'
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_conexoes_waba_id
  ON public.whatsapp_conexoes (waba_id)
  WHERE waba_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_conexoes.embedded_signup_config_id IS
  'Configuration ID público do Embedded Signup; não é o Verify Token do webhook.';
COMMENT ON COLUMN public.whatsapp_conexoes.app_secret_configured IS
  'Indica presença do App Secret no Vault sem expor seu valor.';
COMMENT ON COLUMN public.whatsapp_conexoes.verify_token_configured IS
  'Indica presença do Verify Token no Vault sem expor seu valor.';
COMMENT ON COLUMN public.whatsapp_conexoes.webhook_verified_at IS
  'Última validação GET bem-sucedida do webhook pela Meta.';
COMMENT ON COLUMN public.whatsapp_conexoes.waba_subscribed_at IS
  'Última assinatura bem-sucedida do app em /WABA_ID/subscribed_apps.';
