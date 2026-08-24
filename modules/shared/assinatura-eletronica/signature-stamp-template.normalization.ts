import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_COURIER_FONTS,
  ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_HELVETICA_FONTS,
  type ElectronicSignatureStampAutoLayoutV1,
  type ElectronicSignatureStampPlacement,
  type ElectronicSignatureStampTemplateElement,
  type ElectronicSignatureStampTemplateFont,
  type ElectronicSignatureStampTemplateHiddenElementId,
  type ElectronicSignatureStampTemplateTextElement,
  type ElectronicSignatureStampTemplateV1,
} from "./assinatura-eletronica.contract.ts";
import {
  createDefaultElectronicSignatureStampTemplate,
  SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS,
  SIGNATURE_STAMP_TEMPLATE_OPTIONAL_VISUAL_ELEMENT_IDS,
} from "./signature-stamp-template.constants.ts";
import { isSignatureStampTemplateQrClear } from "./signature-stamp-template.geometry.ts";

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const exactKeys = (source: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(source).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const integer = (value: unknown) => (
  typeof value === "number" && Number.isInteger(value) ? value : null
);

const LEGACY_SIGNER_NAME_LABEL = "Assinante: ";

export interface NormalizeElectronicSignatureStampTemplateOptions {
  allowLegacySignerNameLabel?: boolean;
}

const allowedFontsForTextElement = (
  id: ElectronicSignatureStampTemplateTextElement["id"],
): readonly ElectronicSignatureStampTemplateFont[] => (
  id === "signatureHash" || id === "verificationCode"
    ? ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_COURIER_FONTS
    : ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_HELVETICA_FONTS
);

const normalizeTextStyle = (
  candidate: Record<string, unknown>,
  canonical: ElectronicSignatureStampTemplateTextElement["style"],
  elementId: ElectronicSignatureStampTemplateTextElement["id"],
  options: NormalizeElectronicSignatureStampTemplateOptions,
): ElectronicSignatureStampTemplateTextElement["style"] | null => {
  if (!exactKeys(candidate, ["font", "fontSizeBp", "color", "align", "label"])) {
    return null;
  }
  const font = candidate.font;
  const fontSizeBp = integer(candidate.fontSizeBp);
  const labelIsCanonical = candidate.label === canonical.label;
  const labelIsLegacy = options.allowLegacySignerNameLabel === true &&
    elementId === "signerName" && candidate.label === LEGACY_SIGNER_NAME_LABEL;
  if (
    typeof font !== "string" ||
    !allowedFontsForTextElement(elementId).some((allowed) => allowed === font) ||
    fontSizeBp === null ||
    fontSizeBp < ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS.minBp ||
    fontSizeBp > ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS.maxBp ||
    fontSizeBp % ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS.stepBp !== 0 ||
    candidate.color !== canonical.color ||
    !["LEFT", "CENTER", "RIGHT"].includes(String(candidate.align)) ||
    (!labelIsCanonical && !labelIsLegacy)
  ) return null;
  return {
    font: font as ElectronicSignatureStampTemplateFont,
    fontSizeBp,
    color: canonical.color,
    align: candidate.align as ElectronicSignatureStampTemplateTextElement["style"]["align"],
    label: candidate.label as string,
  };
};

const hasCanonicalStyle = (
  candidate: Record<string, unknown>,
  canonical: Record<string, unknown>,
) => exactKeys(candidate, Object.keys(canonical)) &&
  Object.entries(canonical).every(([key, value]) => candidate[key] === value);

const normalizeHiddenElementIds = (
  value: unknown,
): readonly ElectronicSignatureStampTemplateHiddenElementId[] | null => {
  if (
    !Array.isArray(value) || value.length < 1 ||
    value.length > SIGNATURE_STAMP_TEMPLATE_OPTIONAL_VISUAL_ELEMENT_IDS.length
  ) return null;
  const expected = SIGNATURE_STAMP_TEMPLATE_OPTIONAL_VISUAL_ELEMENT_IDS.filter(
    (id) => value.includes(id),
  );
  return expected.length === value.length &&
      expected.every((id, index) => value[index] === id)
    ? expected
    : null;
};

export const normalizeElectronicSignatureStampTemplate = (
  value: unknown,
  options: NormalizeElectronicSignatureStampTemplateOptions = {},
): ElectronicSignatureStampTemplateV1 => {
  const source = asRecord(value);
  const hasHiddenElementIds = Boolean(
    source && Object.prototype.hasOwnProperty.call(source, "hiddenElementIds"),
  );
  if (
    !source ||
    !exactKeys(
      source,
      hasHiddenElementIds
        ? ["schemaVersion", "coordinateSpace", "elements", "hiddenElementIds"]
        : ["schemaVersion", "coordinateSpace", "elements"],
    ) ||
    source.schemaVersion !== 1 ||
    source.coordinateSpace !== "STAMP_TOP_LEFT_BP_V1" ||
    !Array.isArray(source.elements) ||
    source.elements.length !== SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS.length
  ) throw new Error("O template global do carimbo eletrônico é inválido.");
  const hiddenElementIds = hasHiddenElementIds
    ? normalizeHiddenElementIds(source.hiddenElementIds)
    : undefined;
  if (hasHiddenElementIds && !hiddenElementIds) {
    throw new Error("A lista de elementos ocultos do template global é inválida.");
  }
  const canonicalElements = createDefaultElectronicSignatureStampTemplate().elements;
  const elements = source.elements.map((candidate, index) => {
    const sourceElement = asRecord(candidate);
    const spec = SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS[index];
    const canonicalElement = canonicalElements[index];
    if (
      !canonicalElement || !sourceElement ||
      !exactKeys(sourceElement, [
        "id", "kind", "binding", "xBp", "yBp", "widthBp", "heightBp", "style",
      ]) ||
      sourceElement.id !== spec.id || sourceElement.kind !== spec.kind ||
      sourceElement.binding !== spec.binding
    ) throw new Error(`O elemento ${index + 1} do template global é inválido.`);
    const xBp = integer(sourceElement.xBp);
    const yBp = integer(sourceElement.yBp);
    const widthBp = integer(sourceElement.widthBp);
    const heightBp = integer(sourceElement.heightBp);
    if (
      xBp === null || yBp === null || widthBp === null || heightBp === null ||
      xBp < 0 || yBp < 0 || widthBp <= 0 || heightBp <= 0 ||
      xBp + widthBp > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE ||
      yBp + heightBp > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE
    ) throw new Error(`As coordenadas de ${spec.id} no template global são inválidas.`);
    const style = asRecord(sourceElement.style);
    if (!style) throw new Error(`O estilo de ${spec.id} no template global é inválido.`);
    const normalizedStyle = canonicalElement.kind === "TEXT"
      ? normalizeTextStyle(style, canonicalElement.style, canonicalElement.id, options)
      : hasCanonicalStyle(style, canonicalElement.style) ? { ...style } : null;
    if (!normalizedStyle) {
      throw new Error(`O estilo de ${spec.id} no template global é inválido ou altera campo imutável.`);
    }
    if (
      (spec.kind === "IMAGE" && (widthBp < 5_000 || heightBp < 5_000)) ||
      (spec.kind === "QR" && (widthBp !== heightBp || widthBp < 29_000)) ||
      (spec.kind === "LINE" && widthBp < 5_000)
    ) throw new Error(`A geometria de ${spec.id} no template global é inválida.`);
    return {
      id: spec.id,
      kind: spec.kind,
      binding: spec.binding,
      xBp,
      yBp,
      widthBp,
      heightBp,
      style: normalizedStyle,
    } as ElectronicSignatureStampTemplateElement;
  });
  const normalized: ElectronicSignatureStampTemplateV1 = {
    schemaVersion: 1,
    coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
    elements,
    ...(hiddenElementIds ? { hiddenElementIds } : {}),
  };
  if (!isSignatureStampTemplateQrClear(normalized)) {
    throw new Error("A quiet zone do QR individual se sobrepõe a outro elemento do template.");
  }
  return normalized;
};

export const normalizeElectronicSignatureStampAutoLayout = (
  value: unknown,
): ElectronicSignatureStampAutoLayoutV1 => {
  const source = asRecord(value);
  const defaults = ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS;
  if (
    !source || !exactKeys(source, [
      "schemaVersion", "pageTarget", "coordinateSpace", "columns", "widthBp",
      "heightBp", "gapBp", "marginBp", "maxSigners",
    ]) ||
    source.schemaVersion !== defaults.schemaVersion ||
    source.pageTarget !== defaults.pageTarget ||
    source.coordinateSpace !== defaults.coordinateSpace ||
    source.columns !== defaults.columns || source.widthBp !== defaults.widthBp ||
    source.heightBp !== defaults.heightBp || source.gapBp !== defaults.gapBp ||
    source.marginBp !== defaults.marginBp || source.maxSigners !== defaults.maxSigners
  ) throw new Error("A distribuição automática do carimbo não corresponde ao contrato global.");
  return { ...defaults };
};

export const deriveAutomaticSignatureStampPlacements = (
  layout: ElectronicSignatureStampAutoLayoutV1,
  signerCount: number,
): readonly ElectronicSignatureStampPlacement[] => {
  const normalized = normalizeElectronicSignatureStampAutoLayout(layout);
  if (
    !Number.isInteger(signerCount) || signerCount < 1 ||
    signerCount > normalized.maxSigners
  ) throw new Error("A quantidade de signatários excede a capacidade segura do modelo global.");
  const columns = Math.min(normalized.columns, signerCount);
  const rows = Math.ceil(signerCount / columns);
  const gridWidth = columns * normalized.widthBp + (columns - 1) * normalized.gapBp;
  const gridHeight = rows * normalized.heightBp + (rows - 1) * normalized.gapBp;
  if (
    gridWidth + normalized.marginBp * 2 > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE ||
    gridHeight + normalized.marginBp * 2 > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE
  ) throw new Error("A distribuição automática não cabe na última página do documento.");
  const startX = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - normalized.marginBp - gridWidth;
  const startY = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - normalized.marginBp - gridHeight;
  return Array.from({ length: signerCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      pageTarget: "LAST_PAGE",
      coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
      xBp: startX + column * (normalized.widthBp + normalized.gapBp),
      yBp: startY + row * (normalized.heightBp + normalized.gapBp),
      widthBp: normalized.widthBp,
      heightBp: normalized.heightBp,
    };
  });
};
