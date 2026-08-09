import type { jsPDF } from 'jspdf';

import { canonicalText } from './canonical-document-render.utils';
import {
  drawCanonicalPdfText,
  type CanonicalPdfImage,
} from './canonical-document-vector-pdf';

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

const cleanInstitutionName = (value: string) => {
  const name = canonicalText(value, 'UNIVERSO CURSOS E CONSULTORIA');
  return name.replace(/^MATRIZ\s*-\s*/i, '');
};

export const normalizeCanonicalInstitutionalHeader = (
  source: Record<string, unknown>,
): CanonicalInstitutionalHeader => ({
  name: cleanInstitutionName(canonicalText(
    source.nomeFantasia,
    source.nome_fantasia,
    source.nome,
    source.name,
  )),
  legalName: canonicalText(
    source.razaoSocial,
    source.razao_social,
    source.legalName,
    source.legal_name,
  ),
  cnpj: canonicalText(source.cnpj, source.taxId, source.tax_id),
  address: canonicalText(source.endereco, source.address),
  number: canonicalText(source.numero, source.number),
  complement: canonicalText(source.complemento, source.complement),
  neighborhood: canonicalText(source.bairro, source.neighborhood),
  city: canonicalText(source.cidade, source.city),
  state: canonicalText(source.uf, source.estado, source.state),
  postalCode: canonicalText(source.cep, source.postalCode, source.postal_code),
  phone: canonicalText(source.telefone, source.contato, source.phone),
  email: canonicalText(source.email),
  isHeadquarters: source.isMatriz === true
    || source.is_matriz === true
    || canonicalText(source.tipo).toLocaleUpperCase('pt-BR') === 'MATRIZ',
});

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

const drawHeaderDetail = (
  pdf: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  maxLines = 1,
) => {
  if (!value) return 0;

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(6.2);
  const labelText = `${label}: `;
  const labelWidth = pdf.getTextWidth(labelText);
  pdf.text(labelText, x, y, { baseline: 'top' });

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(71, 85, 105);
  const firstLineWidth = Math.max(8, width - labelWidth);
  const lines = (pdf.splitTextToSize(value, firstLineWidth) as string[]).slice(0, maxLines);
  if (lines[0]) pdf.text(lines[0], x + labelWidth, y, { baseline: 'top' });
  if (lines.length > 1) {
    pdf.text(lines.slice(1), x, y + 3.2, {
      baseline: 'top',
      lineHeightFactor: 1.15,
    });
  }
  return lines.length;
};

const formatInstitutionAddress = (institution: CanonicalInstitutionalHeader) => [
  [institution.address, institution.number].filter(Boolean).join(', '),
  institution.complement,
  institution.neighborhood,
  [institution.city, institution.state].filter(Boolean).join('/'),
  institution.postalCode ? `CEP: ${institution.postalCode}` : '',
].filter(Boolean).join(' - ');

/**
 * Compositor único do cabeçalho institucional oficial. Replica o componente
 * `DocumentHeader`: cartão do logo, identificação, selo Matriz, dados em duas
 * colunas e divisor. Exportadores não devem criar cabeçalhos alternativos.
 */
export const drawCanonicalInstitutionalHeader = (
  pdf: jsPDF,
  institution: CanonicalInstitutionalHeader,
  logo: CanonicalPdfImage | null,
  options: {
    orientation?: 'portrait' | 'landscape';
    alias?: string;
    showLegalName?: boolean;
  } = {},
) => {
  const layout = options.orientation === 'landscape'
    ? LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT
    : PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { left, right, top, bottom, logoSize } = layout;
  const contentX = left + logoSize + 5;
  const contentWidth = pageWidth - right - contentX;
  const detailsGap = 5;
  const detailsWidth = (contentWidth - detailsGap) / 2;
  const detailsRightX = contentX + detailsWidth + detailsGap;
  const address = formatInstitutionAddress(institution);

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
    drawCanonicalPdfText(pdf, 'UNIVERSO', left + logoSize / 2, top + 12.5, {
      align: 'center',
      maxWidth: logoSize - 4,
      maxLines: 1,
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
  drawCanonicalPdfText(pdf, name, contentX, top + 8.2, {
    maxWidth: nameWidth,
    maxLines: 1,
  });
  if (institution.isHeadquarters) {
    const badgeX = Math.min(
      contentX + pdf.getTextWidth(name) + 3,
      pageWidth - right - badgeWidth,
    );
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(badgeX, top + 7.1, badgeWidth, 4.5, 1.2, 1.2, 'FD');
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(5.1);
    drawCanonicalPdfText(pdf, 'MATRIZ', badgeX + badgeWidth / 2, top + 8.2, {
      align: 'center',
      maxWidth: badgeWidth - 2,
      maxLines: 1,
    });
  }

  const hasLegalName = Boolean(
    options.showLegalName !== false
    &&
    institution.legalName
    && institution.legalName.toLocaleUpperCase('pt-BR') !== name,
  );
  if (hasLegalName) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(5.5);
    drawCanonicalPdfText(pdf, institution.legalName.toUpperCase(), contentX, top + 13.2, {
      maxWidth: contentWidth,
      maxLines: 1,
    });
  }

  const detailsY = top + (hasLegalName ? 18.2 : 15.8);
  drawHeaderDetail(pdf, 'CNPJ', institution.cnpj || 'Não informado', contentX, detailsY, detailsWidth);
  drawHeaderDetail(pdf, 'Contato', institution.phone, contentX, detailsY + 5, detailsWidth);
  const addressLines = drawHeaderDetail(
    pdf,
    'Endereço',
    address,
    detailsRightX,
    detailsY,
    detailsWidth,
    2,
  );
  drawHeaderDetail(
    pdf,
    'Email',
    institution.email,
    detailsRightX,
    detailsY + Math.max(1, addressLines) * 3.2 + 1.5,
    detailsWidth,
  );

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.35);
  pdf.line(left, bottom, pageWidth - right, bottom);
  return layout;
};
