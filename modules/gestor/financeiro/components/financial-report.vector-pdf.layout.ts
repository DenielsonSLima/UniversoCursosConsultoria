import type { jsPDF } from 'jspdf';

import { normalizeCanonicalPdfText } from '../../secretaria/shared/canonical-document-vector-pdf';
import { financialReportValueToText } from './financial-report.vector-pdf.resources';
import type {
  FinancialReportColumn,
  FinancialReportPage,
  FinancialReportPdfInput,
  FinancialReportTone,
  NormalizedFinancialReportRow,
} from './financial-report.vector-pdf.types';

type Rgb = readonly [number, number, number];

export const FINANCIAL_REPORT_PAGE_WIDTH = 210;
export const FINANCIAL_REPORT_PAGE_HEIGHT = 297;
export const FINANCIAL_REPORT_CONTENT_TOP = 70.5;

const CONTENT_LEFT = 20;
const CONTENT_RIGHT = 190;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const FOOTER_TOP = 282;
const TABLE_BOTTOM_WITH_NOTE = 269;
const TABLE_BOTTOM_WITHOUT_NOTE = 277;
const TABLE_HEADER_HEIGHT = 7.5;
const ROW_FONT_SIZE = 5.55;
const ROW_LINE_HEIGHT = 2.4;

const COLORS = {
  navy: [0, 26, 51] as const,
  slate800: [30, 41, 59] as const,
  slate700: [51, 65, 85] as const,
  slate600: [71, 85, 105] as const,
  slate500: [100, 116, 139] as const,
  slate400: [148, 163, 184] as const,
  slate200: [226, 232, 240] as const,
  slate50: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  emerald: [4, 120, 87] as const,
  emeraldSoft: [236, 253, 245] as const,
  rose: [190, 24, 93] as const,
  roseSoft: [255, 241, 242] as const,
  blue: [37, 99, 235] as const,
  blueSoft: [239, 246, 255] as const,
  amber: [180, 83, 9] as const,
  amberSoft: [255, 251, 235] as const,
} as const;

const toneColor = (tone: FinancialReportTone | undefined): Rgb => (
  tone === 'emerald'
    ? COLORS.emerald
    : tone === 'rose'
      ? COLORS.rose
      : tone === 'blue'
        ? COLORS.blue
        : tone === 'amber'
          ? COLORS.amber
          : COLORS.navy
);

const toneSoftColor = (tone: FinancialReportTone | undefined): Rgb => (
  tone === 'emerald'
    ? COLORS.emeraldSoft
    : tone === 'rose'
      ? COLORS.roseSoft
      : tone === 'blue'
        ? COLORS.blueSoft
        : tone === 'amber'
          ? COLORS.amberSoft
          : COLORS.slate50
);

const getColumnWeight = (column: FinancialReportColumn) => {
  const label = column.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/descricao|contraparte|aluno|movimento|lancamento|fornecedor|credor/.test(label)) return 2.6;
  if (/conta|categoria|curso|turma|classificacao/.test(label)) return 1.55;
  if (/entrada|saida|saldo|previsto|realizado|valor|pagamento|recebido/.test(label)) return 1.25;
  if (/data|vencimento|status|situacao|parcela/.test(label)) return 1.05;
  return 1.35;
};

export const getFinancialReportColumnWidths = (columns: FinancialReportColumn[]) => {
  const weights = columns.map(getColumnWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => CONTENT_WIDTH * weight / total);
};

const getCellLines = (pdf: jsPDF, value: string, width: number) => {
  const normalized = normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim() || '—';
  const lines = pdf.splitTextToSize(normalized, Math.max(3, width - 3)) as string[];
  return lines.length > 0 ? lines : ['—'];
};

const measureRowHeight = (
  pdf: jsPDF,
  row: NormalizedFinancialReportRow,
  widths: number[],
) => {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(ROW_FONT_SIZE);
  const maxLines = row.cells.reduce((maximum, cell, index) => (
    Math.max(maximum, getCellLines(pdf, cell, widths[index] || 10).length)
  ), 1);
  return Math.max(7.5, (maxLines * ROW_LINE_HEIGHT) + 3.5);
};

