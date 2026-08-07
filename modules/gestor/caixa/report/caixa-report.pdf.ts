import type { CaixaDetailedReport } from './caixa-report.types';
import {
  buildCaixaVectorPdf,
  CAIXA_REPORT_PDF_PIPELINE,
} from './caixa-report.vector-pdf';

export { CAIXA_REPORT_PDF_PIPELINE };

export const buildCaixaReportFileName = (
  competencia: string,
  scopeLabel: string,
) => {
  const [year, month] = competencia.split('-');
  const safeScope = scopeLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `prestacao-caixa-${year}-${month}-${safeScope || 'resultado-geral'}.pdf`;
};

export const getCaixaReportPdfErrorMessage = (error: unknown) => {
  const detail = error instanceof Error ? error.message : '';
  if (/imagem|decodificada/i.test(detail)) {
    return 'A logo ou a marca d’água não pôde ser carregada para o PDF. Reabra a prévia e tente novamente.';
  }
  if (/fonte/i.test(detail)) {
    return 'A fonte Inter do relatório não pôde ser incorporada ao PDF. Recarregue a página e tente novamente.';
  }
  return 'Não foi possível gerar o PDF. Reabra a prévia e tente novamente.';
};

export const buildCaixaReportPdf = async (
  report: CaixaDetailedReport,
  onProgress?: (current: number, total: number) => void,
) => buildCaixaVectorPdf(report, onProgress);
