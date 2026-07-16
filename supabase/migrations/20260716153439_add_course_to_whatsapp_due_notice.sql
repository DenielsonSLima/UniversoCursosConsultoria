ALTER TABLE public.mensageria_config
  ALTER COLUMN wa_due_notice_template SET DEFAULT 'Olá, {{nome_aluno}}!

Este é um lembrete de que sua mensalidade referente ao curso *{{nome_curso}}*, no valor de *{{valor_fatura}}*, vence em *{{data_vencimento}}*.

Identificação do aluno: CPF final *{{cpf_final}}*.

Você pode realizar o pagamento pelo link abaixo:
{{link_pagamento}}

Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.

Equipe Universo Cursos e Consultoria.';

UPDATE public.mensageria_config
SET wa_due_notice_template = 'Olá, {{nome_aluno}}!

Este é um lembrete de que sua mensalidade referente ao curso *{{nome_curso}}*, no valor de *{{valor_fatura}}*, vence em *{{data_vencimento}}*.

Identificação do aluno: CPF final *{{cpf_final}}*.

Você pode realizar o pagamento pelo link abaixo:
{{link_pagamento}}

Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.

Equipe Universo Cursos e Consultoria.'
WHERE tipo = 'whatsapp';
