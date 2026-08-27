import type { jsPDF } from 'jspdf';
import {
  formatCaixaCompetencia,
} from '../caixa.formatters';
import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../../secretaria/shared/canonical-institutional-header-pdf';
import { getCanonicalPdfInlineImage } from '../../secretaria/shared/canonical-document-vector-pdf';
import { buildCaixaReportPages } from './caixa-report.pagination';
import {
  drawFooter,
  drawPageBackground,
  fetchAsDataUrl,
  fetchLogoDataUrl,
  registerInterFont,
  type PdfWithInternals,
} from './caixa-report.vector-pdf.shared';
import { drawSummaryPage } from './caixa-report.vector-pdf.summary';
import { drawNonOperationalPositionsPage } from './caixa-report.vector-pdf.non-operational';
import {
  drawMovementTable,
  drawRecurringTable,
  drawSectionHeading,
} from './caixa-report.vector-pdf.tables';
import type {
  CaixaDetailedReport,
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportRecurringClass,
} from './caixa-report.types';

export {
  CAIXA_REPORT_PDF_PIPELINE,
  getCaixaResultLabel,
  buildCaixaAdjustmentLines,
} from './caixa-report.vector-pdf.shared';
export {
  drawSummaryPage,
  drawTotalPositionCard,
  drawComposition,
  drawSummaryPanels,
} from './caixa-report.vector-pdf.summary';
export {
  drawNonOperationalPositionsPage,
  drawLiquidPositionBand,
  drawNonOperationalPanel,
  drawRestrictedNonOperationalPosition,
} from './caixa-report.vector-pdf.non-operational';
export {
  drawSectionHeading,
  drawMovementTable,
  drawRecurringTable,
} from './caixa-report.vector-pdf.tables';

export const createCaixaReportPdfDocument = async (
  report: CaixaDetailedReport,
  onProgress?: (current: number, total: number) => void,
  testResources?: {
    regularFontBuffer?: ArrayBuffer;
    mediumFontBuffer?: ArrayBuffer;
    semiBoldFontBuffer?: ArrayBuffer;
    boldFontBuffer?: ArrayBuffer;
    extraBoldFontBuffer?: ArrayBuffer;
    blackFontBuffer?: ArrayBuffer;
    logoDataUrl?: string | null;
    backgroundDataUrl?: string | null;
  },
) => {
  const { jsPDF: JsPdf } = await import('jspdf');
  const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false });
  pdf.setProperties({
    title: `Prestação de contas - ${formatCaixaCompetencia(report.resumo.meta.competencia)}`,
    subject: `Relatório do Caixa - ${report.resumo.meta.escopoRotulo}`,
    author: report.institucional.nome,
    creator: 'Universo Cursos e Consultoria',
    keywords: 'caixa, prestação de contas, relatório financeiro',
  });
  await registerInterFont(pdf, {
    regular: testResources?.regularFontBuffer,
    medium: testResources?.mediumFontBuffer,
    semiBold: testResources?.semiBoldFontBuffer,
    bold: testResources?.boldFontBuffer,
    extraBold: testResources?.extraBoldFontBuffer,
    black: testResources?.blackFontBuffer,
  });
  const backgroundUsesFallback = !report.institucional.landscape_watermark_url;
  const fallbackArtworkUrl = typeof window === 'undefined' ? null : '/LogoUniverso.png';
  const [logo, background] = await Promise.all([
    testResources?.logoDataUrl !== undefined
      ? Promise.resolve(testResources.logoDataUrl)
      : fetchLogoDataUrl(report.institucional.logo_url),
    testResources?.backgroundDataUrl !== undefined
      ? Promise.resolve(testResources.backgroundDataUrl)
      : fetchAsDataUrl(report.institucional.landscape_watermark_url || fallbackArtworkUrl),
  ]);
  const pages = buildCaixaReportPages(report.recebimentos, report.despesas, report.analiseRecorrente.turmas);
  const institution = normalizeCanonicalInstitutionalHeader({
    ...report.institucional,
    uf: report.institucional.estado,
  });
  const canonicalLogo = getCanonicalPdfInlineImage(logo);
  const meta = {
    eyebrow: 'Caixa · uso interno',
    title: report.resumo.meta.escopoRotulo,
    label: 'Competência',
    value: formatCaixaCompetencia(report.resumo.meta.competencia),
  };

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (pageIndex > 0) pdf.addPage('a4', 'landscape');
    onProgress?.(pageIndex + 1, pages.length);
    if (pageIndex > 0 && pageIndex % 4 === 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }
    drawPageBackground(pdf, report, background, backgroundUsesFallback);
    const headerLayout = drawCanonicalInstitutionalHeader(pdf, institution, canonicalLogo, {
      orientation: 'landscape',
      alias: 'caixa-institutional-header-logo',
      meta,
    });
    const contentTop = headerLayout.contentTop;
    const isLastSectionPage = pageIndex === pages.length - 1 || pages[pageIndex + 1]?.section !== page.section;
    if (page.section === 'RESUMO') drawSummaryPage(pdf, report, contentTop);
    if (page.section === 'POSICOES_COMPLEMENTARES') {
      drawNonOperationalPositionsPage(pdf, report, contentTop);
    }
    if (page.section === 'RECEBIMENTOS') {
      drawSectionHeading(pdf, 'Recebimentos confirmados', 'Aluno/pagador, parcela, curso, turma, conta e composição financeira.', page.sectionPage, 'emerald', contentTop);
      drawMovementTable(pdf, page.rows as CaixaReportReceipt[], report.totaisRecebimentos, isLastSectionPage, 'emerald', contentTop);
    }
    if (page.section === 'DESPESAS') {
      drawSectionHeading(pdf, 'Despesas pagas', 'Fornecedor, classificação, parcela, conta e composição financeira.', page.sectionPage, 'rose', contentTop);
      drawMovementTable(pdf, page.rows as CaixaReportExpense[], report.totaisDespesas, isLastSectionPage, 'rose', contentTop);
    }
    if (page.section === 'CARTEIRA_RECORRENTE') {
      drawRecurringTable(pdf, report, page.rows as CaixaReportRecurringClass[], page.sectionPage, page.sectionPage === 1, isLastSectionPage, contentTop);
    }
    drawFooter(pdf, report, pageIndex + 1, pages.length);
  }
  return pdf;
};

export const buildCaixaVectorPdf = async (
  report: CaixaDetailedReport,
  onProgress?: (current: number, total: number) => void,
) => {
  const pdf = await createCaixaReportPdfDocument(report, onProgress);
  return pdf.output('blob');
};

export const inspectCaixaPdfOperatorsForTest = (pdf: jsPDF) => {
  const pages = (pdf as unknown as PdfWithInternals).internal.pages ?? [];
  return pages.slice(1).map((operators) => ({
    hasTextOperator: operators.some((operator) => /\b(?:Tj|TJ)\b/.test(operator)),
    imageDrawCount: operators.filter((operator) => /\/I\w+\s+Do\b/.test(operator)).length,
  }));
};
