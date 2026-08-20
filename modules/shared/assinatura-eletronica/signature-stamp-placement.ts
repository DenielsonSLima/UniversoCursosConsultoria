import type {
  ElectronicSignatureStampPlacement,
  ElectronicSignatureStampSlot,
} from "./assinatura-eletronica.contract.ts";

export const SIGNATURE_STAMP_COORDINATE_SCALE = 100_000;
/**
 * Limite mínimo legível para o contrato visual completo (nome, CPF, data,
 * SHA-256 em duas linhas, código/URL e QR). Em A4 paisagem, 38% × 14%
 * preserva corpo vetorial de pelo menos 5 pt e hash/código/URL em 4,5 pt.
 */
export const SIGNATURE_STAMP_MIN_WIDTH_BP = 38_000;
export const SIGNATURE_STAMP_MAX_WIDTH_BP = 90_000;
export const SIGNATURE_STAMP_MIN_HEIGHT_BP = 14_000;
export const SIGNATURE_STAMP_MAX_HEIGHT_BP = 25_000;

export type SignatureStampPdfRotation = 0 | 90 | 180 | 270;

export interface SignatureStampPdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SignatureStampPdfPageGeometry {
  cropBox: SignatureStampPdfBox;
  rotationDegrees: SignatureStampPdfRotation;
}

export interface SignatureStampVisiblePageSize {
  width: number;
  height: number;
}

export interface SignatureStampPdfMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.min(
    maximum,
    Math.max(minimum, Math.round(value)),
  );

export const clampSignatureStampPlacement = (
  placement: ElectronicSignatureStampPlacement,
): ElectronicSignatureStampPlacement => {
  const widthBp = clampInteger(
    placement.widthBp,
    SIGNATURE_STAMP_MIN_WIDTH_BP,
    SIGNATURE_STAMP_MAX_WIDTH_BP,
  );
  const heightBp = clampInteger(
    placement.heightBp,
    SIGNATURE_STAMP_MIN_HEIGHT_BP,
    SIGNATURE_STAMP_MAX_HEIGHT_BP,
  );
  return {
    pageTarget: placement.pageTarget,
    coordinateSpace: placement.coordinateSpace,
    xBp: clampInteger(
      placement.xBp,
      0,
      SIGNATURE_STAMP_COORDINATE_SCALE - widthBp,
    ),
    yBp: clampInteger(
      placement.yBp,
      0,
      SIGNATURE_STAMP_COORDINATE_SCALE - heightBp,
    ),
    widthBp,
    heightBp,
  };
};

export const moveSignatureStampPlacement = (
  placement: ElectronicSignatureStampPlacement,
  deltaXBp: number,
  deltaYBp: number,
) =>
  clampSignatureStampPlacement({
    ...placement,
    xBp: placement.xBp + deltaXBp,
    yBp: placement.yBp + deltaYBp,
  });

export const resizeSignatureStampPlacement = (
  placement: ElectronicSignatureStampPlacement,
  widthBp: number,
  heightBp: number,
) => clampSignatureStampPlacement({ ...placement, widthBp, heightBp });

export const signatureStampPlacementsOverlap = (
  first: ElectronicSignatureStampSlot,
  second: ElectronicSignatureStampSlot,
) =>
  first.xBp < second.xBp + second.widthBp &&
  first.xBp + first.widthBp > second.xBp &&
  first.yBp < second.yBp + second.heightBp &&
  first.yBp + first.heightBp > second.yBp;

export const signatureStampPlacementToPdfRect = (
  placement: ElectronicSignatureStampPlacement,
  pageWidth: number,
  pageHeight: number,
) => ({
  x: pageWidth * placement.xBp / SIGNATURE_STAMP_COORDINATE_SCALE,
  y: pageHeight * (
    SIGNATURE_STAMP_COORDINATE_SCALE - placement.yBp - placement.heightBp
  ) / SIGNATURE_STAMP_COORDINATE_SCALE,
  width: pageWidth * placement.widthBp / SIGNATURE_STAMP_COORDINATE_SCALE,
  height: pageHeight * placement.heightBp / SIGNATURE_STAMP_COORDINATE_SCALE,
});

export const normalizeSignatureStampPdfRotation = (
  value: number,
): SignatureStampPdfRotation => {
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  if (
    normalized !== 0 && normalized !== 90 && normalized !== 180 &&
    normalized !== 270
  ) {
    throw new Error(
      "A rotação da página do PDF precisa ser 0, 90, 180 ou 270 graus.",
    );
  }
  return normalized;
};

