import { type jsPDF } from 'jspdf';
import { normalizeCanonicalPdfText, type CanonicalPdfImage } from '../shared/canonical-document-vector-pdf';
import { type CanonicalInstitutionalHeader } from '../shared/canonical-institutional-header-pdf';
import { type EmissionLog, type PreviewResources } from './historico-emissoes.types';

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const TEMPLATE_WIDTH_PX = 794;
export const TEMPLATE_HEIGHT_PX = 1123;
export const PAGE_LEFT_MM = 20;
export const PAGE_RIGHT_MM = 20;
export const PAGE_BOTTOM_MM = 18;
export const BODY_TOP_MM = 87;
export const CONTINUATION_BODY_TOP_MM = 66;
export const BODY_FONT_SIZE = 10.5;
export const BODY_LINE_HEIGHT = 1.55;
export const DEFAULT_WATERMARK_SCALE = 50;

export type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;
export type TemplateField = Record<string, any>;

export interface VectorPage {
  bodyTemplate: string;
  body: string;
  fields: TemplateField[];
}

export interface VectorDocument {
  source: EmissionPdfSource;
  pages: VectorPage[];
  institutionName: string;
  institutionHeader: CanonicalInstitutionalHeader;
  title: string;
  logo: CanonicalPdfImage | null;
  watermark: CanonicalPdfImage | null;
  watermarkConfig: Record<string, unknown>;
  qr: CanonicalPdfImage | null;
  fieldImages: Map<string, CanonicalPdfImage | null>;
}

export interface EmissionPdfSource {
  emission: EmissionLog;
  preview: PreviewResources;
}

export const getRegistrationWatermarkGeometry = (rawScale: unknown) => {
  const parsed = Number(rawScale);
  const scale = Number.isFinite(parsed)
    ? Math.min(100, Math.max(5, parsed))
    : DEFAULT_WATERMARK_SCALE;
  const width = PAGE_WIDTH_MM * scale / 100;
  const height = PAGE_HEIGHT_MM * scale / 100;
  return {
    scale,
    x: (PAGE_WIDTH_MM - width) / 2,
    y: (PAGE_HEIGHT_MM - height) / 2,
    width,
    height,
    textSize: 30 * scale / DEFAULT_WATERMARK_SCALE,
  };
};

export const decodeHtmlEntities = (value: string) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));

/**
 * Converte somente a apresentação já resolvida do snapshot em texto PDF.
 * Não mede nem divide conteúdo em páginas: quebras e geometria continuam
 * vindo exclusivamente de `pageCount`, `data-page-break` e `absoluteFields`.
 */
export const emissionHtmlToVectorText = (html: string) => {
  const text = String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '· ')
    .replace(/<\/strong\s*>/gi, ': ')
    .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<\/(?:td|th)\s*>/gi, '  ')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const splitExplicitTemplatePages = (html: string) => String(html || '')
  .split(/<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/gi);

export const assertNoResidualTemplateTokens = (value: string, context: string) => {
  const residual = value.match(/{{[^{}]+}}/g);
  if (residual?.length) {
    throw new Error(
      `${context} ainda contém variável não resolvida (${residual[0]}). `
      + 'A emissão foi bloqueada para não produzir um documento incompleto.',
    );
  }
};

export const escapeTemplateValue = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const formatSnapshotDate = (value: unknown) => {
  const raw = String(value || '').split('T')[0];
  const parts = raw.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw || '—';
};

export const formatSnapshotCpf = (value: unknown) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  return digits.length === 11
    ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    : raw;
};

export const pxToMmX = (value: unknown) => Number(value || 0) * PAGE_WIDTH_MM / TEMPLATE_WIDTH_PX;
export const pxToMmY = (value: unknown) => Number(value || 0) * PAGE_HEIGHT_MM / TEMPLATE_HEIGHT_PX;

export const assertTextFits = (
  pdf: jsPDF,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  lineHeight: number,
  context: string,
) => {
  const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(text), width) as string[];
  const requiredHeight = lines.length * fontSize * 0.352778 * lineHeight;
  if (requiredHeight > height + 0.5) {
    throw new Error(
      `${context} ultrapassa a área canônica da página. Revise a paginação/geometria no modelo antes de emitir.`,
    );
  }
  return lines;
};

