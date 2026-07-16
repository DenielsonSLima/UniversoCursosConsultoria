export interface BirthdayAgentSettings {
  id?: boolean;
  enabled: boolean;
  sendTime: string;
  modalities: string[];
  enrollmentStatuses: string[];
  schoolName: string;
  messageTemplate: string;
  quoteEnabled: boolean;
  updatedAt?: string;
}

export interface BirthdayProjectionRow {
  month_num: number;
  month_label: string;
  recipients_count: number;
  estimated_cost: number;
  currency: string;
}

export interface BirthdayMessageSample {
  id: number;
  content: string;
}

export interface BirthdayBankStats {
  activeCount: number;
  quoteCount: number;
  samples: BirthdayMessageSample[];
}

export const DEFAULT_BIRTHDAY_TEMPLATE =
  '🎉 Bom dia, {{nome_aluno}}!\n\nHoje é um dia muito especial! A equipe da Universo Cursos e Consultoria deseja a você um feliz aniversário.\n\nQue este novo ciclo seja repleto de saúde, paz, felicidade, conquistas e muito sucesso em sua caminhada.\n\nAproveite bastante o seu dia. Parabéns! 🎂🎈\n\n{{frase_aniversario}}';

export const BIRTHDAY_TEMPLATE_VARIABLES = [
  '{{nome_aluno}}',
  '{{escola}}',
  '{{frase_aniversario}}',
] as const;

export const DEFAULT_BIRTHDAY_SETTINGS: BirthdayAgentSettings = {
  enabled: false,
  sendTime: '09:00',
  modalities: ['TECNICO', 'EAD', 'LIVRES', 'ESPECIALIZACAO'],
  enrollmentStatuses: ['ATIVO'],
  schoolName: 'Universo Cursos e Consultoria',
  messageTemplate: DEFAULT_BIRTHDAY_TEMPLATE,
  quoteEnabled: true,
};

export const BIRTHDAY_MODALITIES = [
  { id: 'TECNICO', label: 'Técnico' },
  { id: 'EAD', label: 'EAD' },
  { id: 'LIVRES', label: 'Livres' },
  { id: 'ESPECIALIZACAO', label: 'Especialização' },
  { id: 'SUPERIOR', label: 'Superior' },
];

export const ENROLLMENT_STATUS_OPTIONS = [
  { id: 'ATIVO', label: 'Cursando' },
  { id: 'CONCLUIDO', label: 'Concluído' },
  { id: 'TRANCADO', label: 'Trancado' },
  { id: 'CANCELADO', label: 'Cancelado' },
  { id: 'DESISTENTE', label: 'Desistente' },
];