const getSubtitleHeight = (pdf: jsPDF, subtitle: string | undefined) => {
  const text = financialReportValueToText(subtitle || '');
  if (!text) return 0;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.3);
  return Math.min(3, getCellLines(pdf, text, CONTENT_WIDTH).length) * 2.8 + 3;
};

export const getFinancialReportFirstTableY = (
  pdf: jsPDF,
  input: FinancialReportPdfInput,
  contentTop: number,
) => {
  let y = contentTop + 3;
  y += 8 + getSubtitleHeight(pdf, input.subtitle);
  if ((input.filters || []).length > 0) y += Math.ceil((input.filters || []).length / 3) * 14 + 3;
  if ((input.summaryCards || []).length > 0) y += Math.ceil((input.summaryCards || []).length / 4) * 15 + 3;
  return y;
};

export const getFinancialReportTableBottom = (hasFooterNote: boolean) => (
  hasFooterNote ? TABLE_BOTTOM_WITH_NOTE : TABLE_BOTTOM_WITHOUT_NOTE
);

export const assertFinancialReportRowsFitOnPage = (
  pdf: jsPDF,
  rows: NormalizedFinancialReportRow[],
  widths: number[],
  firstTableY: number,
  continuationTableY: number,
  tableBottom: number,
) => {
  const firstPageCapacity = tableBottom - firstTableY - TABLE_HEADER_HEIGHT;
  const continuationPageCapacity = tableBottom - continuationTableY - TABLE_HEADER_HEIGHT;
  const maximumRowHeight = Math.min(firstPageCapacity, continuationPageCapacity);

  if (maximumRowHeight <= 0) {
    throw new Error('Os filtros e resumos do relatório não deixam espaço para os registros em uma página A4. Reduza o conteúdo exibido e tente novamente.');
  }
  rows.forEach((row) => {
    if (measureRowHeight(pdf, row, widths) > maximumRowHeight) {
      throw new Error(`O registro ${row.id} é longo demais para caber integralmente em uma página A4. Reduza o conteúdo da linha e tente novamente.`);
    }
  });
};

export const buildFinancialReportPages = (
  pdf: jsPDF,
  rows: NormalizedFinancialReportRow[],
  widths: number[],
  firstTableY: number,
  continuationTableY: number,
  tableBottom: number,
): FinancialReportPage[] => {
  if (rows.length === 0) return [{ rows: [], firstRecordIndex: 0 }];

  const pages: FinancialReportPage[] = [];
  let pageRows: NormalizedFinancialReportRow[] = [];
  let firstRecordIndex = 0;
  let tableY = firstTableY;
  rows.forEach((row, index) => {
    const rowHeight = measureRowHeight(pdf, row, widths);
    const requiredBottom = tableY + TABLE_HEADER_HEIGHT + pageRows.reduce(
      (total, item) => total + measureRowHeight(pdf, item, widths),
      0,
    ) + rowHeight;
    if (pageRows.length > 0 && requiredBottom > tableBottom) {
      pages.push({ rows: pageRows, firstRecordIndex });
      firstRecordIndex = index;
      pageRows = [];
      tableY = continuationTableY;
    }
    pageRows.push(row);
  });
  pages.push({ rows: pageRows, firstRecordIndex });
  return pages;
};

