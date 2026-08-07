import {
  MULTICHANNEL_COURSE_MODALITIES,
  MultichannelAutomationChannel,
  MultichannelAutomationEvent,
  MultichannelCourseModality,
} from './multichannel-automation.types';

export interface MultichannelAutomationDefinition {
  event: MultichannelAutomationEvent;
  name: string;
  description: string;
  category: 'financeiro' | 'relacionamento' | 'academico';
  recommendedChannels: MultichannelAutomationChannel[];
  variables: string[];
}

export const MULTICHANNEL_AUTOMATION_CATALOG: MultichannelAutomationDefinition[] = [
  {
    event: 'payment_due',
    name: 'Aviso de vencimento',
    description: 'Lembra o aluno antes do vencimento de uma parcela.',
    category: 'financeiro',
    recommendedChannels: ['app_message', 'push'],
    variables: ['{{nome_aluno}}', '{{nome_curso}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{cpf_final}}', '{{link_pagamento}}'],
  },
  {
    event: 'payment_received',
    name: 'Pagamento confirmado',
    description: 'Confirma a baixa do pagamento e mantém o comprovante acessível no app.',
    category: 'financeiro',
    recommendedChannels: ['app_message', 'push'],
    variables: ['{{nome_aluno}}', '{{nome_curso}}', '{{valor_fatura}}', '{{numero_mensalidade}}', '{{cpf_final}}'],
  },
  {
    event: 'payment_overdue',
    name: 'Aviso de parcela vencida',
    description: 'Avisa sobre uma parcela pendente após o vencimento.',
    category: 'financeiro',
    recommendedChannels: ['app_message', 'push', 'whatsapp'],
    variables: ['{{nome_aluno}}', '{{nome_turma}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{cpf_final}}', '{{link_pagamento}}'],
  },
  {
    event: 'multiple_overdue',
    name: 'Múltiplas parcelas em atraso',
    description: 'Orienta o aluno quando existem duas ou mais parcelas pendentes.',
    category: 'financeiro',
    recommendedChannels: ['app_message', 'whatsapp'],
    variables: ['{{nome_aluno}}', '{{nome_curso}}', '{{nome_turma}}', '{{quantidade_parcelas}}', '{{valor_total_atrasado}}', '{{cpf_final}}'],
  },
  {
    event: 'birthday',
    name: 'Aniversário do aluno',
    description: 'Envia uma mensagem de relacionamento apenas quando houver consentimento válido.',
    category: 'relacionamento',
    recommendedChannels: ['whatsapp'],
    variables: ['{{nome_aluno}}', '{{escola}}', '{{frase_aniversario}}'],
  },
];

const COURSE_MODALITY_ALIASES: Record<string, MultichannelCourseModality> = {
  LIVRES: 'LIVRE',
  'TÉCNICO': 'TECNICO',
  'ESPECIALIZAÇÃO': 'ESPECIALIZACAO',
};

export const normalizeMultichannelCourseModalities = (
  values: readonly string[],
): MultichannelCourseModality[] => {
  const allowed = new Set<string>(MULTICHANNEL_COURSE_MODALITIES);
  return [...new Set(values
    .map((value) => value.trim().toUpperCase())
    .map((value) => COURSE_MODALITY_ALIASES[value] || value)
    .filter((value): value is MultichannelCourseModality => allowed.has(value))
  )];
};

export const isFinancialAutomationEvent = (event: MultichannelAutomationEvent) =>
  event !== 'birthday';
