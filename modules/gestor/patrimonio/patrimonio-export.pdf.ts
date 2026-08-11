import type { jsPDF } from 'jspdf';

import {
  drawCanonicalInstitutionalHeader,
  normalizeCanonicalInstitutionalHeader,
} from '../secretaria/shared/canonical-institutional-header-pdf';
import {
  getCanonicalPdfInlineImage,
  normalizeCanonicalPdfText,
  truncatePdfText,
  type CanonicalPdfImage,
} from '../secretaria/shared/canonical-document-vector-pdf';
import { getPatrimonioDisplayStatus, type PatrimonioDisplayStatus } from './patrimonio.actions';
import {
  formatPatrimonioCents,
  formatPatrimonioCurrency,
  formatPatrimonioDate,
  formatPatrimonioQuantity,
  parsePatrimonioCurrencyToCents,
} from './patrimonio.formatters';
import type { PatrimonioItem } from './patrimonio.types';

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_LEFT = 20;
const CONTENT_RIGHT = 277;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const FOOTER_TOP = 201;
const FIRST_PAGE_ROW_LIMIT = 10;
const CONTINUATION_PAGE_ROW_LIMIT = 15;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

const COLORS = {
  navy: '#001a33',
  blue: '#2563eb',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate300: '#cbd5e1',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  emerald700: '#047857',
  emerald100: '#d1fae5',
  amber700: '#b45309',
  amber100: '#fef3c7',
  rose700: '#be123c',
  rose100: '#ffe4e6',
  white: '#ffffff',
} as const;

type PdfWithInternals = {
  internal: { pages?: string[][] };
};

type ExportInstitution = object | null | undefined;

export interface PatrimonioExportPdfInput {
  items: PatrimonioItem[];
  company?: ExportInstitution;
  polo?: ExportInstitution;
  issuedAt?: Date;
}

export interface PatrimonioExportPdfProgress {
  current: number;
  total: number;
}

export const PATRIMONIO_EXPORT_PDF_PIPELINE = 'native-vector' as const;

const statusLabels: Record<PatrimonioDisplayStatus, string> = {
  ativo: 'Ativo',
  parcial: 'Baixa parcial',
  baixado: 'Baixado',
  excluido: 'Excluído',
};

const statusColors: Record<PatrimonioDisplayStatus, string> = {
  ativo: COLORS.emerald700,
  parcial: COLORS.amber700,
  baixado: COLORS.rose700,
  excluido: COLORS.slate500,
};

const asRecord = (value: ExportInstitution): Record<string, unknown> => (
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
);

const asText = (value: unknown) => String(value ?? '').trim();

const readText = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = asText(source[key]);
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

const readBoolean = (source: Record<string, unknown>, keys: string[], fallback: boolean) => {
  for (const key of keys) {
    if (typeof source[key] === 'boolean') return source[key] as boolean;
  }
  return fallback;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

/**
 * Converte somente ativos de marca isolados em data URL. Nunca transforma a
 * página em canvas: tabelas, textos, linhas e cartões permanecem vetoriais.
 */
const loadInlineImage = async (source: string | null | undefined) => {
  const direct = getCanonicalPdfInlineImage(source);
  if (direct) return direct;

  const url = String(source || '').trim();
  if (!url || (!/^https?:\/\//i.test(url) && !url.startsWith('/'))) return null;

  try {
    const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size > MAX_IMAGE_BYTES) return null;
    return getCanonicalPdfInlineImage(`data:${blob.type};base64,${toBase64(await blob.arrayBuffer())}`);
  } catch {
    return null;
  }
};

const getLandscapeWatermarkSettings = (polo: Record<string, unknown>) => ({
  url: readText(polo, ['landscapeWatermarkUrl', 'landscape_watermark_url']) || null,
  opacity: clamp(readNumber(
    polo,
    ['landscapeWatermarkOpacity', 'landscape_watermark_opacity'],
    0.1,
  ), 0, 1),
  scale: clamp(readNumber(
    polo,
    ['landscapeWatermarkScale', 'landscape_watermark_scale'],
    50,
  ), 10, 100),
  rotate: readBoolean(
    polo,
    ['landscapeWatermarkRotate', 'landscape_watermark_rotate'],
    true,
  ),
});

const mergeInstitution = (company: ExportInstitution, polo: ExportInstitution) => {
  const mergeDefined = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    Object.entries(source).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') target[key] = value;
    });
  };
  const institution: Record<string, unknown> = {};
  mergeDefined(institution, asRecord(company));
  mergeDefined(institution, asRecord(polo));
  return institution;
};

