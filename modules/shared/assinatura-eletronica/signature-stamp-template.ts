import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  type ElectronicSignatureStampAutoLayoutV1,
  type ElectronicSignatureStampPlacement,
  type ElectronicSignatureStampTemplateBinding,
  type ElectronicSignatureStampTemplateElement,
  type ElectronicSignatureStampTemplateElementId,
  type ElectronicSignatureStampTemplateV1,
} from "./assinatura-eletronica.contract.ts";

export const SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE = 100_000;

export const SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS = [
  { id: "seal", kind: "IMAGE", binding: "STAMP_ASSET", label: null },
  { id: "signerRole", kind: "TEXT", binding: "SIGNER_ROLE", label: "" },
  { id: "title", kind: "TEXT", binding: "DISPLAY_TITLE", label: "" },
  {
    id: "signerName",
    kind: "TEXT",
    binding: "SIGNER_NAME",
    label: "Assinante: ",
  },
  { id: "signedAt", kind: "TEXT", binding: "SIGNED_AT", label: "Data: " },
  {
    id: "signerCpfMasked",
    kind: "TEXT",
    binding: "SIGNER_CPF_MASKED",
    label: "CPF: ",
  },
  {
    id: "signatureHash",
    kind: "TEXT",
    binding: "SIGNATURE_HASH",
    label: "Hash SHA-256: ",
  },
  {
    id: "verificationCode",
    kind: "TEXT",
    binding: "VERIFICATION_CODE",
    label: "Código de verificação: ",
  },
  {
    id: "verificationUrl",
    kind: "TEXT",
    binding: "VERIFICATION_URL",
    label: "Verifique em: ",
  },
  {
    id: "verificationQr",
    kind: "QR",
    binding: "VERIFICATION_URL",
    label: null,
  },
  { id: "divider", kind: "LINE", binding: "DECORATIVE", label: null },
] as const satisfies readonly {
  id: ElectronicSignatureStampTemplateElementId;
  kind: ElectronicSignatureStampTemplateElement["kind"];
  binding: ElectronicSignatureStampTemplateBinding;
  label: string | null;
}[];

const TEMPLATE_ELEMENT_NAMES: Record<
  ElectronicSignatureStampTemplateElementId,
  string
