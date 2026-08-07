import type { jsPDF } from 'jspdf';

import {
  createDocumentValidationQrDataUrl,
} from '../../../shared/document-validation/document-validation.qr';

export type CanonicalPdfImageFormat = 'PNG' | 'JPEG' | 'WEBP';

export interface CanonicalPdfImage {
  dataUrl: string;
  format: CanonicalPdfImageFormat;
}

export interface CanonicalPdfWatermark {
  enabled: boolean;
  imageUrl: string | null;
  label: string | null;
  opacity: number | null;
}

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_INLINE_IMAGE_BYTES = 16 * 1024 * 1024;

/**
 * A composição nativa usa somente imagens isoladas. Nunca recebe um canvas da
 * página inteira: textos, linhas, fundos e tabelas continuam sendo objetos
 * vetoriais/selecionáveis do PDF.
 */
export const getCanonicalPdfInlineImage = (value: string | null | undefined): CanonicalPdfImage | null => {
  const source = String(value || '').trim();
  const match = DATA_IMAGE_PATTERN.exec(source);
  if (!match || source.length > MAX_INLINE_IMAGE_BYTES) return null;

  const type = match[1].toLowerCase();
  return {
    dataUrl: source,
    format: type === 'png' ? 'PNG' : type === 'webp' ? 'WEBP' : 'JPEG',
  };
};

export const normalizeCanonicalPdfText = (value: string | null | undefined) => String(value || '')
  // Versões iniciais do contrato persistiram quebras como os caracteres "\\n".
  // O PDF recebe linhas reais mesmo ao reabrir um snapshot histórico.
  .replace(/\\r\\n/g, '\n')
  .replace(/\\n/g, '\n')
  .replace(/\u00a0/g, ' ')
  .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/\u2022/g, '·');

export const truncatePdfText = (
  pdf: jsPDF,
  value: string,
  maxWidth: number,
  maxLines = 1,
) => {
  const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(value), maxWidth) as string[];
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  const index = visible.length - 1;
  let last = visible[index].replace(/[\s·.,;:!?-]+$/u, '');
  while (last && pdf.getTextWidth(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  visible[index] = `${last}…`;
  return visible;
};

export const drawCanonicalPdfText = (
  pdf: jsPDF,
  value: string | null | undefined,
  x: number,
  y: number,
  options: {
    align?: 'left' | 'center' | 'right';
    maxWidth?: number;
    maxLines?: number;
    lineHeight?: number;
  } = {},
) => {
  const text = normalizeCanonicalPdfText(value);
  if (!text) return 0;
  const lines = options.maxWidth
    ? truncatePdfText(pdf, text, options.maxWidth, options.maxLines ?? Number.MAX_SAFE_INTEGER)
    : [text];
  pdf.text(lines, x, y, {
    align: options.align ?? 'left',
    baseline: 'top',
    lineHeightFactor: options.lineHeight ?? 1.2,
  });
  return lines.length;
};

const clampOpacity = (value: number | null | undefined, fallback = 0.08) => {
  const opacity = Number(value);
  return Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : fallback;
};

export const drawCanonicalPdfWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: CanonicalPdfWatermark,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    textSize: number;
    rotate?: number;
  },
) => {
  if (!watermark.enabled) return;

  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity: clampOpacity(watermark.opacity) }) as never);
  const image = getCanonicalPdfInlineImage(watermark.imageUrl);
  if (image) {
    const properties = pdf.getImageProperties(image.dataUrl);
    const scale = Math.min(options.width / properties.width, options.height / properties.height);
    const width = properties.width * scale;
    const height = properties.height * scale;
    pdf.addImage(
      image.dataUrl,
      image.format,
      options.x + (options.width - width) / 2,
      options.y + (options.height - height) / 2,
      width,
      height,
      undefined,
      'FAST',
    );
  } else {
    const label = normalizeCanonicalPdfText(watermark.label) || 'UNIVERSO';
    pdf.setTextColor(0, 26, 51);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(options.textSize);
    pdf.text(label.toUpperCase(), options.x + options.width / 2, options.y + options.height / 2, {
      align: 'center',
      baseline: 'middle',
      angle: options.rotate ?? 35,
    });
  }
  pdf.restoreGraphicsState();
};

/** QR é o único raster dinâmico: um ativo pequeno, isolado e de alta resolução. */
export const createCanonicalPdfQr = async (code: string | null | undefined) => {
  const normalized = String(code || '').trim();
  if (!normalized) return null;
  const dataUrl = await createDocumentValidationQrDataUrl(normalized, {
    size: 640,
    margin: 1,
    errorCorrectionLevel: 'H',
  });
  return getCanonicalPdfInlineImage(dataUrl);
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Não foi possível preparar a imagem do documento.'));
  reader.readAsDataURL(blob);
});

/**
 * Fotos podem ser incorporadas como ativo separado quando o servidor entrega
 * uma URL CORS acessível. Uma falha de foto não invalida a credencial.
 */
export const resolveCanonicalPdfPhoto = async (source: string | null | undefined) => {
  const inline = getCanonicalPdfInlineImage(source);
  if (inline) return inline;
  const url = String(source || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size > MAX_INLINE_IMAGE_BYTES) return null;
    return getCanonicalPdfInlineImage(await blobToDataUrl(blob));
  } catch {
    return null;
  }
};

export const runWithConcurrency = async <Input, Output>(
  values: readonly Input[],
  limit: number,
  task: (value: Input, index: number) => Promise<Output>,
) => {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker));
  return results;
};
