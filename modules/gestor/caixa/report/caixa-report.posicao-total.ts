import type {
  CaixaDetailedReport,
  CaixaReportPosicaoTotal,
} from './caixa-report.types';

export type { CaixaReportPosicaoTotal } from './caixa-report.types';

export const getCaixaReportPosicaoTotal = (
  report: CaixaDetailedReport,
): CaixaReportPosicaoTotal => report.posicaoTotal;

export const getCaixaReportPosicaoTotalUnavailableMessage = (
  position: CaixaReportPosicaoTotal | null,
) => {
  if (position?.disponivel === false && position.motivo === 'HISTORICO_INSUFICIENTE') {
    return 'Histórico de caixa insuficiente para apurar este fechamento.';
  }
  if (position?.disponivel === false) {
    return 'Este perfil precisa dos escopos de Caixa, financeiro e patrimonial.';
  }
  return 'A posição total ainda não está disponível neste relatório.';
};
