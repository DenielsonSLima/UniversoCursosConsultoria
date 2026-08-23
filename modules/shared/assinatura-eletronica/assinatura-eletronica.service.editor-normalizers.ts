import type {
  ElectronicSignatureDocumentEditor,
  ElectronicSignatureStampContentLayout,
  ElectronicSignatureStampEditor,
  ElectronicSignatureStampRole,
  ElectronicSignatureStampSlot,
} from "./assinatura-eletronica.contract";
import {
  ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS,
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_ROLES,
} from "./assinatura-eletronica.contract";
import {
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
  signatureStampPlacementsOverlap,
} from "./signature-stamp-placement";
import {
  createDefaultElectronicSignatureStampTemplate,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
} from "./signature-stamp-template";
import {
  asRecord,
  assertExactKeys,
  normalizeAssetId,
  requiredInteger,
} from "./assinatura-eletronica.service.shared";
import {
  normalizeLegalSection,
  normalizeWatermark,
} from "./assinatura-eletronica.service.preview-normalizers";

const legacySignatureStamp = (
  assetId: string | null = null,
): ElectronicSignatureStampEditor => ({
  enabled: false,
  canonicalLabel: ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  assetId,
  template: createDefaultElectronicSignatureStampTemplate(),
  autoLayout: { ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS },
});

const normalizeStampContentLayout = (
  value: unknown,
): ElectronicSignatureStampContentLayout => {
  const source = asRecord(
    value,
    "Os ajustes internos do carimbo de assinatura são inválidos.",
  );
  assertExactKeys(
    source,
    ["sealScalePercent", "lineSpacingPercent", "qrScalePercent"],
    "Os ajustes internos do carimbo de assinatura",
  );

  const entries = [
    ["sealScalePercent", "O tamanho do selo"],
    ["lineSpacingPercent", "O espaçamento das informações"],
    ["qrScalePercent", "O tamanho do QR individual"],
  ] as const;
  const normalized = {} as Record<(typeof entries)[number][0], number>;

  entries.forEach(([key, label]) => {
    const number = requiredInteger(source[key], label);
    const limits = ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS[key];
    if (
      number < limits.min || number > limits.max || number % limits.step !== 0
    ) {
      throw new Error(`${label} está fora do intervalo autorizado.`);
    }
    normalized[key] = number;
  });

  return normalized;
};

const normalizeStampSlot = (
  value: unknown,
  index: number,
): ElectronicSignatureStampSlot => {
  const role =
    ELECTRONIC_SIGNATURE_STAMP_ROLES[index] as ElectronicSignatureStampRole;
  const source = asRecord(
    value,
    `O posicionamento do carimbo de ${role.toLowerCase()} é inválido.`,
  );
  assertExactKeys(
    source,
    [
      "role",
      "pageTarget",
      "coordinateSpace",
      "xBp",
      "yBp",
      "widthBp",
      "heightBp",
    ],
    `O posicionamento do carimbo de ${role.toLowerCase()}`,
  );
  if (source.role !== role) {
    throw new Error(
      "A ordem dos papéis do carimbo não corresponde ao contrato autorizado.",
    );
  }
  if (source.pageTarget !== "LAST_PAGE") {
    throw new Error(
      `O carimbo de ${role.toLowerCase()} deve permanecer na última página do documento original.`,
    );
  }
  if (source.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1") {
    throw new Error(
      `O sistema de coordenadas do carimbo de ${role.toLowerCase()} não foi reconhecido.`,
    );
  }
  const xBp = requiredInteger(
    source.xBp,
    `A posição horizontal do carimbo de ${role.toLowerCase()}`,
  );
  const yBp = requiredInteger(
    source.yBp,
    `A posição vertical do carimbo de ${role.toLowerCase()}`,
  );
  const widthBp = requiredInteger(
    source.widthBp,
    `A largura do carimbo de ${role.toLowerCase()}`,
  );
  const heightBp = requiredInteger(
    source.heightBp,
    `A altura do carimbo de ${role.toLowerCase()}`,
  );
  if (
    widthBp < SIGNATURE_STAMP_MIN_WIDTH_BP ||
    widthBp > SIGNATURE_STAMP_MAX_WIDTH_BP ||
    heightBp < SIGNATURE_STAMP_MIN_HEIGHT_BP ||
    heightBp > SIGNATURE_STAMP_MAX_HEIGHT_BP ||
    xBp < 0 ||
    yBp < 0 ||
    xBp + widthBp > 100_000 ||
    yBp + heightBp > 100_000
  ) {
    throw new Error(
      `O posicionamento do carimbo de ${role.toLowerCase()} está fora da página.`,
    );
  }
  return {
    role,
    pageTarget: "LAST_PAGE",
    coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
    xBp,
    yBp,
    widthBp,
    heightBp,
  };
};

