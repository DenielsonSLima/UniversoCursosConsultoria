-- Preferência da instituição para notificações pagas disparadas pelo Asaas.
-- Por padrão fica desativada para evitar custos com WhatsApp, SMS ou e-mail.

ALTER TABLE public.asaas_config
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notifications_updated_at TIMESTAMPTZ;

UPDATE public.asaas_config
SET notifications_enabled = COALESCE(notifications_enabled, FALSE);
