import type { jsPDF } from 'jspdf';
import {
  drawCanonicalInstitutionalHeader,
} from '../../secretaria/shared/canonical-institutional-header-pdf';
import { buildCaixaReportPages } from './caixa-report.pagination';
import { prepareCaixaPdfContext, type CaixaPdfResources } from './caixa-report.vector-pdf.context';
import {
  drawFooter,
  drawPageBackground,
  type PdfWithInternals,
} from './caixa-report.vector-pdf.shared';
import { drawSummaryPage, drawFechamentoImplantacao } from './caixa-report.vector-pdf.summary';
import { drawNonOperationalPositionsPage } from './caixa-report.vector-pdf.non-operational';
import { drawConveniosPage } from './caixa-report.vector-pdf.convenios';
import type { CaixaConvenioResumoItem } from '../caixa-convenios.service';
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
  testResources?: CaixaPdfResources,
) => {
  const { pdf, background, backgroundUsesFallback, institution, canonicalLogo, meta } = await prepareCaixaPdfContext(report, testResources);
  const convenioItems = report.convenios.disponivel ? report.convenios.dados.itens : [];
  const pages = buildCaixaReportPages(
    report.recebimentos,
    report.despesas,
    report.analiseRecorrente.turmas,
    convenioItems,
    report.posicaoTotal.disponivel && Boolean(report.posicaoTotal.dados.fechamentoImplantacao),
  );

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
    if (page.section === 'FECHAMENTO_IMPLANTACAO' && report.posicaoTotal.disponivel) {
      drawFechamentoImplantacao(pdf, report.posicaoTotal.dados.fechamentoImplantacao, contentTop);
    }
    if (page.section === 'POSICOES_COMPLEMENTARES') {
      drawNonOperationalPositionsPage(pdf, report, contentTop);
    }
    if (page.section === 'CONVENIOS') {
      drawConveniosPage(
        pdf,
        report,
        page.rows as CaixaConvenioResumoItem[],
        page.sectionPage,
        contentTop,
      );
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
