import { MensageriaConfigData } from '../../../configuracoes/mensageria/mensageria.service';

export const DEFAULT_AUTOMATION: Partial<MensageriaConfigData> = {
  waDueNoticeDays: 3,
  waSendDueNotice: true,
  waDueNoticeTemplate:
    'Olá, {{nome_aluno}}. Passando para lembrar que sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para facilitar, o pagamento pode ser feito por este link: {{link_pagamento}}. Se você já realizou o pagamento, por favor desconsidere esta mensagem.',
  waSendPaymentReceipt: true,
  waPaymentReceiptTemplate:
    'Olá, {{nome_aluno}}. Confirmamos o recebimento do pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado por manter tudo em dia com a Universo Cursos.',
  waSendOverdueNotice: true,
  waOverdueNoticeDays: 1,
  waDefaultOverdueTemplate:
    'Olá, {{nome_aluno}}. Verificamos uma parcela de {{valor_fatura}} com vencimento em {{data_vencimento}} ainda em aberto. Para regularizar, você pode usar este link: {{link_pagamento}}. Se o pagamento já foi feito, por favor desconsidere esta mensagem.',
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
  due: ['{{nome_aluno}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{link_pagamento}}'],
  receipt: ['{{nome_aluno}}', '{{valor_fatura}}', '{{descricao_fatura}}'],
  overdue: ['{{nome_aluno}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{link_pagamento}}'],
  multiple: ['{{nome_aluno}}', '{{quantidade_parcelas}}', '{{valor_total_atrasado}}'],
};
