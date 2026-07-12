-- Separate WhatsApp automation templates by financial event.

ALTER TABLE public.mensageria_config
  ADD COLUMN IF NOT EXISTS wa_due_notice_template TEXT NOT NULL DEFAULT 'Olá {{nome_aluno}}, sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para pagar, acesse: {{link_pagamento}}',
  ADD COLUMN IF NOT EXISTS wa_payment_receipt_template TEXT NOT NULL DEFAULT 'Olá {{nome_aluno}}, recebemos seu pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado!';

UPDATE public.mensageria_config
SET
  wa_due_notice_template = COALESCE(NULLIF(wa_due_notice_template, ''), 'Olá {{nome_aluno}}, sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para pagar, acesse: {{link_pagamento}}'),
  wa_payment_receipt_template = COALESCE(NULLIF(wa_payment_receipt_template, ''), 'Olá {{nome_aluno}}, recebemos seu pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado!'),
  wa_default_overdue_template = COALESCE(NULLIF(wa_default_overdue_template, ''), 'Olá {{nome_aluno}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}')
WHERE tipo = 'whatsapp';