const drawText = (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options: {
    width?: number;
    align?: 'left' | 'center' | 'right';
    maxLines?: number;
    lineHeight?: number;
  } = {},
) => {
  const normalized = normalizeCanonicalPdfText(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const lines = options.width
    ? getCellLines(pdf, normalized, options.width).slice(0, options.maxLines || Number.MAX_SAFE_INTEGER)
    : [normalized];
  pdf.text(lines, x, y, {
    align: options.align || 'left',
    baseline: 'top',
    lineHeightFactor: options.lineHeight || 1.05,
  });
  return lines.length;
};

export const drawFinancialReportFirstPageIntro = (
  pdf: jsPDF,
  input: FinancialReportPdfInput,
  contentTop: number,
) => {
  const filters = input.filters || [];
  const summaryCards = input.summaryCards || [];
  const accent = toneColor(input.tone);
  let y = contentTop + 3;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...accent);
  drawText(pdf, input.title, CONTENT_LEFT, y, { width: CONTENT_WIDTH, maxLines: 2 });
  y += 7.5;

  const subtitle = financialReportValueToText(input.subtitle || '');
  if (subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.3);
    pdf.setTextColor(...COLORS.slate600);
    const lines = drawText(pdf, subtitle, CONTENT_LEFT, y, {
      width: CONTENT_WIDTH,
      maxLines: 3,
      lineHeight: 1.12,
    });
    y += (lines * 2.8) + 3;
  }

  if (filters.length > 0) {
    const columns = 3;
    const gap = 2.5;
    const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    filters.forEach((filter, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = CONTENT_LEFT + column * (cardWidth + gap);
      const top = y + row * 14;
      pdf.setFillColor(...COLORS.slate50);
      pdf.setDrawColor(...COLORS.slate200);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(x, top, cardWidth, 11.5, 1.5, 1.5, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(4.65);
      pdf.setTextColor(...COLORS.slate400);
      drawText(pdf, filter.label.toUpperCase(), x + 2, top + 1.7, { width: cardWidth - 4, maxLines: 1 });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.45);
      pdf.setTextColor(...COLORS.slate700);
      drawText(pdf, financialReportValueToText(filter.value) || '—', x + 2, top + 5, {
        width: cardWidth - 4,
        maxLines: 2,
      });
    });
    y += Math.ceil(filters.length / columns) * 14 + 3;
  }

  if (summaryCards.length > 0) {
    const columns = Math.min(4, summaryCards.length);
    const gap = 2.5;
    const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    summaryCards.forEach((card, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = CONTENT_LEFT + column * (cardWidth + gap);
      const top = y + row * 15;
      const cardAccent = toneColor(card.tone);
      pdf.setFillColor(...toneSoftColor(card.tone));
      pdf.setDrawColor(...COLORS.slate200);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(x, top, cardWidth, 12.5, 1.5, 1.5, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(4.6);
      pdf.setTextColor(...COLORS.slate500);
      drawText(pdf, card.label.toUpperCase(), x + 2, top + 1.9, { width: cardWidth - 4, maxLines: 1, align: 'center' });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.55);
      pdf.setTextColor(...cardAccent);
      drawText(pdf, financialReportValueToText(card.value) || '—', x + cardWidth / 2, top + 6.4, {
        width: cardWidth - 4,
        maxLines: 1,
        align: 'center',
      });
    });
    y += Math.ceil(summaryCards.length / columns) * 15 + 3;
  }
  return y;
};

export const drawFinancialReportContinuationIntro = (
  pdf: jsPDF,
  input: FinancialReportPdfInput,
  recordStart: number,
  recordEnd: number,
  contentTop: number,
) => {
  const y = contentTop + 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(4.9);
  pdf.setTextColor(...COLORS.slate400);
  drawText(pdf, 'CONTINUAÇÃO', CONTENT_LEFT, y, { width: 45 });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.4);
  pdf.setTextColor(...toneColor(input.tone));
  drawText(pdf, input.title, CONTENT_LEFT, y + 3.7, { width: 120, maxLines: 1 });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(5.1);
  pdf.setTextColor(...COLORS.slate500);
  drawText(pdf, `REGISTROS ${recordStart} A ${recordEnd}`, CONTENT_RIGHT, y + 4.5, {
    width: 55,
    align: 'right',
  });
  pdf.setDrawColor(...COLORS.slate200);
  pdf.setLineWidth(0.22);
  pdf.line(CONTENT_LEFT, y + 11, CONTENT_RIGHT, y + 11);
  return y + 14;
};