const assertPdfBox = (box: SignatureStampPdfBox) => {
  const values = [box.x, box.y, box.width, box.height];
  if (
    values.some((value) => !Number.isFinite(value)) || box.width <= 0 ||
    box.height <= 0
  ) {
    throw new Error("A caixa visível da página do PDF é inválida.");
  }
};

export const getSignatureStampVisiblePageSize = (
  geometry: SignatureStampPdfPageGeometry,
): SignatureStampVisiblePageSize => {
  assertPdfBox(geometry.cropBox);
  const rotation = normalizeSignatureStampPdfRotation(geometry.rotationDegrees);
  return rotation === 90 || rotation === 270
    ? { width: geometry.cropBox.height, height: geometry.cropBox.width }
    : { width: geometry.cropBox.width, height: geometry.cropBox.height };
};

/**
 * Matriz que transforma o espaço visível da página (origem inferior esquerda,
 * depois de CropBox e /Rotate) para o espaço nativo do PDF. O compositor usa
 * essa matriz como CTM para manter texto e linhas na orientação percebida.
 */
export const signatureStampVisibleSpaceToPdfMatrix = (
  geometry: SignatureStampPdfPageGeometry,
): SignatureStampPdfMatrix => {
  assertPdfBox(geometry.cropBox);
  const { x, y, width, height } = geometry.cropBox;
  switch (normalizeSignatureStampPdfRotation(geometry.rotationDegrees)) {
    case 0:
      return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
    case 90:
      return { a: 0, b: 1, c: -1, d: 0, e: x + width, f: y };
    case 180:
      return { a: -1, b: 0, c: 0, d: -1, e: x + width, f: y + height };
    case 270:
      return { a: 0, b: -1, c: 1, d: 0, e: x, f: y + height };
  }
};

/**
 * Retângulo no espaço nativo do PDF. Útil para validação/telemetria; para
 * desenhar conteúdo orientado, aplique `signatureStampVisibleSpaceToPdfMatrix`
 * e desenhe no retângulo visível retornado por `...ToVisibleBottomLeftRect`.
 */
export const signatureStampPlacementToPdfRectOnPage = (
  placement: ElectronicSignatureStampPlacement,
  geometry: SignatureStampPdfPageGeometry,
) => {
  const visible = getSignatureStampVisiblePageSize(geometry);
  const topLeft = signatureStampPlacementToTopLeftRect(
    placement,
    visible.width,
    visible.height,
  );
  const bottomLeftY = visible.height - topLeft.y - topLeft.height;
  const { x, y, width, height } = geometry.cropBox;
  switch (normalizeSignatureStampPdfRotation(geometry.rotationDegrees)) {
    case 0:
      return {
        x: x + topLeft.x,
        y: y + bottomLeftY,
        width: topLeft.width,
        height: topLeft.height,
      };
    case 90:
      return {
        x: x + width - bottomLeftY - topLeft.height,
        y: y + topLeft.x,
        width: topLeft.height,
        height: topLeft.width,
      };
    case 180:
      return {
        x: x + width - topLeft.x - topLeft.width,
        y: y + height - bottomLeftY - topLeft.height,
        width: topLeft.width,
        height: topLeft.height,
      };
    case 270:
      return {
        x: x + bottomLeftY,
        y: y + height - topLeft.x - topLeft.width,
        width: topLeft.height,
        height: topLeft.width,
      };
  }
};

export const signatureStampPlacementToVisibleBottomLeftRect = (
  placement: ElectronicSignatureStampPlacement,
  geometry: SignatureStampPdfPageGeometry,
) => {
  const visible = getSignatureStampVisiblePageSize(geometry);
  const topLeft = signatureStampPlacementToTopLeftRect(
    placement,
    visible.width,
    visible.height,
  );
  return {
    x: topLeft.x,
    y: visible.height - topLeft.y - topLeft.height,
    width: topLeft.width,
    height: topLeft.height,
  };
};

/** Conversão para renderizadores com origem no canto superior esquerdo (DOM/jsPDF). */
export const signatureStampPlacementToTopLeftRect = (
  placement: ElectronicSignatureStampPlacement,
  pageWidth: number,
  pageHeight: number,
) => ({
  x: pageWidth * placement.xBp / SIGNATURE_STAMP_COORDINATE_SCALE,
  y: pageHeight * placement.yBp / SIGNATURE_STAMP_COORDINATE_SCALE,
  width: pageWidth * placement.widthBp / SIGNATURE_STAMP_COORDINATE_SCALE,
  height: pageHeight * placement.heightBp / SIGNATURE_STAMP_COORDINATE_SCALE,
});
