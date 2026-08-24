import {
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
  type ElectronicSignaturePageWatermark,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  ASSET_ID_PATTERN,
  asEditorRecord,
  assertEditorText,
  assertExactEditorKeys,
} from "./comprovante-assinatura-eletronica.validation-helpers.ts";

export const prepareWatermark = (
  value: unknown,
  page: 1 | 2,
  schemaVersion: 1 | 2 | 3,
): ElectronicSignaturePageWatermark => {
  const source = asEditorRecord(value, `A marca-d'agua da pagina ${page}`);
  assertExactEditorKeys(
    source,
    schemaVersion === 1
      ? [
        "enabled",
        "source",
        "label",
        "opacity",
        "scalePercent",
        "rotationDegrees",
      ]
      : [
        "enabled",
        "source",
        "label",
        "assetId",
        "opacity",
        "scalePercent",
        "rotationDegrees",
      ],
    `A marca-d'agua da pagina ${page}`,
  );
  if (typeof source.enabled !== "boolean") {
    throw new Error(
      `A habilitacao da marca-d'agua da pagina ${page} e invalida.`,
    );
  }
  const rawSource = source.source;
  if (
    rawSource !== "TEXT" &&
    rawSource !== "CUSTOM_ASSET" &&
    !(schemaVersion === 1 && rawSource === "INSTITUTIONAL_BRAND")
  ) {
    throw new Error(`A origem da marca-d'agua da pagina ${page} e invalida.`);
  }
  const opacity = Number(source.opacity);
  const scalePercent = Number(source.scalePercent);
  const rotationDegrees = Number(source.rotationDegrees);
  if (!Number.isFinite(opacity) || opacity < 0.03 || opacity > 0.15) {
    throw new Error(
      `A opacidade da marca-d'agua da pagina ${page} e invalida.`,
    );
  }
  if (
    !Number.isInteger(scalePercent) || scalePercent < 20 || scalePercent > 65
  ) {
    throw new Error(`A escala da marca-d'agua da pagina ${page} e invalida.`);
  }
  if (rotationDegrees !== -45 && rotationDegrees !== 0) {
    throw new Error(`A rotacao da marca-d'agua da pagina ${page} e invalida.`);
  }

  if (rawSource === "INSTITUTIONAL_BRAND") {
    if (source.label !== null) {
      throw new Error(
        `A marca institucional legada da pagina ${page} nao aceita texto livre.`,
      );
    }
    return {
      enabled: source.enabled,
      source: "TEXT",
      label: "UNIVERSO",
      assetId: null,
      opacity,
      scalePercent,
      rotationDegrees: -45,
    };
  }

  if (rawSource === "TEXT") {
    if (schemaVersion >= 2 && source.assetId !== null) {
      throw new Error(
        `A marca-d'agua textual da pagina ${page} nao aceita imagem.`,
      );
    }
    return {
      enabled: source.enabled,
      source: "TEXT",
      label: assertEditorText(
        source.label,
        `O texto da marca-d'agua da pagina ${page}`,
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.watermarkLabel,
      ),
      assetId: null,
      opacity,
      scalePercent,
      rotationDegrees,
    };
  }

  if (source.label !== null) {
    throw new Error(
      `A imagem personalizada da pagina ${page} nao aceita texto livre.`,
    );
  }
  if (
    typeof source.assetId !== "string" || !ASSET_ID_PATTERN.test(source.assetId)
  ) {
    throw new Error(
      `A imagem personalizada da pagina ${page} exige um ativo autorizado.`,
    );
  }
  if (rotationDegrees !== 0) {
    throw new Error(
      `A imagem personalizada da pagina ${page} nao aceita orientacao.`,
    );
  }
  return {
    enabled: source.enabled,
    source: "CUSTOM_ASSET",
    label: null,
    assetId: source.assetId,
    opacity,
    scalePercent,
    rotationDegrees: 0,
  };
};

/**
 * Snapshots anteriores continuam apenas legíveis. A prévia não preserva
 * posições por papel: converte-os para o único desenho global neutro v5.
 */

