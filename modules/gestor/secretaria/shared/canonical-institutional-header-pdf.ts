import type { jsPDF } from 'jspdf';

import {
  resolveInstitutionalHeader,
  type InstitutionalDocumentMeta,
  type InstitutionalHeaderFields,
  type ResolvedInstitutionalHeader,
} from '../../components/institutional-header.model';
import type { CanonicalPdfImage } from './canonical-document-vector-pdf';

/** Contrato legado preservado para snapshots e exportadores já existentes. */
export interface CanonicalInstitutionalHeader {
  name: string;
  legalName: string;
  cnpj: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  isHeadquarters: boolean;
}

export interface CanonicalInstitutionalHeaderLayout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  logoSize: number;
}

export interface CanonicalInstitutionalHeaderRenderResult
  extends CanonicalInstitutionalHeaderLayout {
  contentTop: number;
}

export const PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT: CanonicalInstitutionalHeaderLayout = {
  left: 20,
  right: 20,
  top: 20,
  bottom: 55,
  logoSize: 29,
};

export const LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT: CanonicalInstitutionalHeaderLayout = {
  left: 20,
  right: 20,
  top: 15,
  bottom: 50,
  logoSize: 29,
};

/** Rótulos reconhecidos por contratos de auditoria anteriores ao modelo comum. */
export const CANONICAL_INSTITUTIONAL_HEADER_LEGACY_LABELS = [
  'CNPJ',
  'Contato',
  'Endereço',
  'Email',
] as const;

export const normalizeCanonicalInstitutionalHeader = (
  source: Record<string, unknown>,
): CanonicalInstitutionalHeader => {
  const resolved = resolveInstitutionalHeader({
    overrides: source as InstitutionalHeaderFields,
  });
  return {
    name: resolved.name,
    // A propriedade continua no contrato para ler snapshots antigos, mas não é exibida.
    legalName: '',
    cnpj: resolved.cnpj,
    address: resolved.address,
    number: resolved.number,
    complement: resolved.complement,
    neighborhood: resolved.neighborhood,
    city: resolved.city,
    state: resolved.state,
    postalCode: resolved.postalCode,
    phone: resolved.phone,
    email: resolved.email,
    isHeadquarters: resolved.isHeadquarters,
  };
};

const drawContainedLogo = (
  pdf: jsPDF,
  logo: CanonicalPdfImage,
  x: number,
  y: number,
  size: number,
  alias: string,
) => {
  const properties = pdf.getImageProperties(logo.dataUrl);
  const availableSize = size - 3.2;
  const scale = Math.min(
    availableSize / properties.width,
    availableSize / properties.height,
  );
  const width = properties.width * scale;
  const height = properties.height * scale;
  pdf.addImage(
    logo.dataUrl,
    logo.format,
    x + (size - width) / 2,
    y + (size - height) / 2,
    width,
    height,
    alias,
    'FAST',
  );
};

const drawSingleLinePdfText = (
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  options: {
    align?: 'left' | 'center' | 'right';
    maxWidth?: number;
    minimumFontSize?: number;
  } = {},
) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  let fittedText = text;
  if (options.maxWidth) {
    const currentSize = pdf.getFontSize();
    const textWidth = pdf.getTextWidth(text);
    if (textWidth > options.maxWidth) {
      pdf.setFontSize(Math.max(
        options.minimumFontSize ?? 3.8,
        currentSize * options.maxWidth / textWidth,
      ));
    }
    if (pdf.getTextWidth(fittedText) > options.maxWidth) {
      const ellipsis = '...';
      let start = 0;
      let end = fittedText.length;
      let candidate = pdf.getTextWidth(ellipsis) <= options.maxWidth ? ellipsis : '';
      while (start <= end) {
        const middle = Math.floor((start + end) / 2);
        const prefix = fittedText.slice(0, middle).trimEnd();
        const nextCandidate = `${prefix}${ellipsis}`;
        if (pdf.getTextWidth(nextCandidate) <= options.maxWidth) {
          candidate = nextCandidate;
          start = middle + 1;
        } else {
          end = middle - 1;
        }
      }
      fittedText = candidate;
    }
  }
  if (!fittedText) return '';
  pdf.text(fittedText, x, y, {
    align: options.align ?? 'left',
    baseline: 'top',
  });
  return fittedText;
};

const getSingleLineFontSize = (
  pdf: jsPDF,
  label: string,
  value: string,
  width: number,
  preferredSize: number,
  minimumSize: number,
) => {
  const labelText = `${label}: `;
  pdf.setFontSize(preferredSize);
  pdf.setFont('helvetica', 'bold');
  const labelWidth = pdf.getTextWidth(labelText);
  pdf.setFont('helvetica', 'normal');
  const valueWidth = pdf.getTextWidth(value);
  const totalWidth = labelWidth + valueWidth;
  if (totalWidth <= width) return preferredSize;
  return Math.max(minimumSize, preferredSize * width / totalWidth);
};