const normalizeSignatureStamp = (
  value: unknown,
  schemaVersion: 3 | 4,
): ElectronicSignatureStampEditor => {
  const source = asRecord(
    value,
    "A configuração do carimbo de assinatura é inválida.",
  );
  assertExactKeys(
    source,
    schemaVersion === 4
      ? [
        "enabled",
        "canonicalLabel",
        "assetId",
        "layout",
        "contentLayout",
        "slots",
      ]
      : ["enabled", "canonicalLabel", "assetId", "layout", "slots"],
    "A configuração do carimbo de assinatura",
  );
  if (source.enabled !== false) {
    throw new Error(
      "O carimbo permanece desabilitado até a aprovação jurídica.",
    );
  }
  if (source.canonicalLabel !== ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL) {
    throw new Error("O texto canônico do carimbo não pode ser alterado.");
  }
  if (source.layout !== "HORIZONTAL" && source.layout !== "COMPACT") {
    throw new Error("O layout do carimbo não foi reconhecido.");
  }
  const assetId = source.assetId === null
    ? null
    : normalizeAssetId(source.assetId, "O ativo visual do carimbo");
  if (
    !Array.isArray(source.slots) ||
    source.slots.length !== ELECTRONIC_SIGNATURE_STAMP_ROLES.length
  ) {
    throw new Error(
      "O carimbo exige os posicionamentos de professor e coordenador.",
    );
  }
  const slots = source.slots.map(normalizeStampSlot) as [
    ElectronicSignatureStampSlot,
    ElectronicSignatureStampSlot,
  ];
  if (signatureStampPlacementsOverlap(slots[0], slots[1])) {
    throw new Error(
      "Os carimbos de professor e coordenador não podem se sobrepor.",
    );
  }
  if (schemaVersion === 4) normalizeStampContentLayout(source.contentLayout);
  return legacySignatureStamp(assetId);
};

const normalizeGlobalSignatureStamp = (
  value: unknown,
): ElectronicSignatureStampEditor => {
  const source = asRecord(
    value,
    "A configuração do template global do carimbo é inválida.",
  );
  assertExactKeys(
    source,
    ["enabled", "canonicalLabel", "assetId", "template", "autoLayout"],
    "A configuração do template global do carimbo",
  );
  if (source.enabled !== false) {
    throw new Error(
      "O carimbo permanece desabilitado até a aprovação jurídica.",
    );
  }
  if (source.canonicalLabel !== ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL) {
    throw new Error("O texto canônico do carimbo não pode ser alterado.");
  }
  return {
    enabled: false,
    canonicalLabel: ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
    assetId: source.assetId === null
      ? null
      : normalizeAssetId(source.assetId, "O ativo visual do carimbo"),
    template: normalizeElectronicSignatureStampTemplate(source.template, {
      allowLegacySignerNameLabel: true,
    }),
    autoLayout: normalizeElectronicSignatureStampAutoLayout(source.autoLayout),
  };
};

export const normalizeEditor = (
  value: unknown,
): ElectronicSignatureDocumentEditor => {
  const source = asRecord(
    value,
    "O editor do comprovante retornou um formato inválido.",
  );
  const schemaVersion = requiredInteger(
    source.schemaVersion,
    "A versão do editor",
  );
  if (
    schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 &&
    schemaVersion !== 4 && schemaVersion !== 5
  ) {
    throw new Error("A versão do editor do comprovante não é suportada.");
  }
  assertExactKeys(
    source,
    schemaVersion >= 3
      ? ["schemaVersion", "pages", "signatureStamp"]
      : ["schemaVersion", "pages"],
    "O editor do comprovante",
  );
  if (!Array.isArray(source.pages) || source.pages.length !== 2) {
    throw new Error(
      "O editor do comprovante deve conter exatamente duas páginas.",
    );
  }
  const page1 = asRecord(source.pages[0], "A página 1 do editor é inválida.");
  const page2 = asRecord(source.pages[1], "A página 2 do editor é inválida.");
  assertExactKeys(
    page1,
    schemaVersion >= 4
      ? ["page", "template"]
      : ["page", "template", "watermark"],
    "A página 1 do editor",
  );
  assertExactKeys(
    page2,
    schemaVersion >= 4
      ? ["page", "template", "sections"]
      : ["page", "template", "sections", "watermark"],
    "A página 2 do editor",
  );
  if (page1.page !== 1 || page1.template !== "EVIDENCE") {
    throw new Error("A página 1 deve usar o modelo canônico de evidências.");
  }
  if (page2.page !== 2 || page2.template !== "LEGAL_TEXTS") {
    throw new Error(
      "A página 2 deve usar o modelo canônico de textos jurídicos.",
    );
  }
  if (
    !Array.isArray(page2.sections) ||
    page2.sections.length !== ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS.length
  ) {
    throw new Error(
      "A página 2 deve conter os cinco blocos jurídicos canônicos.",
    );
  }
  const sections = page2.sections.map(normalizeLegalSection);
  if (
    sections.reduce((total, section) => total + section.body.length, 0) >
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionsBodyTotal
  ) {
    throw new Error(
      "O conjunto de textos jurídicos excedeu a área segura do comprovante.",
    );
  }
  if (schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3) {
    normalizeWatermark(page1.watermark, 1, schemaVersion);
    normalizeWatermark(page2.watermark, 2, schemaVersion);
  }
  return {
    schemaVersion: 5,
    pages: [
      { page: 1, template: "EVIDENCE" },
      { page: 2, template: "LEGAL_TEXTS", sections },
    ],
    signatureStamp: schemaVersion === 5
      ? normalizeGlobalSignatureStamp(source.signatureStamp)
      : schemaVersion === 3 || schemaVersion === 4
      ? normalizeSignatureStamp(source.signatureStamp, schemaVersion)
      : legacySignatureStamp(),
  };
};
