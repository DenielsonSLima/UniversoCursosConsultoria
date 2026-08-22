import type { LucideIcon } from 'lucide-react';
import type { Turno, Turma } from '../../../gestao.types';

export type TurmaPlanoUnicoModalidade = 'LIVRE' | 'ESPECIALIZACAO';
export type TurmaPlanoUnicoStepId = 'TURMA' | 'PLANO_FINANCEIRO' | 'REVISAO';

export interface TurmaPlanoUnicoStep {
  id: TurmaPlanoUnicoStepId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface TurmaPlanoUnicoCourseOption {
  id: string;
  nome: string;
}

export interface TurmaPlanoUnicoPoloOption {
  id: string;
  nome?: string;
  nomeFantasia?: string;
  cidade: string;
}

export interface TurmaPlanoUnicoTheme {
  accentText: string;
  accentSoftText: string;
  accentSoftBg: string;
  accentSoftBorder: string;
  accentFocus: string;
  accentHoverBg: string;
  accentStepBg: string;
  accentStepText: string;
}

export interface TurmaPlanoUnicoFormConfig {
  modalidade: TurmaPlanoUnicoModalidade;
  title: string;
  subtitle: string;
  courseLabel: string;
  submitLabel: string;
  Icon: LucideIcon;
  defaultTurno: Turno;
  defaultVagas: number;
  theme: TurmaPlanoUnicoTheme;
  generateIdentity: (params: {
    curso: TurmaPlanoUnicoCourseOption;
    polo: TurmaPlanoUnicoPoloOption;
    formData: TurmaPlanoUnicoFormData;
  }) => TurmaPlanoUnicoIdentity | null;
}

export interface TurmaPlanoUnicoFormData {
  cursoId: string;
  poloId: string;
  dataInicio: string;
  dataPrevisaoTermino: string;
  turno: Turno;
  vagasTotais: number;
  valorTotal: number;
  qtdParcelas: number;
  primeiroVencimento: string;
  descontoPontualidade: number;
  jurosAtrasoPercentual: number;
  multaAtraso: number;
}

export interface TurmaPlanoUnicoIdentity {
  nome: string;
  codigo: string;
}

export interface TurmaPlanoUnicoFinancialPlan {
  valorTotal: number;
  qtdParcelas: number;
  primeiroVencimento: string;
  diaVencimento: number;
  descontoPontualidade: number;
  jurosAtrasoPercentual: number;
  multaAtraso: number;
}

export interface TurmaPlanoUnicoInstallment {
  id: string;
  numero: number;
  valor: number;
  dataVencimento: string;
  fingerprint?: string;
}

export type TurmaPlanoUnicoSubmission = Omit<
  Turma,
  'id' | 'alunosMatriculados' | 'modalidade'
> & {
  modalidade: TurmaPlanoUnicoModalidade;
  planoFinanceiroUnico: TurmaPlanoUnicoFinancialPlan;
};

export interface TurmaPlanoUnicoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TurmaPlanoUnicoSubmission) => Promise<void> | void;
  cursosDisponiveis: TurmaPlanoUnicoCourseOption[];
  selectedPoloId?: string;
  config: TurmaPlanoUnicoFormConfig;
}
