import type {
  HighSchoolSituation,
  TechnicalDocumentPhase,
  TechnicalLandingClass,
} from '../technicalLanding.types';

export const formatLandingDate = (value?: string | null) => {
  if (!value) return 'A definir';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'A definir';
  return date.toLocaleDateString('pt-BR');
};

export const formatLandingMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const getTechnicalFinancialSummary = (turma: TechnicalLandingClass) => {
  const hasInstallment = Number.isFinite(turma.installmentValue) && turma.installmentValue > 0;
  const hasPunctualDiscount = hasInstallment
    && turma.punctualDiscountEnabled
    && turma.punctualDiscount > 0
    && turma.punctualInstallmentValue > 0
    && turma.punctualInstallmentValue < turma.installmentValue;

  return {
    hasInstallment,
    hasPunctualDiscount,
    regularInstallmentValue: turma.installmentValue,
    payableInstallmentValue: hasPunctualDiscount
      ? turma.punctualInstallmentValue
      : turma.installmentValue,
    punctualDiscount: hasPunctualDiscount ? turma.punctualDiscount : 0,
  };
};

export type TechnicalEnrollmentState = 'OPEN' | 'UPCOMING' | 'SOLD_OUT' | 'CLOSED' | 'OFFLINE';

export const getTechnicalEnrollmentState = (turma: TechnicalLandingClass): TechnicalEnrollmentState => {
  if (turma.onlineEnrollmentAvailable) return 'OPEN';

  const label = turma.availabilityLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('pt-BR');

  if (label.includes('ESGOTAD')) return 'SOLD_OUT';
  if (label.includes('EM BREVE')) return 'UPCOMING';
  if (label.includes('ENCERRAD')) return 'CLOSED';
  return 'OFFLINE';
};

export const SCHOOL_SITUATION_LABELS: Record<HighSchoolSituation, string> = {
  CURSANDO_2_ANO: 'Cursando a 2ª série do Ensino Médio',
  CURSANDO_3_ANO: 'Cursando a 3ª série do Ensino Médio',
  CONCLUIDO: 'Ensino Médio concluído',
};

export const DOCUMENT_PHASE_LABELS: Record<TechnicalDocumentPhase, string> = {
  APOS_PAGAMENTO: 'Enviar após o pagamento',
  ANTES_ATIVACAO: 'Necessário para regularização',
  ANTES_ESTAGIO: 'Necessário antes do estágio',
};
