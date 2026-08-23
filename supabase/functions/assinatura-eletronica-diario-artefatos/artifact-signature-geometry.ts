import type { AppliedSignatureStamp } from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  type ElectronicSignatureStampAutoLayoutV1,
  type ElectronicSignatureStampContentLayout,
  type ElectronicSignatureStampTemplateV1,
} from "../../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
} from "../../../modules/shared/assinatura-eletronica/signature-stamp-template.ts";
import {
  SIGNATURE_STAMP_COORDINATE_SCALE,
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
} from "../../../modules/shared/assinatura-eletronica/signature-stamp-placement.ts";
import { asRecord } from "./artifact-contracts.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const exactKeys = (
  source: Record<string, unknown>,
  allowed: readonly string[],
) =>
  Object.keys(source).length === allowed.length &&
  Object.keys(source).every((key) => allowed.includes(key));

const prepareFrozenContentLayout = (
  value: unknown,
): ElectronicSignatureStampContentLayout => {
  const source = asRecord(value);
  const keys = [
    "sealScalePercent",
    "lineSpacingPercent",
    "qrScalePercent",
  ] as const;
  if (!source || !exactKeys(source, keys)) {
    throw new Error("A distribuição interna congelada do carimbo é inválida.");
  }
  const result = {} as Record<
    typeof keys[number],
    number
  >;
  for (const key of keys) {
    const candidate = source[key];
    const limit = ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS[key];
    if (
      !Number.isInteger(candidate) || Number(candidate) < limit.min ||
      Number(candidate) > limit.max || Number(candidate) % limit.step !== 0
    ) {
      throw new Error(
        `O ajuste congelado ${key} do carimbo é inválido.`,
      );
    }
    result[key] = Number(candidate);
  }
  return result as ElectronicSignatureStampContentLayout;
};

export const normalizeFrozenSignatureGeometry = (
  value: unknown,
): {
  schemaVersion: 1 | 2 | 3;
  layout: "HORIZONTAL" | "COMPACT" | null;
  contentLayout: ElectronicSignatureStampContentLayout | null;
  template: ElectronicSignatureStampTemplateV1 | null;
  autoLayout: ElectronicSignatureStampAutoLayoutV1 | null;
  slots: readonly AppliedSignatureStamp["placement"][] | null;
} => {
  const geometry = asRecord(value);
  const schemaVersion = geometry?.schemaVersion;
  const expectedKeys = schemaVersion === 1
    ? [
      "assetId",
      "assetSnapshot",
      "coordinateSpace",
      "layout",
      "schemaVersion",
      "slots",
    ]
    : schemaVersion === 2
    ? [
      "assetId",
      "assetSnapshot",
      "contentLayout",
      "coordinateSpace",
      "layout",
      "schemaVersion",
      "slots",
    ]
    : [
      "assetId",
      "assetSnapshot",
      "autoLayout",
      "coordinateSpace",
      "schemaVersion",
      "template",
    ];
  if (schemaVersion === 3) {
    if (
      !geometry || !exactKeys(geometry, expectedKeys) ||
      geometry.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
      typeof geometry.assetId !== "string" ||
      !UUID_PATTERN.test(geometry.assetId) ||
      asRecord(geometry.assetSnapshot) === null
    ) {
      throw new Error("A geometria global congelada do carimbo é inválida.");
    }
    return {
      schemaVersion: 3,
      layout: null,
      contentLayout: null,
      template: normalizeElectronicSignatureStampTemplate(geometry.template, {
        allowLegacySignerNameLabel: true,
      }),
      autoLayout: normalizeElectronicSignatureStampAutoLayout(
        geometry.autoLayout,
      ),
      slots: null,
    };
  }
  const instances = geometry?.slots;
  if (
    !geometry ||
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    !exactKeys(geometry, expectedKeys) ||
    geometry.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
    (geometry.layout !== "HORIZONTAL" && geometry.layout !== "COMPACT") ||
    !Array.isArray(instances) || instances.length !== 2 ||
    (geometry.assetId !== null &&
      (typeof geometry.assetId !== "string" ||
        !UUID_PATTERN.test(geometry.assetId))) ||
    (geometry.assetSnapshot !== null &&
      asRecord(geometry.assetSnapshot) === null)
  ) throw new Error("A geometria congelada dos carimbos é inválida.");
  const roles = ["PROFESSOR", "COORDENADOR"] as const;
  const slots = instances.map((candidate, index) => {
    const slot = asRecord(candidate);
    const expectedInstanceKeys = [
      "coordinateSpace",
      "heightBp",
      "pageTarget",
      "role",
      "widthBp",
      "xBp",
      "yBp",
    ];
    if (
      !slot ||
      !exactKeys(slot, expectedInstanceKeys) ||
      slot.role !== roles[index] ||
      slot.pageTarget !== "LAST_PAGE" ||
      slot.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
      !Number.isInteger(slot.xBp) || !Number.isInteger(slot.yBp) ||
      !Number.isInteger(slot.widthBp) || !Number.isInteger(slot.heightBp)
    ) throw new Error("A ordem dos carimbos congelados é inválida.");
    const placement = {
      coordinateSpace: "PAGE_TOP_LEFT_BP_V1" as const,
      xBp: Number(slot.xBp),
      yBp: Number(slot.yBp),
      widthBp: Number(slot.widthBp),
      heightBp: Number(slot.heightBp),
    };
    if (
      placement.widthBp < SIGNATURE_STAMP_MIN_WIDTH_BP ||
      placement.widthBp > SIGNATURE_STAMP_MAX_WIDTH_BP ||
      placement.heightBp < SIGNATURE_STAMP_MIN_HEIGHT_BP ||
      placement.heightBp > SIGNATURE_STAMP_MAX_HEIGHT_BP ||
      placement.xBp < 0 || placement.yBp < 0 ||
      placement.xBp + placement.widthBp > SIGNATURE_STAMP_COORDINATE_SCALE ||
      placement.yBp + placement.heightBp > SIGNATURE_STAMP_COORDINATE_SCALE
    ) {
      throw new Error("As coordenadas dos carimbos congelados são inválidas.");
    }
    return placement;
  }) as AppliedSignatureStamp["placement"][];
  const [first, second] = slots as [
    AppliedSignatureStamp["placement"],
    AppliedSignatureStamp["placement"],
  ];
  if (
    first.xBp < second.xBp + second.widthBp &&
    first.xBp + first.widthBp > second.xBp &&
    first.yBp < second.yBp + second.heightBp &&
    first.yBp + first.heightBp > second.yBp
  ) throw new Error("Os carimbos congelados não podem se sobrepor.");
  return {
    schemaVersion: schemaVersion as 1 | 2,
    layout: geometry.layout as "HORIZONTAL" | "COMPACT",
    contentLayout: schemaVersion === 1
      ? { ...ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS }
      : prepareFrozenContentLayout(geometry.contentLayout),
    template: null,
    autoLayout: null,
    slots,
  };
};
