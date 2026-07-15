import type { HighSchoolSituation, TechnicalDocumentPhase } from '../technicalLanding.types';

export const formatLandingDate = (value?: string | null) => {
  if (!value) return 'A definir';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'A definir';
  return date.toLocaleDateString('pt-BR');
};

export const formatLandingMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

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
