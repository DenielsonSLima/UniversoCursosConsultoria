ALTER TABLE public.asaas_config
  ADD COLUMN IF NOT EXISTS notification_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notification_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notification_sms_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.asaas_config
SET
  notification_whatsapp_enabled = COALESCE(notification_whatsapp_enabled, notifications_enabled, FALSE),
  notification_email_enabled = COALESCE(notification_email_enabled, notifications_enabled, FALSE),
  notification_sms_enabled = COALESCE(notification_sms_enabled, notifications_enabled, FALSE);