> = {
  seal: "Imagem do carimbo",
  signerRole: "Papel do signatário",
  title: "Título canônico",
  signerName: "Nome do signatário",
  signedAt: "Data e hora probatória",
  signerCpfMasked: "CPF mascarado",
  signatureHash: "Hash individual",
  verificationCode: "Código de verificação",
  verificationUrl: "URL de verificação",
  verificationQr: "QR individual",
  divider: "Linha decorativa",
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const exactKeys = (
  source: Record<string, unknown>,
  keys: readonly string[],
) => {
  const actual = Object.keys(source).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const integer = (value: unknown) => (
  typeof value === "number" && Number.isInteger(value) ? value : null
);

const hasCanonicalStyle = (
  candidate: Record<string, unknown>,
  canonical: Record<string, unknown>,
) => (
  exactKeys(candidate, Object.keys(canonical)) &&
  Object.entries(canonical).every(([key, value]) => candidate[key] === value)
);

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

export const getSignatureStampTemplateElementName = (
  id: ElectronicSignatureStampTemplateElementId,
) => TEMPLATE_ELEMENT_NAMES[id];

export const cloneElectronicSignatureStampTemplate = (
  template: ElectronicSignatureStampTemplateV1,
): ElectronicSignatureStampTemplateV1 => ({
  schemaVersion: 1,
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
  elements: template.elements.map((element) => ({
    ...element,
    style: { ...element.style },
  })) as ElectronicSignatureStampTemplateElement[],
});

export const createDefaultElectronicSignatureStampTemplate = () => ({
  schemaVersion: 1,
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
  elements: [
    {
      id: "seal",
      kind: "IMAGE",
      binding: "STAMP_ASSET",
      xBp: 2_000,
      yBp: 18_000,
      widthBp: 19_000,
      heightBp: 64_000,
      style: { fit: "CONTAIN", opacityBp: 100_000 },
    },
    {
      id: "signerRole",
      kind: "TEXT",
      binding: "SIGNER_ROLE",
      xBp: 23_000,
      yBp: 3_000,
      widthBp: 48_000,
      heightBp: 9_000,
      style: {
        font: "HELVETICA_BOLD",
        fontSizeBp: 9_000,
        color: "#071A33",
        align: "LEFT",
        label: "",
      },
    },
    {
      id: "title",
      kind: "TEXT",
      binding: "DISPLAY_TITLE",
      xBp: 23_000,
      yBp: 14_000,
      widthBp: 48_000,
      heightBp: 10_000,
      style: {
        font: "HELVETICA_BOLD",
        fontSizeBp: 10_000,
        color: "#071A33",
        align: "LEFT",
        label: "",
      },
    },
    {
      id: "signerName",
      kind: "TEXT",
      binding: "SIGNER_NAME",
      xBp: 23_000,
      yBp: 29_000,
      widthBp: 48_000,
      heightBp: 9_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 7_500,
        color: "#071A33",
        align: "LEFT",
        label: "Assinante: ",
      },
    },
    {
      id: "signedAt",
      kind: "TEXT",
      binding: "SIGNED_AT",
      xBp: 23_000,
      yBp: 40_000,
      widthBp: 48_000,
      heightBp: 8_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 6_500,
        color: "#071A33",
        align: "LEFT",
        label: "Data: ",
      },
    },
    {
      id: "signerCpfMasked",
      kind: "TEXT",
      binding: "SIGNER_CPF_MASKED",
      xBp: 23_000,
      yBp: 50_000,
      widthBp: 48_000,
      heightBp: 8_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 6_500,
        color: "#071A33",
        align: "LEFT",
        label: "CPF: ",
      },
    },
    {
      id: "signatureHash",
      kind: "TEXT",
      binding: "SIGNATURE_HASH",
      xBp: 23_000,
      yBp: 59_000,
      widthBp: 48_000,
      heightBp: 14_000,
      style: {
        font: "COURIER",
        fontSizeBp: 5_500,
        color: "#071A33",
        align: "LEFT",
        label: "Hash SHA-256: ",
      },
    },
    {
      id: "verificationCode",
      kind: "TEXT",
      binding: "VERIFICATION_CODE",
      xBp: 23_000,
      yBp: 74_000,
      widthBp: 48_000,
      heightBp: 7_000,
      style: {
        font: "COURIER",
        fontSizeBp: 6_000,
        color: "#071A33",
        align: "LEFT",
        label: "Código de verificação: ",
      },
    },
    {
      id: "verificationUrl",
      kind: "TEXT",
      binding: "VERIFICATION_URL",
      xBp: 23_000,
      yBp: 83_000,
      widthBp: 48_000,
      heightBp: 14_000,
      style: {
        font: "HELVETICA",
        fontSizeBp: 5_500,
        color: "#071A33",
        align: "LEFT",
        label: "Verifique em: ",
      },
    },
    {
      id: "verificationQr",
      kind: "QR",
      binding: "VERIFICATION_URL",
      xBp: 71_000,
      yBp: 29_000,
      widthBp: 29_000,
      heightBp: 29_000,
      style: { quietZoneModules: 4 },
    },
    {
      id: "divider",
      kind: "LINE",
      binding: "DECORATIVE",
      xBp: 23_000,
      yBp: 26_000,
      widthBp: 48_000,
      heightBp: 1_000,
      style: { color: "#071A33", widthBp: 500 },
    },
  ],
} as const satisfies ElectronicSignatureStampTemplateV1);

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

export const clampSignatureStampTemplateElement = (
  element: ElectronicSignatureStampTemplateElement,
): ElectronicSignatureStampTemplateElement => {
  const dimensions = dimensionsFor(element);
  const maximumWidth = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE;
  const maximumHeight = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE;
  let widthBp = clampInteger(
    element.widthBp,
    dimensions.minWidth,
    maximumWidth,
  );
  let heightBp = clampInteger(
    element.heightBp,
    dimensions.minHeight,
    maximumHeight,
  );
  if (dimensions.square) {
    const size = clampInteger(
      Math.min(widthBp, heightBp),
      dimensions.minWidth,
      40_000,
    );
    widthBp = size;
    heightBp = size;
  }
  const xBp = clampInteger(
    element.xBp,
    0,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - widthBp,
  );
  const yBp = clampInteger(
    element.yBp,
    0,
    SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - heightBp,
  );
  return { ...element, xBp, yBp, widthBp, heightBp };
};

export const moveSignatureStampTemplateElement = (
  element: ElectronicSignatureStampTemplateElement,
  deltaXBp: number,
  deltaYBp: number,
) =>
  clampSignatureStampTemplateElement({
    ...element,
    xBp: element.xBp + deltaXBp,
    yBp: element.yBp + deltaYBp,
  });

export const resizeSignatureStampTemplateElement = (
  element: ElectronicSignatureStampTemplateElement,
  widthBp: number,
  heightBp: number,
) => clampSignatureStampTemplateElement({ ...element, widthBp, heightBp });

export const isSignatureStampTemplateQrClear = (
  template: ElectronicSignatureStampTemplateV1,
) => {
  const qr = template.elements.find((element) =>
    element.id === "verificationQr"
  );
  if (!qr) return false;
  return !template.elements.some((element) => (
    element.id !== "verificationQr" && templateElementsOverlap(qr, element)
  ));
};

