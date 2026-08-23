import type {
  ElectronicSignatureStampTemplateElement,
  ElectronicSignatureStampTemplateElementId,
  ElectronicSignatureStampTemplateHiddenElementId,
  ElectronicSignatureStampTemplateV1,
} from "./assinatura-eletronica.contract.ts";
import {
  SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS,
  SIGNATURE_STAMP_TEMPLATE_OPTIONAL_VISUAL_ELEMENT_IDS,
  SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_HEIGHT,
  SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_WIDTH,
} from "./signature-stamp-template.constants.ts";

const clampInteger = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, Math.round(value)))
);

const dimensionsFor = (
  element: Pick<ElectronicSignatureStampTemplateElement, "kind">,
) => {
  switch (element.kind) {
    case "IMAGE":
      return { minWidth: 5_000, minHeight: 5_000, square: false };
    case "QR":
      return { minWidth: 29_000, minHeight: 29_000, square: true };
    case "LINE":
      return { minWidth: 5_000, minHeight: 1_000, square: false };
    case "TEXT":
      return { minWidth: 5_000, minHeight: 4_000, square: false };
  }
};

export const templateElementsOverlap = (
  first: Pick<
    ElectronicSignatureStampTemplateElement,
    "xBp" | "yBp" | "widthBp" | "heightBp"
  >,
  second: Pick<
    ElectronicSignatureStampTemplateElement,
    "xBp" | "yBp" | "widthBp" | "heightBp"
  >,
) => (
  first.xBp < second.xBp + second.widthBp &&
  first.xBp + first.widthBp > second.xBp &&
  first.yBp < second.yBp + second.heightBp &&
  first.yBp + first.heightBp > second.yBp
);

type SignatureStampTemplateElementBounds = Pick<
  ElectronicSignatureStampTemplateElement,
  "xBp" | "yBp" | "widthBp" | "heightBp"
>;

type SignatureStampTemplateVisualElement =
  & SignatureStampTemplateElementBounds
  & { kind: string };

const clampTemplateCoordinate = (
  value: number,
  minimum: number,
  maximum: number,
) => Math.min(maximum, Math.max(minimum, value));

const projectLogicalPositionToVisual = (
  logicalPositionBp: number,
  logicalSizeBp: number,
  visualSizeBp: number,
) => {
  const logicalTravelBp = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE -
    logicalSizeBp;
  const visualTravelBp = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE -
    visualSizeBp;
  if (logicalTravelBp <= 0) return Math.max(0, visualTravelBp) / 2;
  if (visualTravelBp <= 0) return 0;
  return clampTemplateCoordinate(logicalPositionBp, 0, logicalTravelBp) *
    visualTravelBp / logicalTravelBp;
};

const projectVisualPositionToLogical = (
  visualPositionBp: number,
  logicalSizeBp: number,
  visualSizeBp: number,
) => {
  const logicalTravelBp = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE -
    logicalSizeBp;
  const visualTravelBp = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE -
    visualSizeBp;
  if (logicalTravelBp <= 0 || visualTravelBp <= 0) return 0;
  return clampTemplateCoordinate(visualPositionBp, 0, visualTravelBp) *
    logicalTravelBp / visualTravelBp;
};

export const getSignatureStampTemplateElementVisualBoundsForSurface = (
  element: SignatureStampTemplateVisualElement,
  surfaceAspectWidth: number,
  surfaceAspectHeight: number,
): SignatureStampTemplateElementBounds => {
  if (
    element.kind !== "QR" ||
    !Number.isFinite(surfaceAspectWidth) ||
    !Number.isFinite(surfaceAspectHeight) ||
    surfaceAspectWidth <= 0 ||
    surfaceAspectHeight <= 0
  ) {
    return {
      xBp: element.xBp,
      yBp: element.yBp,
      widthBp: element.widthBp,
      heightBp: element.heightBp,
    };
  }
  const physicalWidth = element.widthBp * surfaceAspectWidth;
  const physicalHeight = element.heightBp * surfaceAspectHeight;
  if (physicalWidth <= physicalHeight) {
    const heightBp = physicalWidth / surfaceAspectHeight;
    return {
      xBp: element.xBp,
      yBp: projectLogicalPositionToVisual(
        element.yBp,
        element.heightBp,
        heightBp,
      ),
      widthBp: element.widthBp,
      heightBp,
    };
  }
  const widthBp = physicalHeight / surfaceAspectWidth;
  return {
    xBp: projectLogicalPositionToVisual(
      element.xBp,
      element.widthBp,
      widthBp,
    ),
    yBp: element.yBp,
    widthBp,
    heightBp: element.heightBp,
  };
};

