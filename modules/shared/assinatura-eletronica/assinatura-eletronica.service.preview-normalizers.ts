import type {
  ElectronicSignatureLegalSection,
  ElectronicSignaturePageWatermark,
  ElectronicSignaturePreviewIdentity,
} from "./assinatura-eletronica.contract";
import {
  ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS,
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
} from "./assinatura-eletronica.contract";
import { assertCanonicalInstitutionalWatermarkDataUri } from "./canonical-institutional-watermark";
import {
  asRecord,
  assertExactKeys,
  normalizeAssetId,
  requiredBoolean,
  requiredBoundedString,
  requiredInteger,
  requiredNumber,
  requiredString,
  stringValue,
} from "./assinatura-eletronica.service.shared";

const normalizePreviewAssetSource = (value: unknown, label: string) => {
  if (value === null) return null;
  const source = stringValue(value, label, 16 * 1024 * 1024).trim();
  if (!source) return null;
  if (
    !/^https:\/\//iu.test(source) &&
    !/^data:image\/(?:png|jpe?g|webp);base64,/iu.test(source)
  ) {
    throw new Error(`${label} não usa uma origem de imagem autorizada.`);
  }
  return source;
};

const normalizePreviewWatermark = (value: unknown) => {
  const source = asRecord(
    value,
    "A marca-d'água institucional da prévia não foi informada.",
  );
  assertExactKeys(
    source,
    ["url", "opacity", "scale", "rotate"],
    "A marca-d'água institucional da prévia",
  );
  const opacity = requiredNumber(
    source.opacity,
    "A opacidade da marca-d'água institucional",
  );
  const scale = requiredNumber(
    source.scale,
    "A escala da marca-d'água institucional",
  );
  if (opacity < 0 || opacity > 1) {
    throw new Error(
      "A opacidade da marca-d'água institucional está fora do modelo autorizado.",
    );
  }
  if (
    !Number.isInteger(scale) || scale < 10 || scale > 100 || scale % 5 !== 0
  ) {
    throw new Error(
      "A escala da marca-d'água institucional está fora do modelo autorizado.",
    );
  }
  return {
    url: assertCanonicalInstitutionalWatermarkDataUri(
      source.url,
      "A marca-d'água institucional",
    ),
    opacity,
    scale,
    rotate: requiredBoolean(
      source.rotate,
      "A rotação da marca-d'água institucional",
    ),
  };
};

export const normalizePreviewIdentity = (
  value: unknown,
): ElectronicSignaturePreviewIdentity => {
  const source = asRecord(
    value,
    "A identidade institucional da prévia não foi informada.",
  );
  assertExactKeys(
    source,
    ["institution", "logoUrl", "watermark"],
    "A identidade institucional da prévia",
  );
  const institution = asRecord(
    source.institution,
    "O cabeçalho institucional da prévia não foi informado.",
  );
  assertExactKeys(
    institution,
    [
      "name",
      "legalName",
      "cnpj",
      "address",
      "number",
      "complement",
      "neighborhood",
      "city",
      "state",
      "postalCode",
      "phone",
      "email",
      "isHeadquarters",
    ],
    "O cabeçalho institucional da prévia",
  );
  const logoUrl = normalizePreviewAssetSource(
    source.logoUrl,
    "O logotipo institucional",
  );
  const watermark = normalizePreviewWatermark(source.watermark);
  return {
    institution: {
      name: requiredBoundedString(
        institution.name,
        "O nome institucional",
        180,
      ),
      legalName: stringValue(institution.legalName, "A razão social", 220),
      cnpj: stringValue(institution.cnpj, "O CNPJ institucional", 30),
      address: stringValue(
        institution.address,
        "O endereço institucional",
        220,
      ),
      number: stringValue(institution.number, "O número institucional", 40),
      complement: stringValue(
        institution.complement,
        "O complemento institucional",
        120,
      ),
      neighborhood: stringValue(
        institution.neighborhood,
        "O bairro institucional",
        120,
      ),
      city: stringValue(institution.city, "A cidade institucional", 120),
      state: stringValue(institution.state, "O estado institucional", 10),
      postalCode: stringValue(
        institution.postalCode,
        "O CEP institucional",
        20,
      ),
      phone: stringValue(institution.phone, "O contato institucional", 120),
      email: stringValue(institution.email, "O e-mail institucional", 180),
      isHeadquarters: requiredBoolean(
        institution.isHeadquarters,
        "A identificação da matriz",
      ),
    },
    logoUrl,
    watermark,
  };
};