export const drawFinancialReportTable = (
  pdf: jsPDF,
  columns: FinancialReportColumn[],
  rows: NormalizedFinancialReportRow[],
  widths: number[],
  top: number,
  tone: FinancialReportTone | undefined,
) => {
  const accent = toneColor(tone);
  pdf.setFillColor(...toneSoftColor(tone));
  pdf.setDrawColor(...COLORS.slate200);
  pdf.roundedRect(CONTENT_LEFT, top, CONTENT_WIDTH, TABLE_HEADER_HEIGHT, 1.1, 1.1, 'FD');
  let x = CONTENT_LEFT;
  columns.forEach((column, index) => {
    const width = widths[index] || 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(4.75);
    pdf.setTextColor(...accent);
    drawText(pdf, column.label.toUpperCase(), x + (column.align === 'right' ? width - 1.5 : column.align === 'center' ? width / 2 : 1.5), top + 2.25, {
      width: width - 3,
      maxLines: 1,
      align: column.align || 'left',
    });
    x += width;
  });

  if (rows.length === 0) {
    pdf.setFillColor(...COLORS.white);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.rect(CONTENT_LEFT, top + TABLE_HEADER_HEIGHT, CONTENT_WIDTH, 22, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.2);
    pdf.setTextColor(...COLORS.slate400);
    drawText(pdf, 'Nenhum registro encontrado.', FINANCIAL_REPORT_PAGE_WIDTH / 2, top + TABLE_HEADER_HEIGHT + 9, {
      width: CONTENT_WIDTH - 10,
      align: 'center',
    });
    return;
  }

  let y = top + TABLE_HEADER_HEIGHT;
  rows.forEach((row, rowIndex) => {
    const rowHeight = measureRowHeight(pdf, row, widths);
    const rowColor = rowIndex % 2 === 0 ? COLORS.white : COLORS.slate50;
    pdf.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
    pdf.setDrawColor(...COLORS.slate200);
    pdf.setLineWidth(0.16);
    pdf.rect(CONTENT_LEFT, y, CONTENT_WIDTH, rowHeight, 'FD');
    let cellX = CONTENT_LEFT;
    row.cells.forEach((cell, cellIndex) => {
      const column = columns[cellIndex] || { label: '', align: 'left' as const };
      const width = widths[cellIndex] || 10;
      const lines = getCellLines(pdf, cell, width);
      const align = column.align || 'left';
      const textX = align === 'right' ? cellX + width - 1.5 : align === 'center' ? cellX + width / 2 : cellX + 1.5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(ROW_FONT_SIZE);
      pdf.setTextColor(...COLORS.slate700);
      pdf.text(lines, textX, y + 1.8, { align, baseline: 'top', lineHeightFactor: 1.08 });
      cellX += width;
    });
    y += rowHeight;
  });
};

export const drawFinancialReportFooter = (
  pdf: jsPDF,
  input: FinancialReportPdfInput,
  pageNumber: number,
  pageCount: number,
) => {
  const issuedAt = input.issuedAt || new Date();
  const note = financialReportValueToText(input.footerNote || '')
    || 'Documento emitido pelo Portal de Gestão Universo Cursos e Consultoria.';
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(4.85);
  pdf.setTextColor(...COLORS.slate500);
  drawText(pdf, note, CONTENT_LEFT, FOOTER_TOP - 8.2, {
    width: CONTENT_WIDTH,
    maxLines: 2,
    lineHeight: 1.1,
  });
  pdf.setDrawColor(...COLORS.slate200);
  pdf.setLineWidth(0.22);
  pdf.line(CONTENT_LEFT, FOOTER_TOP, CONTENT_RIGHT, FOOTER_TOP);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(4.85);
  pdf.setTextColor(...COLORS.slate500);
  drawText(pdf, 'CONFIDENCIAL · USO INTERNO', CONTENT_LEFT, FOOTER_TOP + 3, { width: 54 });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(4.7);
  pdf.setTextColor(...COLORS.slate400);
  drawText(pdf, `Emitido em ${issuedAt.toLocaleString('pt-BR')}`, FINANCIAL_REPORT_PAGE_WIDTH / 2, FOOTER_TOP + 3, {
    width: 58,
    align: 'center',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(4.85);
  pdf.setTextColor(...COLORS.slate500);
  drawText(pdf, `PÁGINA ${pageNumber} DE ${pageCount} · ${input.rows.length} ${input.recordLabel || 'registro(s)'}`, CONTENT_RIGHT, FOOTER_TOP + 3, {
    width: 60,
    align: 'right',
  });
};
