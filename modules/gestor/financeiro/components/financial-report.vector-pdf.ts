import React from 'react';
import type { jsPDF } from 'jspdf';

import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../../secretaria/shared/canonical-institutional-header-pdf';
import {
  drawCanonicalPdfWatermark,
  getCanonicalPdfInlineImage,
  normalizeCanonicalPdfText,
  type CanonicalPdfImage,
} from '../../secretaria/shared/canonical-document-vector-pdf';

export type FinancialReportTone = 'emerald' | 'rose' | 'blue' | 'slate' | 'amber';

export interface FinancialReportColumn {
  label: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface FinancialReportRow {
  id: string;
  cells: React.ReactNode[];
  className?: string;
}

export interface FinancialReportSummaryCard {
  label: string;
  value: React.ReactNode;
  tone?: FinancialReportTone;
}

export interface FinancialReportFilter {
  label: string;
  value: React.ReactNode;
}

export interface FinancialReportPdfInput {
  title: string;
  subtitle?: string;
  rightTitle?: string;
  rightType?: string;
  fileName: string;
  columns: FinancialReportColumn[];
  rows: FinancialReportRow[];
  summaryCards?: FinancialReportSummaryCard[];
  filters?: FinancialReportFilter[];
  footerNote?: string;
  recordLabel?: string;
  polo?: object | null;
  company?: object | null;
  tone?: FinancialReportTone;
  issuedAt?: Date;
}

interface NormalizedFinancialReportRow {
  id: string;
  cells: string[];
}

interface FinancialReportPage {
  rows: NormalizedFinancialReportRow[];
  firstRecordIndex: number;
}

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;
type Rgb = readonly [number, number, number];
type PdfWithInternals = {
  internal: { pages?: string[][] };
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
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
  slate300: [203, 213, 225] as const,
  slate200: [226, 232, 240] as const,
  slate100: [241, 245, 249] as const,
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

const asRecord = (value: object | null | undefined): Record<string, unknown> => (
  value && typeof value === 'object' ? value as Record<string, unknown> : {}
);

const readText = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = String(source[key] ?? '').trim();
    if (value) return value;
  }
  return '';
};

const readNumber = (source: Record<string, unknown>, keys: string[], fallback: number) => {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const mergeInstitution = (
  company: object | null | undefined,
  polo: object | null | undefined,
) => {
  const result: Record<string, unknown> = {};
  [asRecord(company), asRecord(polo)].forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') result[key] = value;
    });
  });
  return result;
};

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

/**
 * O relatório só incorpora ativos isolados (logo ou marca). A página e suas
 * tabelas nunca passam por canvas ou captura de DOM.
 */
const loadIsolatedImage = async (source: string | null | undefined): Promise<CanonicalPdfImage | null> => {
  const inline = getCanonicalPdfInlineImage(source);
  if (inline) return inline;

  const url = String(source || '').trim();
  if (!url || (!/^https?:\/\//i.test(url) && !url.startsWith('/'))) return null;

  try {
    const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size > 16 * 1024 * 1024) return null;
    return getCanonicalPdfInlineImage(`data:${blob.type};base64,${toBase64(await blob.arrayBuffer())}`);
  } catch {
    return null;
  }
};

const normalizeNodeText = (value: React.ReactNode): string => {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNodeText(entry)).filter(Boolean).join(' ');
  }
  if (React.isValidElement(value)) {
    const children = (value.props as { children?: React.ReactNode }).children;
    return normalizeNodeText(children);
  }
  return '';
};

export const financialReportValueToText = (value: React.ReactNode): string => (
  normalizeCanonicalPdfText(normalizeNodeText(value)).replace(/\s+/g, ' ').trim()
);

const normalizeRows = (rows: FinancialReportRow[], columnCount: number): NormalizedFinancialReportRow[] => (
  rows.map((row) => ({
    id: row.id,
    cells: Array.from({ length: columnCount }, (_, index) => (
      financialReportValueToText(row.cells[index]) || '—'
    )),
  }))
);

const getColumnWeight = (column: FinancialReportColumn) => {
  const label = column.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/descricao|contraparte|aluno|movimento|lancamento|fornecedor|credor/.test(label)) return 2.6;
  if (/conta|categoria|curso|turma|classificacao/.test(label)) return 1.55;
  if (/entrada|saida|saldo|previsto|realizado|valor|pagamento|recebido/.test(label)) return 1.25;
  if (/data|vencimento|status|situacao|parcela/.test(label)) return 1.05;
  return 1.35;
};

