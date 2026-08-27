import React from 'react';

import {
  getCanonicalPdfInlineImage,
  normalizeCanonicalPdfText,
  type CanonicalPdfImage,
} from '../../secretaria/shared/canonical-document-vector-pdf';
import type {
  FinancialReportRow,
  NormalizedFinancialReportRow,
} from './financial-report.vector-pdf.types';

export interface FinancialReportWatermarkSnapshot {
  configured: boolean;
  image: CanonicalPdfImage | null;
  imageUrl: string | null;
  opacity: number;
  scale: number;
  rotate: boolean | null;
}

export type FinancialReportPdfTextComponent<Props extends object> = React.FC<Props> & {
  pdfText: (props: Props) => string | number;
};

export const asFinancialReportRecord = (
  value: object | null | undefined,
): Record<string, unknown> => (
  value && typeof value === 'object' ? value as Record<string, unknown> : {}
);

export const readFinancialReportText = (
  source: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = String(source[key] ?? '').trim();
    if (value) return value;
  }
  return '';
};

const readNumber = (
  source: Record<string, unknown>,
  keys: string[],
  fallback: number,
) => {
  for (const key of keys) {
    const raw = source[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
};

const readOptionalBoolean = (
  source: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
};

export const mergeFinancialReportInstitution = (
  company: object | null | undefined,
  polo: object | null | undefined,
) => {
  const result: Record<string, unknown> = {};
  [asFinancialReportRecord(company), asFinancialReportRecord(polo)].forEach((source) => {
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

const hasValidInlineImageSignature = (image: CanonicalPdfImage) => {
  try {
    const payload = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1);
    const header = atob(payload.slice(0, 32));
    if (image.format === 'PNG') return header.startsWith('\x89PNG\r\n\x1a\n');
    if (image.format === 'JPEG') {
      return header.charCodeAt(0) === 0xff
        && header.charCodeAt(1) === 0xd8
        && header.charCodeAt(2) === 0xff;
    }
    return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  } catch {
    return false;
  }
};

/** Somente logo e marca-d'água podem entrar como imagens isoladas. */
export const loadFinancialReportIsolatedImage = async (
  source: string | null | undefined,
): Promise<CanonicalPdfImage | null> => {
  const inline = getCanonicalPdfInlineImage(source);
  if (inline) return hasValidInlineImageSignature(inline) ? inline : null;

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
    const props = value.props as {
      children?: React.ReactNode;
      pdfText?: string | number;
    };
    if (typeof props.pdfText === 'string' || typeof props.pdfText === 'number') {
      return String(props.pdfText);
    }
    const component = value.type as {
      pdfText?: (componentProps: Record<string, unknown>) => string | number;
    };
    if (typeof component?.pdfText === 'function') {
      return String(component.pdfText(value.props as Record<string, unknown>));
    }
    const children = props.children;
    return normalizeNodeText(children);
  }
  return '';
};

export const financialReportValueToText = (value: React.ReactNode): string => (
  normalizeCanonicalPdfText(normalizeNodeText(value)).replace(/\s+/g, ' ').trim()
);

export const normalizeFinancialReportRows = (
  rows: FinancialReportRow[],
  columnCount: number,
): NormalizedFinancialReportRow[] => rows.map((row) => ({
  id: row.id,
  cells: Array.from({ length: columnCount }, (_, index) => (
    financialReportValueToText(row.cells[index]) || '—'
  )),
}));

export const loadFinancialReportWatermarkSnapshot = async (
  polo: object | null | undefined,
): Promise<FinancialReportWatermarkSnapshot> => {
  const source = asFinancialReportRecord(polo);
  const imageUrl = readFinancialReportText(source, ['watermarkUrl', 'watermark_url']) || null;
  const image = await loadFinancialReportIsolatedImage(imageUrl);
  if (imageUrl && !image) {
    throw new Error('Não foi possível carregar a marca d’água configurada para este relatório.');
  }
  if (!imageUrl) {
    return {
      configured: false,
      image: null,
      imageUrl: null,
      opacity: 0.03,
      scale: 50,
      rotate: true,
    };
  }
  return {
    configured: true,
    image,
    imageUrl,
    opacity: readNumber(source, ['watermarkOpacity', 'watermark_opacity'], 0.1),
    scale: readNumber(source, ['watermarkScale', 'watermark_scale'], 50),
    rotate: readOptionalBoolean(source, ['watermarkRotate', 'watermark_rotate']),
  };
};

export const safeFinancialReportFileName = (value: string) => (
  String(value || 'relatorio-financeiro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'relatorio-financeiro'
);
