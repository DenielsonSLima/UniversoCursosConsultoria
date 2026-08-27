import type { jsPDF } from 'jspdf';
import {
  formatCaixaCurrency,
} from '../caixa.formatters';
import type {
  CaixaDetailedReport,
  CaixaReportExpense,
  CaixaReportReceipt,
} from './caixa-report.types';

export const PAGE_WIDTH = 297;
export const PAGE_HEIGHT = 210;
export const CONTENT_LEFT = 15;
export const CONTENT_RIGHT = 289;
export const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
export const FOOTER_TOP = 201;
export const FONT_NAME = 'InterUniverso';
export type FontStyle = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';

export const COLORS = {
  navy: '#001a33',
  blue: '#2563eb',
  slate900: '#0f172a',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  emerald700: '#047857',
  emerald100: '#d1fae5',
  emerald50: '#ecfdf5',
  rose700: '#be123c',
  rose100: '#ffe4e6',
  rose50: '#fff1f2',
  amber700: '#b45309',
  amber100: '#fef3c7',
  amber50: '#fffbeb',
  white: '#ffffff',
} as const;

export type Tone = 'neutral' | 'emerald' | 'rose' | 'amber';
export type PdfWithInternals = {
  internal: { pages?: string[][] };
};

export const CAIXA_REPORT_PDF_PIPELINE = 'native-vector' as const;

export const getCaixaResultLabel = (
  status: CaixaDetailedReport['resumo']['resumoCompetencia']['resultadoStatus'],
) => status === 'NEGATIVO'
  ? 'Déficit do mês'
  : status === 'POSITIVO'
    ? 'Superávit do mês'
    : 'Resultado do mês';

export const buildCaixaAdjustmentLines = (row: CaixaReportReceipt | CaixaReportExpense) => [
  `Juros: ${row.juros === null ? 'Não discriminado' : formatCaixaCurrency(row.juros)}`,
  `Multa: ${row.multa === null ? 'Não discriminado' : formatCaixaCurrency(row.multa)}`,
  `Acrésc.: ${row.acrescimo === null ? 'Não discriminado' : formatCaixaCurrency(row.acrescimo)}`,
  `Desconto: ${row.desconto === null ? 'Não discriminado' : formatCaixaCurrency(row.desconto)}`,
  ...(row.diferencaNaoDiscriminada !== 0
    ? [`Não discrim.: ${formatCaixaCurrency(row.diferencaNaoDiscriminada)}`]
    : []),
];

export const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

