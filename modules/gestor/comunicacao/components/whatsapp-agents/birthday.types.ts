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
  'Bom dia, {{nome}}! Neste dia especial, a família {{escola}} deseja um feliz aniversário, com muita saúde, paz, realizações e muitos motivos para sorrir.';

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
