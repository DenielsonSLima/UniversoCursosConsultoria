alter table public.whatsapp_flow_settings
  add column if not exists irpf_not_eligible_message text not null default 'Não localizei vínculo em curso técnico para liberar a declaração de IRPF por aqui. Vou encaminhar sua conversa para um atendente conferir.',
  add column if not exists irpf_year_choice_message text not null default 'Localizei pagamentos de curso técnico em mais de um ano-calendário. Responda com o número do ano que deseja receber:',
  add column if not exists irpf_no_years_message text not null default 'Localizei seu vínculo técnico, mas não encontrei pagamentos quitados com ano disponível para IRPF. Vou encaminhar para um atendente conferir.',
  add column if not exists irpf_ready_message text not null default 'Declaração de IRPF localizada. Vou enviar o link de validação em uma mensagem separada.',
  add column if not exists irpf_link_intro_message text not null default 'Acesse o link abaixo para validar sua declaração de IRPF:';

update public.whatsapp_flow_settings
set
  menu_message = 'Cadastro localizado. Escolha uma opção:

1 - Receber link/boleto de pagamento
2 - Receber PIX copia e cola
3 - Solicitar declaração de IRPF
4 - Falar com atendente',
  updated_at = now()
where scope = 'default';

alter table public.whatsapp_flow_sessions
  drop constraint if exists whatsapp_flow_sessions_status_check;

alter table public.whatsapp_flow_sessions
  add constraint whatsapp_flow_sessions_status_check
  check (status in ('awaiting_cpf', 'menu', 'choosing_receivable', 'choosing_irpf_year', 'handoff', 'closed'));

create index if not exists idx_whatsapp_irpf_contas_receber_paid
  on public.contas_receber (cliente_id, data_pagamento desc)
  where status = 'PAGO' and data_pagamento is not null;

create index if not exists idx_whatsapp_irpf_matriculas_aluno_turma
  on public.matriculas (aluno_id, turma_id, status);