const sumCents = (items: PatrimonioItem[], field: 'valorTotalOriginal' | 'valorDisponivel') => (
  items.reduce((total, item) => total + (parsePatrimonioCurrencyToCents(item[field]) ?? 0n), 0n)
);

const getTotals = (items: PatrimonioItem[]) => ({
  availableQuantity: items.reduce(
    (total, item) => total + (item.status === 'excluido' ? 0 : item.quantidadeDisponivel),
    0,
  ),
  writtenOffItems: items.filter(
    (item) => item.status === 'baixado' || item.quantidadeBaixada > 0,
  ).length,
  originalValue: sumCents(items, 'valorTotalOriginal'),
  availableValue: sumCents(items, 'valorDisponivel'),
});

export const buildPatrimonioExportPages = (items: PatrimonioItem[]) => {
  if (items.length === 0) return [[]] as PatrimonioItem[][];

  const pages = [items.slice(0, FIRST_PAGE_ROW_LIMIT)];
  for (
    let index = FIRST_PAGE_ROW_LIMIT;
    index < items.length;
    index += CONTINUATION_PAGE_ROW_LIMIT
  ) {
    pages.push(items.slice(index, index + CONTINUATION_PAGE_ROW_LIMIT));
  }
  return pages;
};

const drawSingleLine = (
  pdf: jsPDF,
  value: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number,
  options: {
    align?: 'left' | 'center' | 'right';
    fallback?: string;
  } = {},
) => {
  const normalized = normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim()
    || options.fallback
    || '';
  if (!normalized) return '';
  const [line = ''] = truncatePdfText(pdf, normalized, Math.max(1, maxWidth), 1);
  pdf.text(line, x, y, {
    align: options.align ?? 'left',
    baseline: 'top',
  });
  return line;
};

const drawPageBackground = (
  pdf: jsPDF,
  watermark: CanonicalPdfImage | null,
  settings: ReturnType<typeof getLandscapeWatermarkSettings>,
) => {
  pdf.setFillColor(COLORS.white);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');

  if (!watermark) {
    pdf.saveGraphicsState();
    pdf.setGState(pdf.GState({ opacity: 0.035 }));
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(34);
    pdf.setTextColor(COLORS.navy);
    pdf.text('UNIVERSO', PAGE_WIDTH / 2, PAGE_HEIGHT / 2 - 4, {
      align: 'center',
      baseline: 'middle',
      angle: 45,
    });
    pdf.setFontSize(11);
    pdf.text('CURSOS E CONSULTORIA', PAGE_WIDTH / 2, PAGE_HEIGHT / 2 + 10, {
      align: 'center',
      baseline: 'middle',
      angle: 45,
    });
    pdf.restoreGraphicsState();
    return;
  }

  const properties = pdf.getImageProperties(watermark.dataUrl);
  const boxWidth = PAGE_WIDTH * (settings.scale / 100);
  const ratio = Math.min(boxWidth / properties.width, PAGE_HEIGHT / properties.height);
  const imageWidth = properties.width * ratio;
  const imageHeight = properties.height * ratio;
  const rotation = settings.rotate ? 45 : 0;
  let imageX = (PAGE_WIDTH - imageWidth) / 2;
  let imageY = (PAGE_HEIGHT - imageHeight) / 2;

  if (rotation) {
    const radians = rotation * (Math.PI / 180);
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    imageX = (PAGE_WIDTH / 2) - ((cosine * imageWidth / 2) - (sine * imageHeight / 2));
    const translatedPdfY = (PAGE_HEIGHT / 2) - ((sine * imageWidth / 2) + (cosine * imageHeight / 2));
    imageY = PAGE_HEIGHT - imageHeight - translatedPdfY;
  }

  pdf.saveGraphicsState();
  pdf.setGState(pdf.GState({ opacity: settings.opacity }));
  pdf.addImage(
    watermark.dataUrl,
    watermark.format,
    imageX,
    imageY,
    imageWidth,
    imageHeight,
    'patrimonio-landscape-watermark',
    'FAST',
    rotation,
  );
  pdf.restoreGraphicsState();
};

