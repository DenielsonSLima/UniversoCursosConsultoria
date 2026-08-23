import {
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_ROLES,
  type ElectronicSignatureStampContentLayout,
  type ElectronicSignatureStampEditor,
  type ElectronicSignatureStampRole,
  type ElectronicSignatureStampSlot,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
  signatureStampPlacementsOverlap,
} from "../../../shared/assinatura-eletronica/signature-stamp-placement.ts";
import {
  createDefaultElectronicSignatureStampTemplate,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
} from "../../../shared/assinatura-eletronica/signature-stamp-template.ts";
import {
  ASSET_ID_PATTERN,
  asEditorRecord,
  assertExactEditorKeys,
} from "./comprovante-assinatura-eletronica.validation-helpers.ts";

export const legacyPreparedSignatureStamp = (
  assetId: string | null = null,
): ElectronicSignatureStampEditor => ({
  enabled: false,
  canonicalLabel: ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  assetId,
  template: createDefaultElectronicSignatureStampTemplate(),
  autoLayout: { ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS },
});

const prepareSignatureStampContentLayout = (
  value: unknown,
): ElectronicSignatureStampContentLayout => {
  const source = asEditorRecord(
    value,
    "Os ajustes internos do carimbo de assinatura",
  );
  assertExactEditorKeys(
    source,
    ["sealScalePercent", "lineSpacingPercent", "qrScalePercent"],
    "Os ajustes internos do carimbo de assinatura",
  );

  const entries = [
    ["sealScalePercent", "O tamanho do selo"],
    ["lineSpacingPercent", "O espacamento das informacoes"],
    ["qrScalePercent", "O tamanho do QR individual"],
  ] as const;
  const normalized = {} as Record<(typeof entries)[number][0], number>;

  entries.forEach(([key, label]) => {
    const number = Number(source[key]);
    const limits = ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS[key];
    if (
      !Number.isInteger(number) ||
      number < limits.min ||
      number > limits.max ||
      number % limits.step !== 0
    ) {
      throw new Error(`${label} esta fora do intervalo autorizado.`);
    }
    normalized[key] = number;
  });

  return normalized;
};

export const prepareSignatureStamp = (
  value: unknown,
  schemaVersion: 3 | 4,
): string | null => {
  const source = asEditorRecord(
    value,
    "A configuracao do carimbo de assinatura",
  );
  assertExactEditorKeys(
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
    "A configuracao do carimbo de assinatura",
  );
  if (source.enabled !== false) {
    throw new Error(
      "O carimbo permanece desabilitado ate a aprovacao juridica.",
    );
  }
  if (source.canonicalLabel !== ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL) {
    throw new Error("O texto canonico do carimbo nao pode ser alterado.");
  }
  if (source.layout !== "HORIZONTAL" && source.layout !== "COMPACT") {
    throw new Error("O layout do carimbo nao foi reconhecido.");
  }
  const assetId = source.assetId === null ? null : String(source.assetId || "");
  if (assetId !== null && !ASSET_ID_PATTERN.test(assetId)) {
    throw new Error("O ativo visual do carimbo nao possui formato autorizado.");
  }
  if (schemaVersion === 4) {
    prepareSignatureStampContentLayout(source.contentLayout);
  }
  if (
    !Array.isArray(source.slots) ||
    source.slots.length !== ELECTRONIC_SIGNATURE_STAMP_ROLES.length
  ) {
    throw new Error(
      "O carimbo exige os posicionamentos de professor e coordenador.",
    );
  }
  const slots = source.slots.map(
    (valueSlot, index): ElectronicSignatureStampSlot => {
      const role =
        ELECTRONIC_SIGNATURE_STAMP_ROLES[index] as ElectronicSignatureStampRole;
      const slot = asEditorRecord(
        valueSlot,
        `O posicionamento do carimbo de ${role.toLowerCase()}`,
      );
      assertExactEditorKeys(
        slot,
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
      const xBp = Number(slot.xBp);
      const yBp = Number(slot.yBp);
      const widthBp = Number(slot.widthBp);
      const heightBp = Number(slot.heightBp);
      if (
        slot.role !== role ||
        slot.pageTarget !== "LAST_PAGE" ||
        slot.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
        !Number.isInteger(xBp) ||
        !Number.isInteger(yBp) ||
        !Number.isInteger(widthBp) ||
        !Number.isInteger(heightBp) ||
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
          `O posicionamento do carimbo de ${role.toLowerCase()} esta fora da pagina original.`,
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
    },
  ) as [ElectronicSignatureStampSlot, ElectronicSignatureStampSlot];
  if (signatureStampPlacementsOverlap(slots[0], slots[1])) {
    throw new Error(
      "Os carimbos de professor e coordenador nao podem se sobrepor.",
    );
  }
  // A validação acima protege a leitura do histórico. Em seguida, v5 aplica
  // o template global a cada participante, sem carregar esses papéis visuais.
  void slots;
  return assetId;
};

export const prepareGlobalSignatureStamp = (
  value: unknown,
): ElectronicSignatureStampEditor => {
  const source = asEditorRecord(
    value,
    "A configuracao global do carimbo de assinatura",
  );
  assertExactEditorKeys(
    source,
    ["enabled", "canonicalLabel", "assetId", "template", "autoLayout"],
    "A configuracao global do carimbo de assinatura",
  );
  if (source.enabled !== false) {
    throw new Error(
      "O carimbo permanece desabilitado ate a aprovacao juridica.",
    );
  }
  if (source.canonicalLabel !== ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL) {
    throw new Error("O texto canonico do carimbo nao pode ser alterado.");
  }
  const assetId = source.assetId === null ? null : String(source.assetId || "");
  if (assetId !== null && !ASSET_ID_PATTERN.test(assetId)) {
    throw new Error("O ativo visual do carimbo nao possui formato autorizado.");
  }
  return {
    enabled: false,
    canonicalLabel: ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
    assetId,
    template: normalizeElectronicSignatureStampTemplate(source.template, {
      allowLegacySignerNameLabel: true,
    }),
    autoLayout: normalizeElectronicSignatureStampAutoLayout(source.autoLayout),
  };
};

/** Normaliza snapshots v1-v4 somente para leitura e sempre produz o schema v5. */