export const normalizeElectronicSignatureStampTemplate = (
  value: unknown,
): ElectronicSignatureStampTemplateV1 => {
  const source = asRecord(value);
  if (
    !source ||
    !exactKeys(source, ["schemaVersion", "coordinateSpace", "elements"]) ||
    source.schemaVersion !== 1 ||
    source.coordinateSpace !== "STAMP_TOP_LEFT_BP_V1" ||
    !Array.isArray(source.elements) ||
    source.elements.length !== SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS.length
  ) {
    throw new Error("O template global do carimbo eletrônico é inválido.");
  }

  const canonicalElements = createDefaultElectronicSignatureStampTemplate()
    .elements;
  const elements = source.elements.map((candidate, index) => {
    const sourceElement = asRecord(candidate);
    const spec = SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS[index];
    const canonicalElement = canonicalElements[index];
    if (
      !canonicalElement || !sourceElement || !exactKeys(sourceElement, [
        "id",
        "kind",
        "binding",
        "xBp",
        "yBp",
        "widthBp",
        "heightBp",
        "style",
      ]) ||
      sourceElement.id !== spec.id || sourceElement.kind !== spec.kind ||
      sourceElement.binding !== spec.binding
    ) {
      throw new Error(`O elemento ${index + 1} do template global é inválido.`);
    }
    const xBp = integer(sourceElement.xBp);
    const yBp = integer(sourceElement.yBp);
    const widthBp = integer(sourceElement.widthBp);
    const heightBp = integer(sourceElement.heightBp);
    if (
      xBp === null || yBp === null || widthBp === null || heightBp === null ||
      xBp < 0 || yBp < 0 || widthBp <= 0 || heightBp <= 0 ||
      xBp + widthBp > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE ||
      yBp + heightBp > SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE
    ) {
      throw new Error(
        `As coordenadas de ${spec.id} no template global são inválidas.`,
      );
    }
    const style = asRecord(sourceElement.style);
    if (!style) {
      throw new Error(`O estilo de ${spec.id} no template global é inválido.`);
    }

    if (!hasCanonicalStyle(style, canonicalElement.style)) {
      throw new Error(
        `O estilo de ${spec.id} no template global é imutável.`,
      );
    }
    if (
      (spec.kind === "IMAGE" && (widthBp < 5_000 || heightBp < 5_000)) ||
      (spec.kind === "QR" &&
        (widthBp !== heightBp || widthBp < 29_000 || widthBp > 40_000)) ||
      (spec.kind === "LINE" && widthBp < 5_000)
    ) {
      throw new Error(
        `A geometria de ${spec.id} no template global é inválida.`,
      );
    }
    return {
      id: spec.id,
      kind: spec.kind,
      binding: spec.binding,
      xBp,
      yBp,
      widthBp,
      heightBp,
      style: { ...style },
    } as ElectronicSignatureStampTemplateElement;
  });

  const normalized: ElectronicSignatureStampTemplateV1 = {
    schemaVersion: 1,
    coordinateSpace: "STAMP_TOP_LEFT_BP_V1",
    elements,
  };
  if (!isSignatureStampTemplateQrClear(normalized)) {
    throw new Error(
      "A quiet zone do QR individual se sobrepõe a outro elemento do template.",
    );
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
      "schemaVersion",
      "pageTarget",
      "coordinateSpace",
      "columns",
      "widthBp",
      "heightBp",
      "gapBp",
      "marginBp",
      "maxSigners",
    ]) ||
    source.schemaVersion !== defaults.schemaVersion ||
    source.pageTarget !== defaults.pageTarget ||
    source.coordinateSpace !== defaults.coordinateSpace ||
    source.columns !== defaults.columns ||
    source.widthBp !== defaults.widthBp ||
    source.heightBp !== defaults.heightBp || source.gapBp !== defaults.gapBp ||
    source.marginBp !== defaults.marginBp ||
    source.maxSigners !== defaults.maxSigners
  ) {
    throw new Error(
      "A distribuição automática do carimbo não corresponde ao contrato global.",
    );
  }
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
  ) {
    throw new Error(
      "A quantidade de signatários excede a capacidade segura do modelo global.",
    );
  }
  const columns = Math.min(normalized.columns, signerCount);
  const rows = Math.ceil(signerCount / columns);
  const gridWidth = columns * normalized.widthBp +
    (columns - 1) * normalized.gapBp;
  const gridHeight = rows * normalized.heightBp + (rows - 1) * normalized.gapBp;
  if (
    gridWidth + normalized.marginBp * 2 >
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE ||
    gridHeight + normalized.marginBp * 2 >
      SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE
  ) {
    throw new Error(
      "A distribuição automática não cabe na última página do documento.",
    );
  }
  const startX = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE -
    normalized.marginBp - gridWidth;
  const startY = SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE -
    normalized.marginBp - gridHeight;
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
