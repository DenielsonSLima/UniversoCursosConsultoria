-- Add a separate WhatsApp automation for students with multiple overdue installments.

ALTER TABLE public.mensageria_config
  ADD COLUMN IF NOT EXISTS wa_send_multiple_overdue_notice BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wa_multiple_overdue_min_installments INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS wa_multiple_overdue_template TEXT NOT NULL DEFAULT 'Olá {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em atraso, totalizando {{valor_total_atrasado}}. Para regularizar, acesse: {{link_pagamento}}';

UPDATE public.mensageria_config
SET
  wa_send_multiple_overdue_notice = COALESCE(wa_send_multiple_overdue_notice, true),
  wa_multiple_overdue_min_installments = GREATEST(COALESCE(wa_multiple_overdue_min_installments, 2), 2),
  wa_multiple_overdue_template = COALESCE(NULLIF(wa_multiple_overdue_template, ''), 'Olá {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em atraso, totalizando {{valor_total_atrasado}}. Para regularizar, acesse: {{link_pagamento}}')
WHERE tipo = 'whatsapp';
