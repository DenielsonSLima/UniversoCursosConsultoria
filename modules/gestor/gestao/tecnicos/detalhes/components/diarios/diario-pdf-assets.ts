import { GState, type jsPDF } from "jspdf";

import type {
  DiarioPdfRenderableData,
  DiarioPdfInstitutionalWatermark,
} from "./diario-pdf.contract.ts";
import {
  assertValidPdfImage,
  type PdfImage,
} from "./diario-pdf-image.core.ts";
import type { CanonicalPdfImage } from "../../../../../secretaria/shared/canonical-document-vector-pdf.core.ts";
import type { CanonicalInstitutionalHeader } from "../../../../../secretaria/shared/canonical-institutional-header-pdf.ts";

type DiarioPrintDocumentProps = DiarioPdfRenderableData;

export interface DiarioPdfTrustedQrAsset {
  image: PdfImage;
  /** Conteúdo exato codificado pelo QR, produzido fora do core puro. */
  payload: string;
  generatedBy: "TRUSTED_ADAPTER";
}

export interface DiarioPdfValidationEndpoint {
  /** Origem HTTPS confiável, sem path, query, fragmento ou credenciais. */
  origin: string;
  /** Path absoluto canônico do validador, sem query ou fragmento. */
  pathname: string;
  /** O core nunca deriva este endpoint do snapshot acadêmico. */
  generatedBy: "TRUSTED_ADAPTER";
}

export interface DiarioPdfResolvedAssets {
  logo: PdfImage;
  watermark: PdfImage | null;
  /** Arte decorativa isolada da contracapa; nunca contém o conteúdo do documento. */
  backCoverBackground: PdfImage | null;
  /** Recursos isolados associados aos campos `isImage` da contracapa. */
  backCoverImages: Readonly<Record<string, PdfImage>>;
  qrCode: DiarioPdfTrustedQrAsset | null;
  validationEndpoint: DiarioPdfValidationEndpoint | null;
  validationUrl: string | null;
  /** Compatibilidade do adaptador web; snapshot server-side usa sua identidade. */
  institution?: CanonicalInstitutionalHeader;
}

const resolveCanonicalValidationUrl = (
  validationCode: string,
  endpoint: DiarioPdfValidationEndpoint | null,
) => {
  if (!endpoint) {
    throw new Error(
      "A origem e o path canônicos do validador do Diário não foram informados.",
    );
  }
  if (endpoint.generatedBy !== "TRUSTED_ADAPTER") {
    throw new Error(
      "O endpoint canônico de validação não foi fornecido pelo adaptador confiável.",
    );
  }
  try {
    const origin = new URL(endpoint.origin);
    if (
      origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash ||
      origin.origin !== endpoint.origin || !endpoint.pathname.startsWith("/") ||
      endpoint.pathname.includes("?") || endpoint.pathname.includes("#")
    ) throw new Error("invalid");
    const expected = new URL(endpoint.pathname, origin.origin);
    if (
      expected.pathname !== endpoint.pathname || expected.search || expected.hash
    ) throw new Error("invalid");
    expected.searchParams.set("code", validationCode);
    return expected.href;
  } catch {
    throw new Error(
      "A origem ou o path canônico de validação do Diário é inválido.",
    );
  }
};

const validateWatermarkPresentation = (
  props: DiarioPrintDocumentProps,
  image: PdfImage | null,
): DiarioPdfInstitutionalWatermark | null => {
  const sourceUrl = props.institutionalIdentity.watermarkUrl;
  const presentation = props.institutionalIdentity.watermark;
  if (!image) {
    if (sourceUrl !== null || presentation !== undefined) {
      throw new Error(
        "Os bytes da marca-d’água divergem da apresentação institucional do Diário.",
      );
    }
    return null;
  }
  if (!sourceUrl || !presentation) {
    throw new Error(
      "A apresentação completa da marca-d’água do Diário não foi informada.",
    );
  }
  if (presentation.url !== sourceUrl) {
    throw new Error(
      "A apresentação da marca-d’água diverge da referência institucional congelada.",
    );
  }
  if (
    !Number.isFinite(presentation.opacity) || presentation.opacity < 0 ||
    presentation.opacity > 1 || !Number.isInteger(presentation.scale) ||
    presentation.scale < 10 || presentation.scale > 100 ||
    presentation.scale % 5 !== 0 || typeof presentation.rotate !== "boolean"
  ) {
    throw new Error(
      "A apresentação da marca-d’água do Diário é inválida.",
    );
  }
  return presentation;
};

