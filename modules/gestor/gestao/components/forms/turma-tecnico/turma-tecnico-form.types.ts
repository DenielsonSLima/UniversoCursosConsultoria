import type { Turno, Turma } from '../../../gestao.types';
import type { TechnicalEnrollmentSettingsValue } from '../TechnicalEnrollmentSettings';
import type { FinanceiroConfigData } from '../../../tecnicos/detalhes/components/financeiro/financeiro-config.service';

export type TurmaTecnicoStepId = 'TURMA' | 'INSCRICOES' | 'FINANCEIRO' | 'AUTORIZACAO' | 'REVISAO';

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

export type TurmaTecnicoEstadoFinanceiroInicial =
  | 'NOVA'
  | 'IMPORTADA_CICLO_1'
  | 'IMPORTADA_CONCLUIDA';

export type TurmaTecnicoElegibilidadeCiclo =
  | 'QUITACAO_TOTAL'
  | 'PENULTIMA_SEM_ATRASO';

export interface TurmaTecnicoCicloFinanceiroPolicy {
  modo: 'MANUAL';
  estadoInicial: TurmaTecnicoEstadoFinanceiroInicial;
  baselineCycle: 0 | 1 | 2;
  maxCycle: 2;
  eligibilityRule: TurmaTecnicoElegibilidadeCiclo;
}

export type TurmaTecnicoFormData = TechnicalEnrollmentSettingsValue
  & Omit<FinanceiroConfigData, 'cronogramaFinanceiro'>
  & {
    cursoId: string;
    poloId: string;
    dataInicio: string;
    dataPrevisaoTermino: string;
    primeiroVencimentoPadrao: string;
    codigoCondicaoIndividual: string;
    confirmarCodigoCondicaoIndividual: string;
    turno: Turno;
    vagasTotais: number;
    frequenciaMinimaPercent: number;
    mediaMinima: number;
    estadoFinanceiroInicial: TurmaTecnicoEstadoFinanceiroInicial;
    criterioElegibilidadeCiclo: TurmaTecnicoElegibilidadeCiclo;
    origemFinanceira: 'NORMAL' | 'LEGADO';
    financeiroHerdado: boolean;
    gerarCobrancasFuturas: boolean;
    sincronizarAsaasFuturo: boolean;
  };

export interface TurmaTecnicoIdentity {
  nome: string;
  codigo: string;
}

export type TurmaTecnicoSubmission = Omit<Turma, 'id' | 'alunosMatriculados'> & {
  codigoCondicaoIndividual: string;
  cicloFinanceiroTecnico: TurmaTecnicoCicloFinanceiroPolicy;
};

export interface TurmaTecnicoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TurmaTecnicoSubmission) => Promise<void> | void;
  cursosDisponiveis: TurmaTecnicoCourseOption[];
  selectedPoloId?: string;
}