const drawSummaryCard = (
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  tone: 'navy' | 'emerald',
) => {
  const valueColor = tone === 'emerald' ? COLORS.emerald700 : COLORS.navy;
  const border = tone === 'emerald' ? COLORS.emerald100 : COLORS.slate200;
  pdf.setFillColor(COLORS.white);
  pdf.setDrawColor(border);
  pdf.setLineWidth(0.22);
  pdf.roundedRect(x, y, width, 15, 2, 2, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.slate400);
  pdf.setFontSize(5.1);
  drawSingleLine(pdf, label.toUpperCase(), x + 2.5, y + 2.6, width - 5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(valueColor);
  pdf.setFontSize(9.8);
  drawSingleLine(pdf, value, x + 2.5, y + 7.1, width - 5);
};

const TABLE_COLUMNS = [
  { label: 'Patrimônio', width: 67, align: 'left' },
  { label: 'Situação', width: 28, align: 'left' },
  { label: 'Aquisição', width: 27, align: 'left' },
  { label: 'Disponível', width: 21, align: 'right' },
  { label: 'Valor unitário', width: 35, align: 'right' },
  { label: 'Valor disponível', width: 39, align: 'right' },
  { label: 'Nº de série', width: 40, align: 'left' },
] as const;

const drawTable = (
  pdf: jsPDF,
  items: PatrimonioItem[],
  y: number,
  rowHeight: number,
) => {
  let x = CONTENT_LEFT;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.slate600);
  pdf.setFontSize(5.45);
  TABLE_COLUMNS.forEach((column) => {
    const textX = column.align === 'right' ? x + column.width - 1.6 : x + 1.2;
    drawSingleLine(pdf, column.label.toUpperCase(), textX, y, column.width - 2.4, {
      align: column.align,
    });
    x += column.width;
  });

  pdf.setDrawColor(COLORS.slate300);
  pdf.setLineWidth(0.45);
  pdf.line(CONTENT_LEFT, y + 6, CONTENT_RIGHT, y + 6);

  if (items.length === 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.slate400);
    pdf.setFontSize(7.5);
    pdf.text('Nenhum patrimônio foi encontrado para este polo.', PAGE_WIDTH / 2, y + 25, {
      align: 'center',
      baseline: 'top',
    });
    return;
  }

  items.forEach((item, index) => {
    const rowY = y + 6 + (index * rowHeight);
    const displayStatus = getPatrimonioDisplayStatus(item);
    const availableQuantity = item.status === 'excluido' ? 0 : item.quantidadeDisponivel;
    let columnX = CONTENT_LEFT;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.slate700);
    pdf.setFontSize(6.25);
    drawSingleLine(pdf, item.descricao, columnX + 1.2, rowY + 1.25, 65, {
      fallback: 'Patrimônio sem descrição',
    });
    pdf.setTextColor(COLORS.blue);
    pdf.setFontSize(4.7);
    drawSingleLine(pdf, item.tipoProduto, columnX + 1.2, rowY + 4.55, 65, {
      fallback: 'Sem tipo',
    });
    columnX += TABLE_COLUMNS[0].width;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(statusColors[displayStatus]);
    pdf.setFontSize(5.7);
    drawSingleLine(pdf, statusLabels[displayStatus], columnX + 1.2, rowY + 2.55, 25);
    columnX += TABLE_COLUMNS[1].width;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.slate600);
    pdf.setFontSize(5.7);
    drawSingleLine(pdf, formatPatrimonioDate(item.dataAquisicao), columnX + 1.2, rowY + 2.55, 24);
    columnX += TABLE_COLUMNS[2].width;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.slate700);
    pdf.setFontSize(5.7);
    drawSingleLine(
      pdf,
      formatPatrimonioQuantity(availableQuantity),
      columnX + TABLE_COLUMNS[3].width - 1.2,
      rowY + 2.55,
      TABLE_COLUMNS[3].width - 2.4,
      { align: 'right' },
    );
    columnX += TABLE_COLUMNS[3].width;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.slate600);
    pdf.setFontSize(5.7);
    drawSingleLine(
      pdf,
      formatPatrimonioCurrency(item.valorUnitario),
      columnX + TABLE_COLUMNS[4].width - 1.2,
      rowY + 2.55,
      TABLE_COLUMNS[4].width - 2.4,
      { align: 'right' },
    );
    columnX += TABLE_COLUMNS[4].width;

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(COLORS.emerald700);
    pdf.setFontSize(5.7);
    drawSingleLine(
      pdf,
      formatPatrimonioCurrency(item.valorDisponivel),
      columnX + TABLE_COLUMNS[5].width - 1.2,
      rowY + 2.55,
      TABLE_COLUMNS[5].width - 2.4,
      { align: 'right' },
    );
    columnX += TABLE_COLUMNS[5].width;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(COLORS.slate600);
    pdf.setFontSize(5.45);
    drawSingleLine(pdf, item.numeroSerie, columnX + 1.2, rowY + 2.55, TABLE_COLUMNS[6].width - 2.4, {
      fallback: '—',
    });

    pdf.setDrawColor(COLORS.slate100);
    pdf.setLineWidth(0.18);
    pdf.line(CONTENT_LEFT, rowY + rowHeight, CONTENT_RIGHT, rowY + rowHeight);
  });
};