const getColumnWidths = (columns: FinancialReportColumn[]) => {
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

const getFirstTableY = (
  pdf: jsPDF,
  input: FinancialReportPdfInput,
  contentTop: number,
) => {
  let y = contentTop + 3;
  y += 8 + getSubtitleHeight(pdf, input.subtitle);
  if ((input.filters || []).length > 0) {
    y += Math.ceil((input.filters || []).length / 3) * 14 + 3;
  }
  if ((input.summaryCards || []).length > 0) {
    y += Math.ceil((input.summaryCards || []).length / 4) * 15 + 3;
  }
  return y;
};

/**
 * A tabela só pode receber linhas inteiras: cortar uma célula entre páginas
 * mudaria a leitura/auditoria do lançamento. Quando uma única linha não cabe
 * na menor área útil possível, falhamos antes de desenhar qualquer página.
 */
const assertRowsFitOnPage = (
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

const buildFinancialReportPages = (
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

const drawPageBackground = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: CanonicalPdfImage | null,
  label: string,
  opacity: number,
) => {
  pdf.setFillColor(...COLORS.white);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: true,
    imageUrl: watermark?.dataUrl || null,
    label,
    opacity,
  }, {
    x: 27,
    y: 88,
    width: 156,
    height: 122,
    textSize: 27,
    rotate: -35,
  });
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

const drawFirstPageIntro = (
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

const drawContinuationIntro = (
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

const drawTable = (
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
    drawText(pdf, 'Nenhum registro encontrado.', PAGE_WIDTH / 2, top + TABLE_HEADER_HEIGHT + 9, {
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
      pdf.text(lines, textX, y + 1.8, {
        align,
        baseline: 'top',
        lineHeightFactor: 1.08,
      });
      cellX += width;
    });
    y += rowHeight;
  });
};

const drawFooter = (
  pdf: jsPDF,
  input: FinancialReportPdfInput,
  pageNumber: number,
  pageCount: number,
) => {
  const issuedAt = input.issuedAt || new Date();
  const note = financialReportValueToText(input.footerNote || '')
    || 'Documento emitido pelo Portal de Gestão Universo Cursos e Consultoria.';
  if (note) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(4.85);
    pdf.setTextColor(...COLORS.slate500);
    drawText(pdf, note, CONTENT_LEFT, FOOTER_TOP - 8.2, {
      width: CONTENT_WIDTH,
      maxLines: 2,
      lineHeight: 1.1,
    });
  }
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
  drawText(pdf, `Emitido em ${issuedAt.toLocaleString('pt-BR')}`, PAGE_WIDTH / 2, FOOTER_TOP + 3, {
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

const safeFileName = (value: string) => (
  String(value || 'relatorio-financeiro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'relatorio-financeiro'
);

export const FINANCIAL_REPORT_PDF_PIPELINE = 'native-vector' as const;

export const getFinancialReportPdfFileName = (fileName: string) => `${safeFileName(fileName)}.pdf`;

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
  const institutionSource = mergeInstitution(input.company, input.polo);
  const institution = normalizeCanonicalInstitutionalHeader(institutionSource);
  const polo = asRecord(input.polo);
  const logoUrl = readText(institutionSource, ['logoUrl', 'logo_url']) || null;
  const watermarkUrl = readText(polo, ['watermarkUrl', 'watermark_url']) || null;
  const watermarkOpacity = clamp(readNumber(
    polo,
    ['watermarkOpacity', 'watermark_opacity'],
    0.045,
  ), 0.015, 0.15);
  const [logo, watermark] = await Promise.all([
    loadIsolatedImage(logoUrl),
    loadIsolatedImage(watermarkUrl),
  ]);
  const widths = getColumnWidths(input.columns);
  const rows = normalizeRows(input.rows, input.columns.length);

  // O cabeçalho canônico em retrato, com metadados, termina a 70,5 mm.
  // A mesma geometria é aplicada a todas as páginas pelo compositor comum.
  const contentTop = 70.5;
  const firstTableY = getFirstTableY(pdf, input, contentTop);
  const continuationTableY = contentTop + 14;
  const tableBottom = input.footerNote ? TABLE_BOTTOM_WITH_NOTE : TABLE_BOTTOM_WITHOUT_NOTE;
  assertRowsFitOnPage(
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
  const issuedAt = input.issuedAt || new Date();
  const reportInput = { ...input, issuedAt };
  const meta = {
    eyebrow: 'Financeiro · relatório gerencial',
    title: input.rightTitle || 'Relatório Financeiro',
    label: 'Tipo',
    value: input.rightType || 'Financeiro',
  };

  pdf.setProperties({
    title: input.title,
    subject: 'Relatório financeiro institucional',
    author: institution.name,
    creator: 'Universo Cursos e Consultoria',
    keywords: 'financeiro, relatório, gestão, universidade',
  });

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) pdf.addPage('a4', 'portrait');
    onProgress?.({ current: pageIndex + 1, total: pages.length });
    drawPageBackground(
      pdf,
      GState as unknown as PdfGStateConstructor,
      watermark,
      institution.name || 'UNIVERSO CURSOS E CONSULTORIA',
      watermarkOpacity,
    );
    const header = drawCanonicalInstitutionalHeader(pdf, institution, logo, {
      orientation: 'portrait',
      alias: 'financial-report-institutional-header-logo',
      meta,
    });
    const tableTop = pageIndex === 0
      ? drawFirstPageIntro(pdf, reportInput, header.contentTop)
      : drawContinuationIntro(
        pdf,
        reportInput,
        page.firstRecordIndex + 1,
        page.firstRecordIndex + page.rows.length,
        header.contentTop,
      );
    drawTable(pdf, input.columns, page.rows, widths, tableTop, input.tone);
    drawFooter(pdf, reportInput, pageIndex + 1, pages.length);
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

export const inspectFinancialReportPdfOperatorsForTest = (pdf: jsPDF) => {
  const pages = (pdf as unknown as PdfWithInternals).internal.pages ?? [];
  return pages.slice(1).map((operators) => ({
    hasTextOperator: operators.some((operator) => /\b(?:Tj|TJ)\b/.test(operator)),
    imageDrawCount: operators.filter((operator) => /\/I\w+\s+Do\b/.test(operator)).length,
  }));
};