export const getSignatureStampTemplateElementVisualBounds = (
  element: ElectronicSignatureStampTemplateElement,
): SignatureStampTemplateElementBounds =>
  getSignatureStampTemplateElementVisualBoundsForSurface(
    element,
    SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_WIDTH,
    SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_HEIGHT,
  );

const positionQrElementByVisualBounds = (
  element: ElectronicSignatureStampTemplateElement,
  visualXBp: number,
  visualYBp: number,
) => {
  if (element.kind !== "QR") return element;
  const visualBounds = getSignatureStampTemplateElementVisualBounds(element);
  return clampSignatureStampTemplateElement({
    ...element,
    xBp: Math.round(projectVisualPositionToLogical(
      visualXBp,
      element.widthBp,
      visualBounds.widthBp,
    )),
    yBp: Math.round(projectVisualPositionToLogical(
      visualYBp,
      element.heightBp,
      visualBounds.heightBp,
    )),
  });
};

export const clampSignatureStampTemplateElement = (
  element: ElectronicSignatureStampTemplateElement,
): ElectronicSignatureStampTemplateElement => {
  const dimensions = dimensionsFor(element);
  const maximumWidth = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE;
  const maximumHeight = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE;
  let widthBp = clampInteger(element.widthBp, dimensions.minWidth, maximumWidth);
  let heightBp = clampInteger(
    element.heightBp,
    dimensions.minHeight,
    maximumHeight,
  );
  if (dimensions.square) {
    const size = clampInteger(
      Math.min(widthBp, heightBp),
      dimensions.minWidth,
      Math.min(maximumWidth, maximumHeight),
    );
    widthBp = size;
    heightBp = size;
  }
  return {
    ...element,
    xBp: clampInteger(
      element.xBp,
      0,
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - widthBp,
    ),
    yBp: clampInteger(
      element.yBp,
      0,
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - heightBp,
    ),
    widthBp,
    heightBp,
  };
};

export const moveSignatureStampTemplateElement = (
  element: ElectronicSignatureStampTemplateElement,
  deltaXBp: number,
  deltaYBp: number,
) => {
  if (element.kind === "QR") {
    const visualBounds = getSignatureStampTemplateElementVisualBounds(element);
    return positionQrElementByVisualBounds(
      element,
      clampTemplateCoordinate(
        visualBounds.xBp + deltaXBp,
        0,
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - visualBounds.widthBp,
      ),
      clampTemplateCoordinate(
        visualBounds.yBp + deltaYBp,
        0,
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - visualBounds.heightBp,
      ),
    );
  }
  return clampSignatureStampTemplateElement({
    ...element,
    xBp: element.xBp + deltaXBp,
    yBp: element.yBp + deltaYBp,
  });
};

export const resizeSignatureStampTemplateElement = (
  element: ElectronicSignatureStampTemplateElement,
  widthBp: number,
  heightBp: number,
) => {
  if (element.kind !== "QR") {
    return clampSignatureStampTemplateElement({ ...element, widthBp, heightBp });
  }
  const current = getSignatureStampTemplateElementVisualBounds(element);
  const resized = clampSignatureStampTemplateElement({
    ...element,
    xBp: 0,
    yBp: 0,
    widthBp,
    heightBp,
  });
  const next = getSignatureStampTemplateElementVisualBounds(resized);
  return positionQrElementByVisualBounds(
    resized,
    clampTemplateCoordinate(
      current.xBp,
      0,
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - next.widthBp,
    ),
    clampTemplateCoordinate(
      current.yBp,
      0,
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - next.heightBp,
    ),
  );
};