const drawFooter = (pdf: jsPDF, itemCount: number, pageNumber: number, pageCount: number) => {
  pdf.setDrawColor(COLORS.slate200);
  pdf.setLineWidth(0.25);
  pdf.line(CONTENT_LEFT, FOOTER_TOP, CONTENT_RIGHT, FOOTER_TOP);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.slate500);
  pdf.setFontSize(5.45);
  drawSingleLine(pdf, 'CONFIDENCIAL · USO INTERNO', CONTENT_LEFT, FOOTER_TOP + 3.5, 72);
  drawSingleLine(
    pdf,
    `PATRIMÔNIOS LISTADOS: ${formatPatrimonioQuantity(itemCount)}`,
    PAGE_WIDTH / 2,
    FOOTER_TOP + 3.5,
    84,
    { align: 'center' },
  );
  drawSingleLine(
    pdf,
    `PÁGINA ${pageNumber} DE ${pageCount}`,
    CONTENT_RIGHT,
    FOOTER_TOP + 3.5,
    55,
    { align: 'right' },
  );
};

const drawFirstPage = (
  pdf: jsPDF,
  pageItems: PatrimonioItem[],
  allItems: PatrimonioItem[],
  contentTop: number,
) => {
  const totals = getTotals(allItems);
  const gap = 3;
  const cardWidth = (CONTENT_WIDTH - (gap * 3)) / 4;
  const summaryY = contentTop + 2;
  drawSummaryCard(pdf, CONTENT_LEFT, summaryY, cardWidth, 'Registros', formatPatrimonioQuantity(allItems.length), 'navy');
  drawSummaryCard(pdf, CONTENT_LEFT + cardWidth + gap, summaryY, cardWidth, 'Unidades disponíveis', formatPatrimonioQuantity(totals.availableQuantity), 'emerald');
  drawSummaryCard(pdf, CONTENT_LEFT + ((cardWidth + gap) * 2), summaryY, cardWidth, 'Valor original', formatPatrimonioCents(totals.originalValue), 'navy');
  drawSummaryCard(pdf, CONTENT_LEFT + ((cardWidth + gap) * 3), summaryY, cardWidth, 'Valor disponível', formatPatrimonioCents(totals.availableValue), 'emerald');
  drawTable(pdf, pageItems, contentTop + 21, 8);
};

