import type { Turno, Turma } from '../../../gestao.types';
import type { TechnicalEnrollmentSettingsValue } from '../TechnicalEnrollmentSettings';
import type { FinanceiroConfigData } from '../../../tecnicos/detalhes/components/financeiro/financeiro-config.service';

export type TurmaTecnicoStepId = 'TURMA' | 'INSCRICOES' | 'FINANCEIRO' | 'REVISAO';

export interface TurmaTecnicoStep {
  id: TurmaTecnicoStepId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface TurmaTecnicoCourseOption {
  id: string;
  nome: string;
}

export interface TurmaTecnicoPoloOption {
  id: string;
  nome?: string;
  nomeFantasia?: string;
  cidade: string;
}

export type TurmaTecnicoFormData = TechnicalEnrollmentSettingsValue
  & Omit<FinanceiroConfigData, 'cronogramaFinanceiro'>
  & {
    cursoId: string;
    poloId: string;
    dataInicio: string;
    dataPrevisaoTermino: string;
    turno: Turno;
    vagasTotais: number;
    frequenciaMinimaPercent: number;
    mediaMinima: number;
    origemFinanceira: 'NORMAL' | 'LEGADO';
    financeiroHerdado: boolean;
    gerarCobrancasFuturas: boolean;
    sincronizarAsaasFuturo: boolean;
  };

export interface TurmaTecnicoIdentity {
  nome: string;
  codigo: string;
}

export type TurmaTecnicoSubmission = Omit<Turma, 'id' | 'alunosMatriculados'>;

export interface TurmaTecnicoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TurmaTecnicoSubmission) => Promise<void> | void;
  cursosDisponiveis: TurmaTecnicoCourseOption[];
  selectedPoloId?: string;
}
