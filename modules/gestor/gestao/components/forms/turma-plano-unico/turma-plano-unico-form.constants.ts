import type {
  TurmaPlanoUnicoFormConfig,
  TurmaPlanoUnicoFormData,
  TurmaPlanoUnicoStep,
} from './turma-plano-unico-form.types';

export const TURMA_PLANO_UNICO_STEPS: TurmaPlanoUnicoStep[] = [
  {
    id: 'TURMA',
    label: 'Dados da turma',
    shortLabel: 'Turma',
    description: 'Curso, polo, calendário, turno e capacidade.',
  },
  {
    id: 'PLANO_FINANCEIRO',
    label: 'Plano financeiro',
    shortLabel: 'Financeiro',
    description: 'Valor total, parcelas e regras de atraso.',
  },
  {
    id: 'REVISAO',
    label: 'Revisão',
    shortLabel: 'Revisão',
    description: 'Conferência final antes de abrir a turma.',
  },
];

export const createInitialTurmaPlanoUnicoFormData = (
  config: TurmaPlanoUnicoFormConfig,
  selectedPoloId?: string,
): TurmaPlanoUnicoFormData => ({
  cursoId: '',
  poloId: selectedPoloId || '',
  dataInicio: '',
  dataPrevisaoTermino: '',
  turno: config.defaultTurno,
  vagasTotais: config.defaultVagas,
  valorTotal: 0,
  qtdParcelas: 1,
  primeiroVencimento: '',
  descontoPontualidade: 0,
  jurosAtrasoPercentual: 0,
  multaAtraso: 0,
});