const drawContinuationPage = (
  pdf: jsPDF,
  pageItems: PatrimonioItem[],
  allItems: PatrimonioItem[],
  contentTop: number,
) => {
  const totals = getTotals(allItems);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(COLORS.navy);
  pdf.setFontSize(6.4);
  drawSingleLine(pdf, 'RELAÇÃO DE BENS · CONTINUAÇÃO', CONTENT_LEFT, contentTop + 1.5, 120);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(COLORS.slate500);
  pdf.setFontSize(5.5);
  drawSingleLine(
    pdf,
    `${formatPatrimonioQuantity(allItems.length)} registro(s) · ${formatPatrimonioQuantity(totals.writtenOffItems)} com baixa`,
    CONTENT_RIGHT,
    contentTop + 1.5,
    90,
    { align: 'right' },
  );
  pdf.setDrawColor(COLORS.slate200);
  pdf.setLineWidth(0.22);
  pdf.line(CONTENT_LEFT, contentTop + 7.5, CONTENT_RIGHT, contentTop + 7.5);
  drawTable(pdf, pageItems, contentTop + 11, 7.2);
};

const formatIssuedAt = (date: Date) => date.toLocaleDateString('pt-BR');

const formatFileDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPatrimonioExportPdfFileName = (date = new Date()) => (
  `relatorio-completo-patrimonio-${formatFileDate(date)}.pdf`
);

export const createPatrimonioExportPdfDocument = async (
  input: PatrimonioExportPdfInput,
  onProgress?: (progress: PatrimonioExportPdfProgress) => void,
) => {
  const { jsPDF: JsPdf } = await import('jspdf');
  const pdf = new JsPdf({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: false,
  });
  const issuedAt = input.issuedAt || new Date();
  const polo = asRecord(input.polo);
  const company = asRecord(input.company);
  const landscapeWatermark = getLandscapeWatermarkSettings(polo);
  const logoUrl = readText(polo, ['logoUrl', 'logo_url'])
    || readText(company, ['logoUrl', 'logo_url'])
    || null;
  const [logo, watermark] = await Promise.all([
    loadInlineImage(logoUrl).then(async (image) => (
      image || (typeof window !== 'undefined' ? loadInlineImage('/LogoUniverso.png') : null)
    )),
    loadInlineImage(landscapeWatermark.url),
  ]);
  const institution = normalizeCanonicalInstitutionalHeader(
    mergeInstitution(input.company, input.polo),
  );
  const pages = buildPatrimonioExportPages(input.items);
  const meta = {
    eyebrow: 'Gestão patrimonial · uso interno',
    title: 'Relatório completo do patrimônio',
    label: 'Data de emissão',
    value: formatIssuedAt(issuedAt),
  };

  pdf.setProperties({
    title: 'Relatório completo do patrimônio',
    subject: 'Relação patrimonial por polo',
    author: institution.name,
    creator: 'Universo Cursos e Consultoria',
    keywords: 'patrimônio, inventário, relatório, polo',
  });

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage('a4', 'landscape');
    onProgress?.({ current: pageIndex + 1, total: pages.length });
    if (pageIndex > 0 && pageIndex % 4 === 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }
    drawPageBackground(pdf, watermark, landscapeWatermark);
    const header = drawCanonicalInstitutionalHeader(pdf, institution, logo, {
      orientation: 'landscape',
      alias: 'patrimonio-institutional-header-logo',
      meta,
    });
    if (pageIndex === 0) drawFirstPage(pdf, pages[pageIndex], input.items, header.contentTop);
    else drawContinuationPage(pdf, pages[pageIndex], input.items, header.contentTop);
    drawFooter(pdf, input.items.length, pageIndex + 1, pages.length);
  }

  return pdf;
};

export const buildPatrimonioExportPdf = async (
  input: PatrimonioExportPdfInput,
  onProgress?: (progress: PatrimonioExportPdfProgress) => void,
) => {
  const pdf = await createPatrimonioExportPdfDocument(input, onProgress);
  return pdf.output('blob');
};

export const inspectPatrimonioExportPdfOperatorsForTest = (pdf: jsPDF) => {
  const pages = (pdf as unknown as PdfWithInternals).internal.pages ?? [];
  return pages.slice(1).map((operators) => ({
    hasTextOperator: operators.some((operator) => /\b(?:Tj|TJ)\b/.test(operator)),
    imageDrawCount: operators.filter((operator) => /\/I\w+\s+Do\b/.test(operator)).length,
  }));
};
