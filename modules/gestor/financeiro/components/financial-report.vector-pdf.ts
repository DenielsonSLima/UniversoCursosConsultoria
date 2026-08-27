import type { jsPDF } from 'jspdf';

import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../../secretaria/shared/canonical-institutional-header-pdf';
import { drawCanonicalPdfWatermark } from '../../secretaria/shared/canonical-document-vector-pdf';
import { FINANCIAL_REPORT_FALLBACK_WATERMARK } from './financial-report.vector-pdf.fallback';
import {
  assertFinancialReportRowsFitOnPage,
  buildFinancialReportPages,
  drawFinancialReportContinuationIntro,
  drawFinancialReportFirstPageIntro,
  drawFinancialReportFooter,
  drawFinancialReportTable,
  FINANCIAL_REPORT_CONTENT_TOP,
  FINANCIAL_REPORT_PAGE_HEIGHT,
  FINANCIAL_REPORT_PAGE_WIDTH,
  getFinancialReportColumnWidths,
  getFinancialReportFirstTableY,
  getFinancialReportTableBottom,
} from './financial-report.vector-pdf.layout';
import {
  asFinancialReportRecord,
  loadFinancialReportIsolatedImage,
  loadFinancialReportWatermarkSnapshot,
  mergeFinancialReportInstitution,
  normalizeFinancialReportRows,
  readFinancialReportText,
  safeFinancialReportFileName,
  type FinancialReportWatermarkSnapshot,
} from './financial-report.vector-pdf.resources';
import type { FinancialReportPdfInput } from './financial-report.vector-pdf.types';

export { financialReportValueToText } from './financial-report.vector-pdf.resources';
export type {
  FinancialReportColumn,
  FinancialReportFilter,
  FinancialReportPdfInput,
  FinancialReportRow,
  FinancialReportSummaryCard,
  FinancialReportTone,
} from './financial-report.vector-pdf.types';

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;
type PdfWithInternals = { internal: { pages?: string[][] } };

interface PdfTransformationMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const drawFinancialReportPageBackground = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: FinancialReportWatermarkSnapshot,
  label: string,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, FINANCIAL_REPORT_PAGE_WIDTH, FINANCIAL_REPORT_PAGE_HEIGHT, 'F');
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: true,
    imageUrl: watermark.imageUrl,
    image: watermark.image,
    label,
    opacity: watermark.opacity,
    scale: watermark.scale,
    rotate: watermark.rotate,
  }, {
    x: 0,
    y: 0,
    width: FINANCIAL_REPORT_PAGE_WIDTH,
    height: FINANCIAL_REPORT_PAGE_HEIGHT,
    textSize: 54,
    rotate: 45,
  });
};

export const FINANCIAL_REPORT_PDF_PIPELINE = 'native-vector' as const;

export const getFinancialReportPdfFileName = (fileName: string) => (
  `${safeFinancialReportFileName(fileName)}.pdf`
);

