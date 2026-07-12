-- WhatsApp Meta Cloud API configuration and automation switches.

ALTER TABLE public.mensageria_config
  ADD COLUMN IF NOT EXISTS wa_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS wa_display_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS wa_graph_version TEXT DEFAULT 'v23.0',
  ADD COLUMN IF NOT EXISTS wa_app_id TEXT,
  ADD COLUMN IF NOT EXISTS wa_webhook_verify_token TEXT,
  ADD COLUMN IF NOT EXISTS wa_account_currency TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS wa_estimated_balance NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS wa_quality_rating TEXT,
  ADD COLUMN IF NOT EXISTS wa_messaging_limit TEXT,
  ADD COLUMN IF NOT EXISTS wa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_due_notice_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS wa_send_due_notice BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wa_send_payment_receipt BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wa_send_overdue_notice BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wa_overdue_notice_days INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS wa_default_overdue_template TEXT NOT NULL DEFAULT 'Olá {{nome_parceiro}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}';

UPDATE public.mensageria_config
SET
  wa_provider = 'meta_cloud',
  wa_instance_url = COALESCE(NULLIF(wa_instance_url, ''), 'https://graph.facebook.com'),
  wa_graph_version = COALESCE(NULLIF(wa_graph_version, ''), 'v23.0'),
  wa_account_currency = COALESCE(NULLIF(wa_account_currency, ''), 'BRL'),
  wa_status = CASE WHEN COALESCE(wa_enabled, false) THEN 'configurado' ELSE 'inativo' END
WHERE tipo = 'whatsapp';

INSERT INTO public.mensageria_config (
  tipo,
  wa_provider,
  wa_instance_url,
  wa_graph_version,
  wa_account_currency,
  wa_status,
  wa_enabled
)
VALUES (
  'whatsapp',
  'meta_cloud',
  'https://graph.facebook.com',
  'v23.0',
  'BRL',
  'inativo',
  false
)
ON CONFLICT (tipo) DO NOTHING;
