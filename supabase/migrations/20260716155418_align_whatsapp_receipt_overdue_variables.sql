ALTER TABLE public.mensageria_config
  ALTER COLUMN wa_payment_receipt_template SET DEFAULT 'Olá, {{nome_aluno}}!

Seu pagamento no valor de *{{valor_fatura}}*, referente à mensalidade nº *{{numero_mensalidade}}* do curso *{{nome_curso}}*, foi confirmado com sucesso.

Identificação do aluno: CPF final *{{cpf_final}}*.

Agradecemos pela confiança e por fazer parte da Universo Cursos e Consultoria.

Se precisar de suporte, nossa equipe está à disposição.

Equipe Universo Cursos e Consultoria.',
  ALTER COLUMN wa_default_overdue_template SET DEFAULT 'Olá, {{nome_aluno}}!

Identificamos que a mensalidade no valor de *{{valor_fatura}}* ainda consta como pendente em nosso sistema.

*Turma:* {{nome_turma}}
*CPF final:* {{cpf_final}}
*Vencimento:* {{data_vencimento}}

Para realizar o pagamento, acesse:
{{link_pagamento}}

Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.

Equipe Universo Cursos e Consultoria.';

UPDATE public.mensageria_config
SET
  wa_payment_receipt_template = 'Olá, {{nome_aluno}}!

Seu pagamento no valor de *{{valor_fatura}}*, referente à mensalidade nº *{{numero_mensalidade}}* do curso *{{nome_curso}}*, foi confirmado com sucesso.

Identificação do aluno: CPF final *{{cpf_final}}*.

Agradecemos pela confiança e por fazer parte da Universo Cursos e Consultoria.

Se precisar de suporte, nossa equipe está à disposição.

Equipe Universo Cursos e Consultoria.',
  wa_default_overdue_template = 'Olá, {{nome_aluno}}!

Identificamos que a mensalidade no valor de *{{valor_fatura}}* ainda consta como pendente em nosso sistema.

*Turma:* {{nome_turma}}
*CPF final:* {{cpf_final}}
*Vencimento:* {{data_vencimento}}

Para realizar o pagamento, acesse:
{{link_pagamento}}

Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.

Equipe Universo Cursos e Consultoria.'
WHERE tipo = 'whatsapp';
