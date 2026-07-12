-- Course modalities eligible for each WhatsApp financial automation.

ALTER TABLE public.mensageria_config
  ADD COLUMN IF NOT EXISTS wa_due_notice_modalities TEXT[] NOT NULL DEFAULT ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[],
  ADD COLUMN IF NOT EXISTS wa_payment_receipt_modalities TEXT[] NOT NULL DEFAULT ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[],
  ADD COLUMN IF NOT EXISTS wa_overdue_notice_modalities TEXT[] NOT NULL DEFAULT ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[],
  ADD COLUMN IF NOT EXISTS wa_multiple_overdue_modalities TEXT[] NOT NULL DEFAULT ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[];

UPDATE public.mensageria_config
SET
  wa_due_notice_modalities = CASE
    WHEN array_length(wa_due_notice_modalities, 1) IS NULL THEN ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[]
    ELSE wa_due_notice_modalities
  END,
  wa_payment_receipt_modalities = CASE
    WHEN array_length(wa_payment_receipt_modalities, 1) IS NULL THEN ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[]
    ELSE wa_payment_receipt_modalities
  END,
  wa_overdue_notice_modalities = CASE
    WHEN array_length(wa_overdue_notice_modalities, 1) IS NULL THEN ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[]
    ELSE wa_overdue_notice_modalities
  END,
  wa_multiple_overdue_modalities = CASE
    WHEN array_length(wa_multiple_overdue_modalities, 1) IS NULL THEN ARRAY['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO']::TEXT[]
    ELSE wa_multiple_overdue_modalities
  END
WHERE tipo = 'whatsapp';