export const validateResolvedAssets = (
  props: DiarioPrintDocumentProps,
  assets: DiarioPdfResolvedAssets,
) => {
  const logo = assertValidPdfImage(assets?.logo ?? null, "O logo do Diário");
  if (!logo) {
    throw new Error(
      "O logo institucional do Diário precisa ser fornecido como bytes válidos.",
    );
  }
  const watermark = assertValidPdfImage(
    assets.watermark,
    "A marca-d’água do Diário",
  );
  const watermarkPresentation = validateWatermarkPresentation(props, watermark);
  const backCoverBackground = assertValidPdfImage(
    assets.backCoverBackground,
    "A arte decorativa da contracapa do Diário",
  );
  if (Boolean(backCoverBackground) !== Boolean(props.template.contracapaUrl)) {
    throw new Error(
      "A arte decorativa da contracapa diverge do modelo congelado do Diário.",
    );
  }
  const backCoverImages = Object.fromEntries(
    Object.entries(assets.backCoverImages || {}).map(([fieldId, candidate]) => {
      const image = assertValidPdfImage(
        candidate,
        `A imagem ${fieldId} da contracapa do Diário`,
      );
      if (!image) throw new Error(`A imagem ${fieldId} da contracapa é inválida.`);
      return [fieldId, image];
    }),
  ) as Record<string, PdfImage>;
  const qrCode = (() => {
    if (!assets.qrCode) return null;
    const image = assertValidPdfImage(
      assets.qrCode.image,
      "O QR Code do Diário",
    );
    if (!image) {
      throw new Error(
        "O QR Code do Diário precisa ser fornecido como bytes válidos.",
      );
    }
    return { ...assets.qrCode, image };
  })();
  const isBlank = props.exportMode === "EM_BRANCO";
  const validationCode = props.validationCode?.trim() || "";
  if (!isBlank && props.template.imprimirValidacaoContracapa) {
    if (!validationCode) {
      throw new Error("O código canônico do Diário não foi informado.");
    }
    if (!qrCode?.image || qrCode.generatedBy !== "TRUSTED_ADAPTER") {
      throw new Error(
        "O QR Code canônico do Diário não foi fornecido pelo adaptador confiável.",
      );
    }
    const expectedUrl = resolveCanonicalValidationUrl(
      validationCode,
      assets.validationEndpoint,
    );
    if (assets.validationUrl !== expectedUrl) {
      throw new Error("A URL canônica de validação do Diário é inválida.");
    }
    if (qrCode.payload !== expectedUrl) {
      throw new Error(
        "O conteúdo do QR Code diverge da URL canônica de validação do Diário.",
      );
    }
  }
  return {
    logo,
    watermark,
    watermarkPresentation,
    backCoverBackground,
    backCoverImages,
    qrCode,
    validationUrl: assets.validationUrl,
  };
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
};

export const toCanonicalPdfImage = (image: PdfImage): CanonicalPdfImage => ({
  dataUrl: `data:image/${
    image.format === "JPEG" ? "jpeg" : image.format.toLowerCase()
  };base64,${encodeBase64(image.bytes)}`,
  format: image.format,
});

export const drawContainedImage = (
  pdf: jsPDF,
  image: PdfImage,
  box: { x: number; y: number; width: number; height: number },
  alias: string,
) => {
  const properties = pdf.getImageProperties(image.bytes);
  const scale = Math.min(
    box.width / properties.width,
    box.height / properties.height,
  );
  const width = properties.width * scale;
  const height = properties.height * scale;
  pdf.addImage(
    image.bytes,
    image.format,
    box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2,
    width,
    height,
    alias,
    "FAST",
  );
};

export const drawPageWatermark = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  watermark: PdfImage | null,
) => {
  if (!watermark) return;
  const presentation = validateWatermarkPresentation(props, watermark);
  if (!presentation) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const boxWidth = pageWidth * presentation.scale / 100;
  const boxHeight = pageHeight * presentation.scale / 100;
  const properties = pdf.getImageProperties(watermark.bytes);
  const imageScale = Math.min(
    boxWidth / properties.width,
    boxHeight / properties.height,
  );
  const width = properties.width * imageScale;
  const height = properties.height * imageScale;
  const cssRotation = presentation.rotate ? -22 : 0;
  // O jsPDF calcula a rotação no eixo cartesiano (Y para cima), enquanto o
  // editor usa CSS (Y para baixo). Invertemos apenas na chamada nativa para a
  // saída visual continuar sendo exatamente rotate(-22deg) do editor.
  const pdfRotation = -cssRotation;
  let x = (pageWidth - width) / 2;
  let y = (pageHeight - height) / 2;

  if (pdfRotation) {
    const radians = pdfRotation * Math.PI / 180;
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    const anchorX = centerX -
      (Math.cos(radians) * width / 2 - Math.sin(radians) * height / 2);
    const anchorY = centerY -
      (Math.sin(radians) * width / 2 + Math.cos(radians) * height / 2);
    x = anchorX;
    y = pageHeight - anchorY - height;
  }

  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity: presentation.opacity }));
  pdf.addImage(
    watermark.bytes,
    watermark.format,
    x,
    y,
    width,
    height,
    "diario-institutional-watermark",
    "FAST",
    pdfRotation,
  );
  pdf.restoreGraphicsState();
};

export const resolveInstitution = (
  props: DiarioPrintDocumentProps,
  fallback?: CanonicalInstitutionalHeader,
): CanonicalInstitutionalHeader => {
  const institution = props.institutionalIdentity?.institution || fallback;
  if (!institution) {
    throw new Error(
      "A identidade institucional canônica do Diário não foi informada.",
    );
  }
  return institution;
};