export const createFinancialReportPdfDocument = async (
  input: FinancialReportPdfInput,
  onProgress?: (progress: { current: number; total: number }) => void,
) => {
  const { jsPDF: JsPdf, GState } = await import('jspdf');
  const pdf = new JsPdf({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: false,
  });
  const issuedAt = input.issuedAt || new Date();
  const institutionSource = mergeFinancialReportInstitution(input.company, input.polo);
  const institution = normalizeCanonicalInstitutionalHeader(institutionSource);
  const polo = asFinancialReportRecord(input.polo);
  const logoUrl = readFinancialReportText(institutionSource, ['logoUrl', 'logo_url']) || null;
  const [logo, loadedWatermark] = await Promise.all([
    loadFinancialReportIsolatedImage(logoUrl),
    loadFinancialReportWatermarkSnapshot(polo),
  ]);
  if (logoUrl && !logo) {
    throw new Error('Não foi possível carregar a logo institucional configurada para este relatório.');
  }
  const fallbackWatermark = loadedWatermark.configured
    ? null
    : logo
      ?? await loadFinancialReportIsolatedImage('/LogoUniverso.png')
      ?? FINANCIAL_REPORT_FALLBACK_WATERMARK;
  const watermark: FinancialReportWatermarkSnapshot = loadedWatermark.configured
    ? loadedWatermark
    : { ...loadedWatermark, image: fallbackWatermark };
  const widths = getFinancialReportColumnWidths(input.columns);
  const rows = normalizeFinancialReportRows(input.rows, input.columns.length);
  const firstTableY = getFinancialReportFirstTableY(pdf, input, FINANCIAL_REPORT_CONTENT_TOP);
  const continuationTableY = FINANCIAL_REPORT_CONTENT_TOP + 14;
  const tableBottom = getFinancialReportTableBottom(Boolean(input.footerNote));
  assertFinancialReportRowsFitOnPage(
    pdf,
    rows,
    widths,
    firstTableY,
    continuationTableY,
    tableBottom,
  );
  const pages = buildFinancialReportPages(
    pdf,
    rows,
    widths,
    firstTableY,
    continuationTableY,
    tableBottom,
  );
  const reportInput = { ...input, issuedAt };
  const documentSection = input.documentSection?.trim() || 'Financeiro';
  const meta = {
    eyebrow: `${documentSection} · relatório gerencial`,
    title: input.rightTitle || 'Relatório Financeiro',
    label: 'Tipo',
    value: input.rightType || 'Financeiro',
  };

  pdf.setCreationDate(issuedAt);
  pdf.setProperties({
    title: input.title,
    subject: input.documentSubject?.trim() || `Relatório institucional · ${documentSection}`,
    author: institution.name,
    creator: 'Universo Cursos e Consultoria',
    keywords: input.documentKeywords?.trim() || `${documentSection.toLowerCase()}, relatório, gestão, universidade`,
  });

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) pdf.addPage('a4', 'portrait');
    onProgress?.({ current: pageIndex + 1, total: pages.length });
    drawFinancialReportPageBackground(
      pdf,
      GState as unknown as PdfGStateConstructor,
      watermark,
      institution.name || 'UNIVERSO CURSOS E CONSULTORIA',
    );
    const header = drawCanonicalInstitutionalHeader(pdf, institution, logo, {
      orientation: 'portrait',
      alias: 'financial-report-institutional-header-logo',
      meta,
    });
    const tableTop = pageIndex === 0
      ? drawFinancialReportFirstPageIntro(pdf, reportInput, header.contentTop)
      : drawFinancialReportContinuationIntro(
        pdf,
        reportInput,
        page.firstRecordIndex + 1,
        page.firstRecordIndex + page.rows.length,
        header.contentTop,
      );
    drawFinancialReportTable(pdf, input.columns, page.rows, widths, tableTop, input.tone);
    drawFinancialReportFooter(pdf, reportInput, pageIndex + 1, pages.length);
  });

  return pdf;
};

export const buildFinancialReportPdf = async (
  input: FinancialReportPdfInput,
  onProgress?: (progress: { current: number; total: number }) => void,
) => {
  const pdf = await createFinancialReportPdfDocument(input, onProgress);
  return pdf.output('blob');
};

const parseTransformationMatrix = (operator: string): PdfTransformationMatrix | null => {
  const match = operator.match(
    /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm$/,
  );
  if (!match) return null;
  const [a, b, c, d, e, f] = match.slice(1).map(Number);
  return { a, b, c, d, e, f };
};

export const inspectFinancialReportPdfOperatorsForTest = (pdf: jsPDF) => {
  const pages = (pdf as unknown as PdfWithInternals).internal.pages ?? [];
  return pages.slice(1).map((operators) => {
    const matrices = operators.map(parseTransformationMatrix).filter(
      (matrix): matrix is PdfTransformationMatrix => matrix !== null,
    );
    return {
      hasTextOperator: operators.some((operator) => /\b(?:Tj|TJ)\b/.test(operator)),
      hasVectorGeometry: operators.some((operator) => /\b(?:re|m|l|S|f|B)\b/.test(operator)),
      imageDrawCount: operators.filter((operator) => /\/I\w+\s+Do\b/.test(operator)).length,
      hasRotatedImageMatrix: matrices.some((matrix) => Math.abs(matrix.b) > 0.0001 || Math.abs(matrix.c) > 0.0001),
      imageScaleMatrices: matrices.filter((matrix) => (
        Math.abs(matrix.b) < 0.0001
        && Math.abs(matrix.c) < 0.0001
        && Math.abs(matrix.e) < 0.0001
        && Math.abs(matrix.f) < 0.0001
        && matrix.a > 1
        && matrix.d > 1
      )),
    };
  });
};