export const normalizeWatermark = (
  value: unknown,
  page: 1 | 2,
  schemaVersion: 1 | 2 | 3,
): ElectronicSignaturePageWatermark => {
  const source = asRecord(
    value,
    `A marca-d'água da página ${page} é inválida.`,
  );
  assertExactKeys(
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
    `A marca-d'água da página ${page}`,
  );
  const watermarkSource = requiredString(
    source.source,
    `A origem da marca-d'água da página ${page}`,
  );
  if (
    watermarkSource !== "TEXT" &&
    watermarkSource !== "CUSTOM_ASSET" &&
    !(schemaVersion === 1 && watermarkSource === "INSTITUTIONAL_BRAND")
  ) {
    throw new Error(
      `A origem da marca-d'água da página ${page} não foi reconhecida.`,
    );
  }
  const sourceLabel = source.label === null ? null : requiredString(
    source.label,
    `O texto da marca-d'água da página ${page}`,
  );
  if (
    sourceLabel &&
    sourceLabel.length > ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.watermarkLabel
  ) {
    throw new Error(
      `O texto da marca-d'água da página ${page} excedeu o limite permitido.`,
    );
  }
  if (watermarkSource === "TEXT" && !sourceLabel) {
    throw new Error(`A marca-d'água textual da página ${page} exige um texto.`);
  }
  if (watermarkSource !== "TEXT" && sourceLabel !== null) {
    throw new Error(
      `A marca institucional da página ${page} não aceita texto livre.`,
    );
  }
  const assetId = schemaVersion >= 2 && source.assetId !== null
    ? normalizeAssetId(
      source.assetId,
      `O ativo da marca-d'água da página ${page}`,
    )
    : null;
  if (watermarkSource === "TEXT" && assetId !== null) {
    throw new Error(
      `A marca-d'água textual da página ${page} não aceita imagem.`,
    );
  }
  if (watermarkSource === "CUSTOM_ASSET" && !assetId) {
    throw new Error(
      `A imagem personalizada da página ${page} exige um ativo autorizado.`,
    );
  }
  const opacity = requiredNumber(
    source.opacity,
    `A opacidade da marca-d'água da página ${page}`,
  );
  const scalePercent = requiredInteger(
    source.scalePercent,
    `A escala da marca-d'água da página ${page}`,
  );
  const rotationDegrees = requiredInteger(
    source.rotationDegrees,
    `A rotação da marca-d'água da página ${page}`,
  );
  if (opacity < 0.03 || opacity > 0.15) {
    throw new Error(
      `A opacidade da marca-d'água da página ${page} está fora do intervalo autorizado.`,
    );
  }
  if (scalePercent < 20 || scalePercent > 65) {
    throw new Error(
      `A escala da marca-d'água da página ${page} está fora do intervalo autorizado.`,
    );
  }
  if (rotationDegrees !== -45 && rotationDegrees !== 0) {
    throw new Error(
      `A rotação da marca-d'água da página ${page} está fora do intervalo autorizado.`,
    );
  }
  if (watermarkSource === "CUSTOM_ASSET" && rotationDegrees !== 0) {
    throw new Error(
      `A imagem personalizada da página ${page} não aceita orientação.`,
    );
  }
  return {
    enabled: requiredBoolean(
      source.enabled,
      `A habilitação da marca-d'água da página ${page}`,
    ),
    source: watermarkSource === "INSTITUTIONAL_BRAND"
      ? "TEXT"
      : watermarkSource,
    label: watermarkSource === "INSTITUTIONAL_BRAND" ? "UNIVERSO" : sourceLabel,
    assetId,
    opacity,
    scalePercent,
    rotationDegrees: watermarkSource === "INSTITUTIONAL_BRAND"
      ? -45
      : rotationDegrees,
  };
};

export const normalizeLegalSection = (
  value: unknown,
  index: number,
): ElectronicSignatureLegalSection => {
  const source = asRecord(value, `O bloco jurídico ${index + 1} é inválido.`);
  assertExactKeys(
    source,
    ["id", "title", "body"],
    `O bloco jurídico ${index + 1}`,
  );
  const expectedId = ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS[index];
  const id = requiredString(
    source.id,
    `O identificador do bloco jurídico ${index + 1}`,
  );
  if (id !== expectedId) {
    throw new Error(
      "A ordem dos blocos jurídicos não corresponde ao contrato autorizado.",
    );
  }
  const title = requiredString(
    source.title,
    `O título do bloco jurídico ${index + 1}`,
  );
  const body = requiredString(
    source.body,
    `O texto do bloco jurídico ${index + 1}`,
  );
  if (
    title.length > ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionTitle
  ) {
    throw new Error(
      `O título do bloco jurídico ${index + 1} excedeu o limite permitido.`,
    );
  }
  if (body.length > ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionBody) {
    throw new Error(
      `O texto do bloco jurídico ${index + 1} excedeu o limite permitido.`,
    );
  }
  return { id: expectedId, title, body };
};
