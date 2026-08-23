import type { jsPDF } from "jspdf";

import {
  drawCanonicalPdfWatermark,
  getCanonicalPdfInlineImage,
} from "../shared/canonical-document-vector-pdf.core.ts";
import type { ElectronicSignatureLegalSection } from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import { isCanonicalInstitutionalWatermarkDataUri } from "../../../shared/assinatura-eletronica/canonical-institutional-watermark.ts";
import type { ElectronicSignatureInstitutionalWatermark } from "./comprovante-assinatura-eletronica.types.ts";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_LEFT = 20;
const PAGE_RIGHT = 20;
type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

export const drawFooter = (pdf: jsPDF, page: 1 | 2) => {
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_LEFT, 278, PAGE_WIDTH - PAGE_RIGHT, 278);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(4.7);
  pdf.text(
    "Este comprovante é uma representação visual das evidências registradas para o documento.",
    PAGE_WIDTH / 2,
    281,
    {
      align: "center",
      baseline: "top",
    },
  );
  pdf.text(
    "Não substitui a consulta ao documento original e ao relatório de evidências.",
    PAGE_WIDTH / 2,
    284.2,
    {
      align: "center",
      baseline: "top",
    },
  );
  pdf.text(`Página ${page} de 2`, PAGE_WIDTH - PAGE_RIGHT, 281, {
    align: "right",
    baseline: "top",
  });
};

export const drawInstitutionalWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  institutionalWatermark: ElectronicSignatureInstitutionalWatermark | null,
) => {
  /**
   * A origem retrato configurada no polo é resolvida e congelada antes de
   * chegar ao compositor. Aqui aceitamos exclusivamente sua imagem válida;
   * sem esse ativo não há texto institucional substituto nem fallback visual.
   */
  if (!institutionalWatermark) {
    throw new Error(
      "A marca-d'água institucional canônica retrato do polo é obrigatória para gerar o comprovante.",
    );
  }
  const canonicalAsset = isCanonicalInstitutionalWatermarkDataUri(
      institutionalWatermark.image.dataUrl,
    )
    ? getCanonicalPdfInlineImage(institutionalWatermark.image.dataUrl)
    : null;
  if (!canonicalAsset) {
    throw new Error(
      "A marca-d'água institucional canônica retrato do polo é obrigatória para gerar o comprovante.",
    );
  }
  const settings = institutionalWatermark.settings;
  if (!settings) {
    /**
     * Emissões antigas não carregam a apresentação do modelo no snapshot.
     * Mantemos seus bytes/reprodução intactos em vez de reinterpretá-las.
     */
    drawCanonicalPdfWatermark(pdf, GState, {
      enabled: true,
      imageUrl: canonicalAsset.dataUrl,
      label: null,
      opacity: 0.1,
    }, {
      x: 25,
      y: 62,
      width: 160,
      height: 172,
      textSize: 28,
      rotate: -45,
    });
    return;
  }
  if (
    !Number.isFinite(settings.opacity) || settings.opacity < 0 ||
    settings.opacity > 1 || !Number.isFinite(settings.scale) ||
    !Number.isInteger(settings.scale) || settings.scale < 10 ||
    settings.scale > 100 || settings.scale % 5 !== 0 ||
    typeof settings.rotate !== "boolean"
  ) {
    throw new Error(
      "A apresentação congelada da marca-d'água institucional é inválida.",
    );
  }

  /**
   * Espelha o modelo pronto da tela de Documentos: largura percentual da
   * página, contido verticalmente, centralizado e sem uma opacidade/rotação
   * adicional além daquela salva no próprio template institucional.
   */
  const properties = pdf.getImageProperties(canonicalAsset.dataUrl);
  const factor = Math.min(
    (PAGE_WIDTH * settings.scale / 100) / properties.width,
    PAGE_HEIGHT / properties.height,
  );
  const width = properties.width * factor;
  const height = properties.height * factor;
  pdf.saveGraphicsState();
  try {
    pdf.setGState(new GState({ opacity: settings.opacity }) as never);
    pdf.addImage(
      canonicalAsset.dataUrl,
      canonicalAsset.format,
      (PAGE_WIDTH - width) / 2,
      (PAGE_HEIGHT - height) / 2,
      width,
      height,
      "assinatura-marca-dagua-institucional",
      "FAST",
      settings.rotate ? -45 : 0,
    );
  } finally {
    pdf.restoreGraphicsState();
  }
};

export const drawLegalSections = (
  pdf: jsPDF,
  sections: readonly ElectronicSignatureLegalSection[],
  top: number,
  maximumBottom: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  let y = top;
  sections.forEach((section, index) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.35);
    const titleLines = pdf.splitTextToSize(
      section.title.toUpperCase(),
      width,
    ) as string[];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.55);
    const bodyLines = pdf.splitTextToSize(section.body, width) as string[];
    const titleHeight = titleLines.length * 2.15;
    const bodyHeight = bodyLines.length * 2.35;
    const sectionHeight = titleHeight + bodyHeight + 6.2;
    if (y + sectionHeight > maximumBottom) {
      throw new Error(
        `O bloco juridico ${index + 1} excede a area segura da segunda pagina.`,
      );
    }
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(5.35);
    pdf.text(titleLines, PAGE_LEFT, y, {
      baseline: "top",
      lineHeightFactor: 1.15,
    });
    const separatorY = y + titleHeight + 0.8;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(PAGE_LEFT, separatorY, PAGE_WIDTH - PAGE_RIGHT, separatorY);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(5.55);
    pdf.text(bodyLines, PAGE_LEFT, separatorY + 2.2, {
      baseline: "top",
      lineHeightFactor: 1.18,
    });
    y += sectionHeight;
  });
  return y;
};


