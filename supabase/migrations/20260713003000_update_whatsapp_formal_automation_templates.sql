-- Update default WhatsApp financial automation templates to a more formal tone.

ALTER TABLE public.mensageria_config
  ALTER COLUMN wa_due_notice_template SET DEFAULT 'Prezado(a) {{nome_aluno}}, informamos que sua parcela no valor de {{valor_fatura}} vencerá em {{data_vencimento}}. Para sua comodidade, o pagamento pode ser realizado pelo link: {{link_pagamento}}. Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.',
  ALTER COLUMN wa_payment_receipt_template SET DEFAULT 'Prezado(a) {{nome_aluno}}, confirmamos o recebimento do pagamento no valor de {{valor_fatura}} referente a {{descricao_fatura}}. Agradecemos pela confiança.',
  ALTER COLUMN wa_default_overdue_template SET DEFAULT 'Prezado(a) {{nome_aluno}}, identificamos em nosso sistema uma parcela em aberto no valor de {{valor_fatura}}, com vencimento em {{data_vencimento}}. Solicitamos, por gentileza, a regularização pelo link: {{link_pagamento}}. Caso já tenha realizado o pagamento, desconsidere esta mensagem.',
  ALTER COLUMN wa_multiple_overdue_template SET DEFAULT 'Prezado(a) {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em aberto, totalizando {{valor_total_atrasado}}. Temos uma oferta especial para ajudar você a ficar em dia com a Universo Cursos. Para consultar as opções disponíveis, acesse: {{link_pagamento}}. Caso já tenha realizado o pagamento, desconsidere esta mensagem.';

UPDATE public.mensageria_config
SET
  wa_due_notice_template = CASE
    WHEN NULLIF(wa_due_notice_template, '') IS NULL
      OR wa_due_notice_template IN (
        'Olá {{nome_aluno}}, sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para pagar, acesse: {{link_pagamento}}',
        'Ola {{nome_aluno}}, sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para pagar, acesse: {{link_pagamento}}'
      )
      THEN 'Prezado(a) {{nome_aluno}}, informamos que sua parcela no valor de {{valor_fatura}} vencerá em {{data_vencimento}}. Para sua comodidade, o pagamento pode ser realizado pelo link: {{link_pagamento}}. Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.'
    ELSE wa_due_notice_template
  END,
  wa_payment_receipt_template = CASE
    WHEN NULLIF(wa_payment_receipt_template, '') IS NULL
      OR wa_payment_receipt_template IN (
        'Olá {{nome_aluno}}, recebemos seu pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado!',
        'Ola {{nome_aluno}}, recebemos seu pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado!'
      )
      THEN 'Prezado(a) {{nome_aluno}}, confirmamos o recebimento do pagamento no valor de {{valor_fatura}} referente a {{descricao_fatura}}. Agradecemos pela confiança.'
    ELSE wa_payment_receipt_template
  END,
  wa_default_overdue_template = CASE
    WHEN NULLIF(wa_default_overdue_template, '') IS NULL
      OR wa_default_overdue_template IN (
        'Olá {{nome_parceiro}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}',
        'Olá {{nome_aluno}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}',
        'Ola {{nome_aluno}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}'
      )
      THEN 'Prezado(a) {{nome_aluno}}, identificamos em nosso sistema uma parcela em aberto no valor de {{valor_fatura}}, com vencimento em {{data_vencimento}}. Solicitamos, por gentileza, a regularização pelo link: {{link_pagamento}}. Caso já tenha realizado o pagamento, desconsidere esta mensagem.'
    ELSE wa_default_overdue_template
  END,
  wa_multiple_overdue_template = CASE
    WHEN NULLIF(wa_multiple_overdue_template, '') IS NULL
      OR wa_multiple_overdue_template IN (
        'Olá {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em atraso, totalizando {{valor_total_atrasado}}. Para regularizar, acesse: {{link_pagamento}}',
        'Ola {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em atraso, totalizando {{valor_total_atrasado}}. Para regularizar, acesse: {{link_pagamento}}'
      )
      THEN 'Prezado(a) {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em aberto, totalizando {{valor_total_atrasado}}. Temos uma oferta especial para ajudar você a ficar em dia com a Universo Cursos. Para consultar as opções disponíveis, acesse: {{link_pagamento}}. Caso já tenha realizado o pagamento, desconsidere esta mensagem.'
    ELSE wa_multiple_overdue_template
  END
WHERE tipo = 'whatsapp';