export const fetchAsDataUrl = async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    if (url.length > 20 * 1024 * 1024) throw new Error('A arte configurada para o PDF excede o limite permitido.');
    return url;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`A imagem obrigatória do PDF não pôde ser carregada (${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('A arte configurada para o PDF não é uma imagem válida.');
  if (blob.size > 15 * 1024 * 1024) throw new Error('A arte configurada para o PDF excede o limite de 15 MB.');
  return `data:${blob.type || 'image/png'};base64,${toBase64(await blob.arrayBuffer())}`;
};

export const fetchLogoDataUrl = async (url: string | null) => {
  if (url) {
    try {
      return await fetchAsDataUrl(url);
    } catch (error) {
      console.warn('[Caixa PDF] Logo institucional indisponível; usando a marca oficial local.', error);
    }
  }
  return typeof window === 'undefined' ? null : fetchAsDataUrl('/LogoUniverso.png');
};

export const registerInterFont = async (
  pdf: jsPDF,
  suppliedFonts?: {
    regular?: ArrayBuffer;
    medium?: ArrayBuffer;
    semiBold?: ArrayBuffer;
    bold?: ArrayBuffer;
    extraBold?: ArrayBuffer;
    black?: ArrayBuffer;
  },
) => {
  let regularBuffer = suppliedFonts?.regular;
  let mediumBuffer = suppliedFonts?.medium;
  let semiBoldBuffer = suppliedFonts?.semiBold;
  let boldBuffer = suppliedFonts?.bold;
  let extraBoldBuffer = suppliedFonts?.extraBold;
  let blackBuffer = suppliedFonts?.black;
  if (!regularBuffer || !mediumBuffer || !semiBoldBuffer || !boldBuffer || !extraBoldBuffer || !blackBuffer) {
    const [regularResponse, mediumResponse, semiBoldResponse, boldResponse, extraBoldResponse, blackResponse] = await Promise.all([
      fetch('/fonts/Inter-Regular.ttf'),
      fetch('/fonts/Inter-Medium.ttf'),
      fetch('/fonts/Inter-SemiBold.ttf'),
      fetch('/fonts/Inter-Bold.ttf'),
      fetch('/fonts/Inter-ExtraBold.ttf'),
      fetch('/fonts/Inter-Black.ttf'),
    ]);
    if (!regularResponse.ok || !mediumResponse.ok || !semiBoldResponse.ok || !boldResponse.ok || !extraBoldResponse.ok || !blackResponse.ok) {
      throw new Error('A fonte Inter do relatório não pôde ser carregada.');
    }
    [regularBuffer, mediumBuffer, semiBoldBuffer, boldBuffer, extraBoldBuffer, blackBuffer] = await Promise.all([
      regularResponse.arrayBuffer(),
      mediumResponse.arrayBuffer(),
      semiBoldResponse.arrayBuffer(),
      boldResponse.arrayBuffer(),
      extraBoldResponse.arrayBuffer(),
      blackResponse.arrayBuffer(),
    ]);
  }
  pdf.addFileToVFS('Inter-Regular.ttf', toBase64(regularBuffer));
  pdf.addFileToVFS('Inter-Medium.ttf', toBase64(mediumBuffer));
  pdf.addFileToVFS('Inter-SemiBold.ttf', toBase64(semiBoldBuffer));
  pdf.addFileToVFS('Inter-Bold.ttf', toBase64(boldBuffer));
  pdf.addFileToVFS('Inter-ExtraBold.ttf', toBase64(extraBoldBuffer));
  pdf.addFileToVFS('Inter-Black.ttf', toBase64(blackBuffer));
  pdf.addFont('Inter-Regular.ttf', FONT_NAME, 'normal');
  pdf.addFont('Inter-Medium.ttf', FONT_NAME, 'medium');
  pdf.addFont('Inter-SemiBold.ttf', FONT_NAME, 'semibold');
  pdf.addFont('Inter-Bold.ttf', FONT_NAME, 'bold');
  pdf.addFont('Inter-ExtraBold.ttf', FONT_NAME, 'extrabold');
  pdf.addFont('Inter-Black.ttf', FONT_NAME, 'black');
  pdf.setFont(FONT_NAME, 'normal');
};

export const setText = (
  pdf: jsPDF,
  color: string,
  size: number,
  style: FontStyle = 'normal',
) => {
  pdf.setTextColor(color);
  pdf.setFont(FONT_NAME, style);
  pdf.setFontSize(size);
};

export const fitText = (pdf: jsPDF, value: string, width: number, maxLines = 2) => {
  const wrapped = pdf.splitTextToSize(value || '-', width) as string[];
  if (wrapped.length <= maxLines) return wrapped;
  const visible = wrapped.slice(0, maxLines);
  const lastIndex = visible.length - 1;
  let lastLine = visible[lastIndex].replace(/[\s·.,;:!?-]+$/u, '');
  while (lastLine && pdf.getTextWidth(`${lastLine}…`) > width) {
    lastLine = lastLine.slice(0, -1).trimEnd();
  }
  visible[lastIndex] = `${lastLine}…`;
  return visible;
};

export const drawText = (
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  width?: number,
  options?: {
    align?: 'left' | 'center' | 'right';
    maxLines?: number;
    lineHeight?: number;
    charSpace?: number;
  },
) => {
  const lines = width ? fitText(pdf, value, width, options?.maxLines ?? 2) : [value];
  pdf.text(lines, x, y, {
    align: options?.align ?? 'left',
    baseline: 'top',
    lineHeightFactor: options?.lineHeight ?? 1.15,
    charSpace: options?.charSpace,
  });
  return lines.length;
};

export const drawPageBackground = (
  pdf: jsPDF,
  report: CaixaDetailedReport,
  background: string | null,
  usesFallbackArtwork: boolean,
) => {
  pdf.setFillColor(COLORS.white);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
  if (background) {
    const properties = pdf.getImageProperties(background);
    const configuredScale = Math.min(100, Math.max(
      10,
      usesFallbackArtwork ? 55 : report.institucional.landscape_watermark_scale,
    ));
    const boxWidth = PAGE_WIDTH * (configuredScale / 100);
    const boxHeight = PAGE_HEIGHT;
    const ratio = Math.min(boxWidth / properties.width, boxHeight / properties.height);
    const imageWidth = properties.width * ratio;
    const imageHeight = properties.height * ratio;
    const shouldRotate = usesFallbackArtwork || report.institucional.landscape_watermark_rotate;
    const rotation = shouldRotate ? 45 : 0;
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
    const opacity = Math.min(1, Math.max(
      0,
      usesFallbackArtwork ? 0.04 : report.institucional.landscape_watermark_opacity,
    ));
    pdf.saveGraphicsState();
    pdf.setGState(pdf.GState({ opacity }));
    pdf.addImage(
      background,
      properties.fileType || 'PNG',
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      'landscape-watermark',
      'FAST',
      rotation,
    );
    pdf.restoreGraphicsState();
  }
};

export const drawFooter = (pdf: jsPDF, report: CaixaDetailedReport, pageNumber: number, pageCount: number) => {
  pdf.setDrawColor(COLORS.slate100);
  pdf.setLineWidth(0.25);
  pdf.line(CONTENT_LEFT, FOOTER_TOP, CONTENT_RIGHT, FOOTER_TOP);
  setText(pdf, COLORS.slate500, 5.8, 'bold');
  drawText(pdf, 'CONFIDENCIAL · USO INTERNO', CONTENT_LEFT, 204);
  drawText(
    pdf,
    `EMITIDO EM ${new Date(report.geradoEm).toLocaleString('pt-BR')}`,
    PAGE_WIDTH / 2,
    204,
    undefined,
    { align: 'center' },
  );
  drawText(pdf, `PÁGINA ${pageNumber} DE ${pageCount}`, CONTENT_RIGHT, 204, undefined, { align: 'right' });
};

export const drawCard = (
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  description: string,
  tone: Tone,
) => {
  const palette = {
    neutral: [COLORS.slate100, COLORS.slate200, COLORS.slate900],
    emerald: [COLORS.emerald50, COLORS.emerald100, COLORS.emerald700],
    rose: [COLORS.rose50, COLORS.rose100, COLORS.rose700],
    amber: [COLORS.amber50, COLORS.amber100, COLORS.amber700],
  }[tone];
  pdf.setFillColor(palette[0]);
  pdf.setDrawColor(palette[1]);
  pdf.roundedRect(x, y, width, height, 2.2, 2.2, 'FD');
  setText(pdf, COLORS.slate600, 5.2, 'black');
  drawText(pdf, label.toUpperCase(), x + 2.0, y + 1.8, width - 4.0, { maxLines: 1 });
  setText(pdf, palette[2], 9.8, 'black');
  drawText(pdf, value, x + 2.0, y + 4.9, width - 4.0, { maxLines: 1 });
  setText(pdf, COLORS.slate500, 4.8);
  drawText(pdf, description, x + 2.0, y + 9.2, width - 4.0, { maxLines: 1 });
};
