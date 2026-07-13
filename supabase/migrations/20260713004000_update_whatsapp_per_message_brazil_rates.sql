-- Update WhatsApp estimated Brazil rates to the post-July-2025 per-message pricing model.

UPDATE public.whatsapp_billing_settings
SET
  marketing_rate = 0.3400,
  billing_rate = 0.0400,
  service_rate = 0.0000,
  updated_at = now()
WHERE id = true;

ALTER TABLE public.whatsapp_billing_settings
  ALTER COLUMN marketing_rate SET DEFAULT 0.3400,
  ALTER COLUMN billing_rate SET DEFAULT 0.0400,
  ALTER COLUMN service_rate SET DEFAULT 0.0000;

UPDATE public.whatsapp_message_usage
SET
  unit_price = CASE category
    WHEN 'marketing' THEN 0.3400
    WHEN 'billing' THEN 0.0400
    ELSE 0.0000
  END,
  cost = CASE category
    WHEN 'marketing' THEN 0.3400
    WHEN 'billing' THEN 0.0400
    ELSE 0.0000
  END,
  currency = 'BRL'
WHERE category IN ('marketing', 'billing', 'service');
