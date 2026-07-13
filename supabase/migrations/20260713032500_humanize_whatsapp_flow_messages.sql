update public.whatsapp_flow_settings
set
  welcome_message = 'Olá! Sou o atendimento automático da Universo Cursos. Para proteger seus dados e localizar seu cadastro com segurança, informe seu CPF. Pode enviar com ou sem pontuação.',
  invalid_cpf_message = 'Não consegui validar esse CPF. Envie novamente apenas os 11 números, ou no formato 000.000.000-00.',
  mismatch_message = 'Por segurança, não consegui confirmar esse CPF com o telefone desta conversa. Vou encaminhar seu atendimento para nossa equipe conferir.',
  menu_message = 'Cadastro confirmado. Como posso ajudar?

1 - Receber link/boleto de pagamento
2 - Receber PIX copia e cola
3 - Solicitar declaração de IRPF
4 - Falar com atendente',
  receivable_choice_message = 'Encontrei mais de uma parcela disponível. Responda com o número da parcela que deseja pagar:',
  no_receivables_message = 'No momento não encontrei parcela aberta, vencida ou próxima do vencimento com dados de pagamento disponíveis. Vou encaminhar para nossa equipe conferir.',
  fallback_message = 'Desculpe, não consegui entender sua resposta. Escolha uma das opções do menu ou digite 4 para falar com atendente.',
  handoff_message = 'Certo. Vou encaminhar sua conversa para um atendente. Em breve alguém da equipe continuará o atendimento por aqui.',
  link_intro_message = 'Claro. Segue o link de pagamento da parcela selecionada. Se já tiver pago, pode desconsiderar.',
  pix_intro_message = 'Claro. Segue o PIX copia e cola da parcela selecionada. Vou enviar separado para facilitar a cópia.',
  irpf_not_eligible_message = 'Não localizei vínculo em curso técnico para liberar a declaração de IRPF automaticamente por aqui. Vou encaminhar para nossa equipe conferir com cuidado.',
  irpf_year_choice_message = 'Localizei declaração de IRPF disponível em mais de um ano-calendário. Responda com o número do ano que deseja receber:',
  irpf_no_years_message = 'Localizei seu vínculo em curso técnico, mas não encontrei pagamentos quitados com ano disponível para IRPF. Vou encaminhar para nossa equipe conferir.',
  irpf_ready_message = 'Encontrei sua declaração de IRPF. Vou enviar o link de validação em uma mensagem separada.',
  irpf_link_intro_message = 'Acesse o link abaixo para consultar e validar sua declaração de IRPF:',
  updated_at = now()
where scope = 'default';

alter table public.mensageria_config
  alter column wa_due_notice_template set default 'Olá, {{nome_aluno}}. Passando para lembrar que sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para facilitar, o pagamento pode ser feito por este link: {{link_pagamento}}. Se você já realizou o pagamento, por favor desconsidere esta mensagem.',
  alter column wa_payment_receipt_template set default 'Olá, {{nome_aluno}}. Confirmamos o recebimento do pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado por manter tudo em dia com a Universo Cursos.',
  alter column wa_default_overdue_template set default 'Olá, {{nome_aluno}}. Verificamos uma parcela de {{valor_fatura}} com vencimento em {{data_vencimento}} ainda em aberto. Para regularizar, você pode usar este link: {{link_pagamento}}. Se o pagamento já foi feito, por favor desconsidere esta mensagem.',
  alter column wa_multiple_overdue_template set default 'Olá, {{nome_aluno}}. Vimos que existem {{quantidade_parcelas}} parcelas em aberto, totalizando {{valor_total_atrasado}}. Podemos ajudar com uma condição especial para você ficar em dia. Consulte as opções por aqui: {{link_pagamento}}. Se você já regularizou, por favor desconsidere esta mensagem.';

update public.mensageria_config
set
  wa_due_notice_template = 'Olá, {{nome_aluno}}. Passando para lembrar que sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para facilitar, o pagamento pode ser feito por este link: {{link_pagamento}}. Se você já realizou o pagamento, por favor desconsidere esta mensagem.',
  wa_payment_receipt_template = 'Olá, {{nome_aluno}}. Confirmamos o recebimento do pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado por manter tudo em dia com a Universo Cursos.',
  wa_default_overdue_template = 'Olá, {{nome_aluno}}. Verificamos uma parcela de {{valor_fatura}} com vencimento em {{data_vencimento}} ainda em aberto. Para regularizar, você pode usar este link: {{link_pagamento}}. Se o pagamento já foi feito, por favor desconsidere esta mensagem.',
  wa_multiple_overdue_template = 'Olá, {{nome_aluno}}. Vimos que existem {{quantidade_parcelas}} parcelas em aberto, totalizando {{valor_total_atrasado}}. Podemos ajudar com uma condição especial para você ficar em dia. Consulte as opções por aqui: {{link_pagamento}}. Se você já regularizou, por favor desconsidere esta mensagem.'
where tipo = 'whatsapp';
