import type { jsPDF } from 'jspdf';
import { canonicalText } from '../../shared/canonical-document-render.utils';
import {
  drawCanonicalPdfText, drawCanonicalPdfWatermark, type CanonicalPdfImage,
} from '../../shared/canonical-document-vector-pdf';
import {
  PAGE_WIDTH, PAGE_HEIGHT, PAGE_LEFT, PAGE_RIGHT, PAGE_TOP,
  type ContractVisualDocument, type ContractVisualPage, type PdfGStateConstructor,
} from './model';

export const clampContractAssetOpacity = (value: number | null | undefined) => {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.08;
};

export const getContractWatermarkScaleRatio = (value: number | null | undefined) => {
  const scale = Number(value);
  return Math.min(1, Math.max(0.1, Number.isFinite(scale) ? scale / 100 : 0.5));
};

export const getContractWatermarkGeometry = (
  value: number | null | undefined,
) => {
  const scale = getContractWatermarkScaleRatio(value);
  const width = PAGE_WIDTH * scale;
  const height = PAGE_HEIGHT * scale;
  return {
    scale: scale * 100,
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
  };
};

export const drawContractWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: ContractVisualDocument["watermark"],
  asset: CanonicalPdfImage | null,
  assetAlias: string,
) => {
  if (!watermark.enabled) return;

  if (asset) {
    const properties = pdf.getImageProperties(asset.dataUrl);
    const geometry = getContractWatermarkGeometry(watermark.scale);
    const scale = Math.min(
      geometry.width / properties.width,
      geometry.height / properties.height,
    );
    const width = properties.width * scale;
    const height = properties.height * scale;

    pdf.saveGraphicsState();
    pdf.setGState(
      new GState({
        opacity: clampContractAssetOpacity(watermark.opacity),
      }) as never,
    );
    pdf.addImage(
      asset.dataUrl,
      asset.format,
      (PAGE_WIDTH - width) / 2,
      (PAGE_HEIGHT - height) / 2,
      width,
      height,
      assetAlias,
      "FAST",
      watermark.rotate ? -45 : 0,
    );
    pdf.restoreGraphicsState();
    return;
  }

  const geometry = getContractWatermarkGeometry(watermark.scale);

  drawCanonicalPdfWatermark(
    pdf,
    GState,
    {
      ...watermark,
      imageUrl: asset?.dataUrl ?? watermark.imageUrl,
    },
    {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      textSize: 28,
      rotate: watermark.rotate ? 45 : 0,
    },
  );
};

/** Reproduz exatamente a caixa e a rotação usadas pelo compositor anterior. */
export const drawContractWatermarkLegacy = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  watermark: ContractVisualDocument["watermark"],
  asset: CanonicalPdfImage | null,
) => {
  drawCanonicalPdfWatermark(
    pdf,
    GState,
    {
      ...watermark,
      imageUrl: asset?.dataUrl ?? watermark.imageUrl,
    },
    {
      x: 25,
      y: 62,
      width: 160,
      height: 172,
      textSize: 28,
      rotate: 35,
    },
  );
};


export const drawContractInstitutionalHeaderLegacy = (
  pdf: jsPDF,
  page: ContractVisualPage,
  visual: ContractVisualDocument,
  logo: CanonicalPdfImage | null,
) => {
  const name = canonicalText(
    page.header,
    visual.institution.name,
    "UNIVERSO CURSOS E CONSULTORIA",
  );
  const logoX = PAGE_LEFT;
  const logoY = PAGE_TOP;
  const logoSize = 19;
  const contentX = logoX + logoSize + 4;
  const contentWidth = PAGE_WIDTH - PAGE_RIGHT - contentX;

  if (logo) {
    const properties = pdf.getImageProperties(logo.dataUrl);
    const scale = Math.min(logoSize / properties.width, logoSize / properties.height);
    const width = properties.width * scale;
    const height = properties.height * scale;
    pdf.addImage(
      logo.dataUrl,
      logo.format,
      logoX + (logoSize - width) / 2,
      logoY + (logoSize - height) / 2,
      width,
      height,
      "contrato-logo-institucional",
      "FAST",
    );
  } else {
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 1.5, 1.5, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 26, 51);
    pdf.setFontSize(8);
    drawCanonicalPdfText(pdf, "U", logoX + logoSize / 2, logoY + logoSize / 2, {
      align: "center",
      maxWidth: logoSize - 2,
      maxLines: 1,
    });
  }

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0, 26, 51);
  pdf.setFontSize(10);
  drawCanonicalPdfText(pdf, name, contentX, logoY + 2, {
    maxWidth: contentWidth,
    maxLines: 2,
    lineHeight: 1.1,
  });
  if (visual.institution.cnpj) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(71, 85, 105);
    pdf.setFontSize(6.8);
    drawCanonicalPdfText(pdf, `CNPJ: ${visual.institution.cnpj}`, contentX, logoY + 9.5, {
      maxWidth: contentWidth,
      maxLines: 1,
    });
  }

  pdf.setDrawColor(0, 26, 51);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_LEFT, 39, PAGE_WIDTH - PAGE_RIGHT, 39);
};
