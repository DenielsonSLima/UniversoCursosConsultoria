ALTER TABLE public.mensageria_config
  ALTER COLUMN wa_multiple_overdue_template SET DEFAULT 'Olá, {{nome_aluno}}. Identificamos {{quantidade_parcelas}} parcelas em aberto no seu cadastro, totalizando {{valor_total_atrasado}}. Queremos ajudar você a regularizar sua situação com tranquilidade. Responda esta mensagem para nossa equipe verificar uma condição especial para deixar tudo em dia. Se você já regularizou, por favor desconsidere esta mensagem.';

UPDATE public.mensageria_config
SET wa_multiple_overdue_template = 'Olá, {{nome_aluno}}. Identificamos {{quantidade_parcelas}} parcelas em aberto no seu cadastro, totalizando {{valor_total_atrasado}}. Queremos ajudar você a regularizar sua situação com tranquilidade. Responda esta mensagem para nossa equipe verificar uma condição especial para deixar tudo em dia. Se você já regularizou, por favor desconsidere esta mensagem.'
WHERE tipo = 'whatsapp'
  AND (
    wa_multiple_overdue_template IS NULL
    OR wa_multiple_overdue_template ILIKE '%{{link_pagamento}}%'
    OR wa_multiple_overdue_template ILIKE '%Consulte as opções por aqui%'
    OR wa_multiple_overdue_template ILIKE '%acesse:%'
  );