export const resizeSignatureStampTemplateElementFromCenter = (
  element: ElectronicSignatureStampTemplateElement,
  widthBp: number,
  heightBp: number,
) => {
  if (element.kind === "QR") {
    const before = getSignatureStampTemplateElementVisualBounds(element);
    const resized = resizeSignatureStampTemplateElement(element, widthBp, heightBp);
    const after = getSignatureStampTemplateElementVisualBounds(resized);
    return positionQrElementByVisualBounds(
      resized,
      before.xBp + (before.widthBp - after.widthBp) / 2,
      before.yBp + (before.heightBp - after.heightBp) / 2,
    );
  }
  const dimensions = clampSignatureStampTemplateElement({
    ...element,
    xBp: 0,
    yBp: 0,
    widthBp,
    heightBp,
  });
  return clampSignatureStampTemplateElement({
    ...dimensions,
    xBp: element.xBp - Math.round((dimensions.widthBp - element.widthBp) / 2),
    yBp: element.yBp - Math.round((dimensions.heightBp - element.heightBp) / 2),
  });
};

export const placeSignatureStampVerificationBelowQr = (
  template: ElectronicSignatureStampTemplateV1,
): ElectronicSignatureStampTemplateV1 => {
  const qr = template.elements.find((element) => element.id === "verificationQr");
  const code = template.elements.find((element) => element.id === "verificationCode");
  const url = template.elements.find((element) => element.id === "verificationUrl");
  if (!qr || !code || !url) {
    throw new Error("O template não possui os elementos de verificação.");
  }
  const columnWidth = 29_000;
  const columnX = 71_000;
  const codeHeight = 19_000;
  const urlHeight = 26_000;
  const qrBounds = getSignatureStampTemplateElementVisualBounds(qr);
  const codeY = Math.round(qrBounds.yBp + qrBounds.heightBp + 1_000);
  const urlY = codeY + codeHeight + 1_000;
  if (urlY + urlHeight > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE) {
    throw new Error("Não há espaço livre abaixo do QR para o código de verificação.");
  }
  return {
    ...template,
    elements: template.elements.map((element) => {
      if (element.id === "verificationCode") {
        return { ...element, xBp: columnX, yBp: codeY, widthBp: columnWidth, heightBp: codeHeight };
      }
      if (element.id === "verificationUrl") {
        return { ...element, xBp: columnX, yBp: urlY, widthBp: columnWidth, heightBp: urlHeight };
      }
      return element;
    }),
  };
};

export const isSignatureStampTemplateElementVisible = (
  template: ElectronicSignatureStampTemplateV1,
  id: ElectronicSignatureStampTemplateElementId,
) => !template.hiddenElementIds?.includes(
  id as ElectronicSignatureStampTemplateHiddenElementId,
);

export const getSignatureStampTemplateQrCollisionElementIds = (
  template: ElectronicSignatureStampTemplateV1,
): readonly ElectronicSignatureStampTemplateElementId[] => {
  const qr = template.elements.find((element) => element.id === "verificationQr");
  if (!qr) return SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS.map(({ id }) => id);
  const qrBounds = getSignatureStampTemplateElementVisualBounds(qr);
  return template.elements.filter((element) => (
    element.id !== "verificationQr" &&
    isSignatureStampTemplateElementVisible(template, element.id) &&
    templateElementsOverlap(qrBounds, element)
  )).map(({ id }) => id);
};

export const isSignatureStampTemplateQrClear = (
  template: ElectronicSignatureStampTemplateV1,
) => getSignatureStampTemplateQrCollisionElementIds(template).length === 0;

export const isSignatureStampTemplateElementOptionalVisual = (
  id: ElectronicSignatureStampTemplateElementId,
): id is ElectronicSignatureStampTemplateHiddenElementId =>
  SIGNATURE_STAMP_TEMPLATE_OPTIONAL_VISUAL_ELEMENT_IDS.includes(
    id as ElectronicSignatureStampTemplateHiddenElementId,
  );
