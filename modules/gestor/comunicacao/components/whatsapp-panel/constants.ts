import { MensageriaConfigData } from '../../../configuracoes/mensageria/mensageria.service';

export const DEFAULT_AUTOMATION: Partial<MensageriaConfigData> = {
  waDueNoticeDays: 3,
  waSendDueNotice: true,
  waDueNoticeTemplate:
    'Olá, {{nome_aluno}}!\n\nEste é um lembrete de que sua mensalidade referente ao curso *{{nome_curso}}*, no valor de *{{valor_fatura}}*, vence em *{{data_vencimento}}*.\n\nIdentificação do aluno: CPF final *{{cpf_final}}*.\n\nVocê pode realizar o pagamento pelo link abaixo:\n{{link_pagamento}}\n\nCaso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.',
  waSendPaymentReceipt: true,
  waPaymentReceiptTemplate:
    'Olá, {{nome_aluno}}!\n\nSeu pagamento no valor de *{{valor_fatura}}*, referente à mensalidade nº *{{numero_mensalidade}}* do curso *{{nome_curso}}*, foi confirmado com sucesso.\n\nIdentificação do aluno: CPF final *{{cpf_final}}*.\n\nAgradecemos pela confiança e por fazer parte da Universo Cursos e Consultoria.\n\nSe precisar de suporte, nossa equipe está à disposição.\n\nEquipe Universo Cursos e Consultoria.',
  waSendOverdueNotice: true,
  waOverdueNoticeDays: 1,
  waDefaultOverdueTemplate:
    'Olá, {{nome_aluno}}!\n\nIdentificamos que a mensalidade no valor de *{{valor_fatura}}* ainda consta como pendente em nosso sistema.\n\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n*Vencimento:* {{data_vencimento}}\n\nPara realizar o pagamento, acesse:\n{{link_pagamento}}\n\nCaso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.',
  waSendMultipleOverdueNotice: true,
  waMultipleOverdueMinInstallments: 2,
  waMultipleOverdueTemplate:
    'Olá, {{nome_aluno}}. Identificamos {{quantidade_parcelas}} parcelas em aberto no seu cadastro, totalizando {{valor_total_atrasado}}. Queremos ajudar você a regularizar sua situação com tranquilidade. Responda esta mensagem para nossa equipe verificar uma condição especial para deixar tudo em dia. Se você já regularizou, por favor desconsidere esta mensagem.',
  waDueNoticeModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
  waPaymentReceiptModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
  waOverdueNoticeModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
  waMultipleOverdueModalities: ['EAD', 'TECNICO', 'LIVRES', 'ESPECIALIZACAO'],
};

export const COURSE_MODALITIES = [
  { id: 'EAD', label: 'EAD' },
  { id: 'TECNICO', label: 'Técnico' },
  { id: 'LIVRES', label: 'Livres' },
  { id: 'ESPECIALIZACAO', label: 'Especialização' },
  { id: 'SUPERIOR', label: 'Superior' },
];

export const DEFAULT_MODALITIES = COURSE_MODALITIES
  .filter((item) => item.id !== 'SUPERIOR')
  .map((item) => item.id);

export const TEMPLATE_VARIABLES = {
  due: ['{{nome_aluno}}', '{{nome_curso}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{cpf_final}}', '{{link_pagamento}}'],
  receipt: ['{{nome_aluno}}', '{{valor_fatura}}', '{{numero_mensalidade}}', '{{nome_curso}}', '{{cpf_final}}'],
  overdue: ['{{nome_aluno}}', '{{valor_fatura}}', '{{nome_turma}}', '{{cpf_final}}', '{{data_vencimento}}', '{{link_pagamento}}'],
  multiple: ['{{nome_aluno}}', '{{quantidade_parcelas}}', '{{valor_total_atrasado}}', '{{nome_turma}}', '{{cpf_final}}'],
};