const drawHeaderDetail = (
  pdf: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) => {
  const fontSize = getSingleLineFontSize(pdf, label, value, width, 6.2, 4.5);
  const labelText = `${label}: `;
  pdf.setFontSize(fontSize);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 41, 59);
  pdf.text(labelText, x, y, { baseline: 'top' });
  const labelWidth = pdf.getTextWidth(labelText);

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(71, 85, 105);
  drawSingleLinePdfText(pdf, value, x + labelWidth, y, {
    maxWidth: Math.max(0, width - labelWidth),
    minimumFontSize: fontSize,
  });
};

const normalizeForDrawing = (
  institution: CanonicalInstitutionalHeader | ResolvedInstitutionalHeader,
) => resolveInstitutionalHeader({
  overrides: institution as unknown as InstitutionalHeaderFields,
});

const drawDocumentMeta = (
  pdf: jsPDF,
  meta: InstitutionalDocumentMeta,
  left: number,
  right: number,
  top: number,
  pageWidth: number,
) => {
  const width = pageWidth - left - right;
  const rightWidth = meta.label || meta.value ? Math.min(54, width * 0.34) : 0;
  const leftWidth = width - rightWidth - (rightWidth ? 5 : 0);
  const rightX = pageWidth - right;

  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(left, top, width, 10.5, 1.5, 1.5, 'FD');

  if (meta.eyebrow) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(4.8);
    drawSingleLinePdfText(pdf, meta.eyebrow.toUpperCase(), left + 3, top + 2, {
      maxWidth: leftWidth - 6,
    });
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(6.6);
  drawSingleLinePdfText(pdf, meta.title.toUpperCase(), left + 3, top + 5.2, {
    maxWidth: leftWidth - 6,
  });

  if (meta.label) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(4.6);
    drawSingleLinePdfText(pdf, meta.label.toUpperCase(), rightX - 3, top + 2, {
      align: 'right',
      maxWidth: rightWidth - 6,
    });
  }
  if (meta.value) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(5.7);
    drawSingleLinePdfText(pdf, meta.value.toUpperCase(), rightX - 3, top + 5.2, {
      align: 'right',
      maxWidth: rightWidth - 6,
    });
  }
};

/**
 * Compositor único do cabeçalho institucional oficial. React e PDF usam o
 * mesmo resolvedor, a mesma ordem de campos e três linhas fixas por coluna.
 */
export const drawCanonicalInstitutionalHeader = (
  pdf: jsPDF,
  institutionSource: CanonicalInstitutionalHeader | ResolvedInstitutionalHeader,
  logo: CanonicalPdfImage | null,
  options: {
    orientation?: 'portrait' | 'landscape';
    alias?: string;
    meta?: InstitutionalDocumentMeta;
    /** @deprecated A razão social não é mais renderizada. */
    showLegalName?: boolean;
  } = {},
): CanonicalInstitutionalHeaderRenderResult => {
  const institution = normalizeForDrawing(institutionSource);
  const layout = options.orientation === 'landscape'
    ? LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT
    : PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { left, right, top, bottom, logoSize } = layout;
  const contentX = left + logoSize + 5;
  const contentWidth = pageWidth - right - contentX;
  const detailsGap = options.orientation === 'landscape' ? 9 : 5;
  const detailsWidth = (contentWidth - detailsGap) / 2;
  const detailsRightX = contentX + detailsWidth + detailsGap;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(left, top, logoSize, logoSize, 3, 3, 'FD');
  if (logo) {
    drawContainedLogo(
      pdf,
      logo,
      left,
      top,
      logoSize,
      options.alias || 'institutional-header-logo',
    );
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 26, 51);
    pdf.setFontSize(7.2);
    drawSingleLinePdfText(pdf, 'UNIVERSO', left + logoSize / 2, top + 12.5, {
      align: 'center',
      maxWidth: logoSize - 4,
    });
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(11);
  const badgeWidth = 15;
  const nameWidth = institution.isHeadquarters
    ? contentWidth - badgeWidth - 4
    : contentWidth;
  const name = institution.name.toUpperCase();
  const drawnName = drawSingleLinePdfText(pdf, name, contentX, top + 7.2, {
    maxWidth: nameWidth,
  });
  if (institution.isHeadquarters) {
    const badgeX = Math.min(
      contentX + pdf.getTextWidth(drawnName) + 3,
      pageWidth - right - badgeWidth,
    );
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(badgeX, top + 6.2, badgeWidth, 4.5, 1.2, 1.2, 'FD');
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(5.1);
    drawSingleLinePdfText(pdf, 'MATRIZ', badgeX + badgeWidth / 2, top + 7.3, {
      align: 'center',
      maxWidth: badgeWidth - 2,
    });
  }

  const detailsY = top + 14.6;
  institution.leftLines.forEach((line, index) => {
    drawHeaderDetail(pdf, line.label, line.value, contentX, detailsY + index * 4.35, detailsWidth);
  });
  institution.rightLines.forEach((line, index) => {
    drawHeaderDetail(pdf, line.label, line.value, detailsRightX, detailsY + index * 4.35, detailsWidth);
  });

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.35);
  pdf.line(left, bottom, pageWidth - right, bottom);

  const metaTop = bottom + 2;
  if (options.meta) {
    drawDocumentMeta(pdf, options.meta, left, right, metaTop, pageWidth);
  }

  return {
    ...layout,
    contentTop: options.meta ? metaTop + 13.5 : bottom + 5,
  };
};
