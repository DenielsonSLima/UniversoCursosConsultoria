import type { CaixaDetailedReport } from './caixa-report.types';
import type { CaixaReportKind } from './caixa-report.presentation';
import { buildCaixaConcisePdf } from './caixa-report.concise-pdf';
import {
  buildCaixaVectorPdf,
  CAIXA_REPORT_PDF_PIPELINE,
} from './caixa-report.vector-pdf';

export { CAIXA_REPORT_PDF_PIPELINE };

export const buildCaixaReportFileName = (
  competencia: string,
  scopeLabel: string,
  kind: CaixaReportKind = 'COMPLETO',
) => {
  const [year, month] = competencia.split('-');
  const safeScope = scopeLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `prestacao-caixa-${year}-${month}-${safeScope || 'resultado-geral'}${kind === 'RESUMIDO' ? '-resumido' : ''}.pdf`;
};

export const getCaixaReportPdfErrorMessage = (error: unknown) => {
  const detail = error instanceof Error ? error.message : '';
  if (/duas páginas/i.test(detail)) return detail;
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
  kind: CaixaReportKind = 'COMPLETO',
) => kind === 'RESUMIDO' ? buildCaixaConcisePdf(report, onProgress) : buildCaixaVectorPdf(report, onProgress);
