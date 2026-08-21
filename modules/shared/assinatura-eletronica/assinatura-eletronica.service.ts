import { supabase } from "../../../lib/supabase";

import type {
  ElectronicSignatureAdministrationDraft,
  ElectronicSignatureAdministrationPresentation,
  ElectronicSignatureArchiveCursor,
  ElectronicSignatureArchiveFilters,
  ElectronicSignatureArchiveItem,
  ElectronicSignatureArchivePage,
  ElectronicSignatureArchiveSigner,
  ElectronicSignatureArtifactClass,
  ElectronicSignatureArtifactDownload,
  ElectronicSignatureArtifactProfile,
  ElectronicSignatureConfirmationResult,
  ElectronicSignatureConsentEvidence,
  ElectronicSignatureConsentTerm,
  ElectronicSignatureDiaryArtifactAction,
  ElectronicSignatureDiaryArtifactResult,
  ElectronicSignatureDiaryEnvelopeRequestResult,
  ElectronicSignatureDocumentEditor,
  ElectronicSignatureEnvelopeDetail,
  ElectronicSignatureEnvelopeParticipant,
  ElectronicSignatureInbox,
  ElectronicSignatureInboxCursor,
  ElectronicSignatureInboxItem,
  ElectronicSignatureInboxPage,
  ElectronicSignatureLegalSection,
  ElectronicSignatureModelAsset,
  ElectronicSignaturePageWatermark,
  ElectronicSignaturePreviewIdentity,
  ElectronicSignaturePrimaryAction,
  ElectronicSignatureProfile,
  ElectronicSignatureReauthenticationResult,
  ElectronicSignatureStampContentLayout,
  ElectronicSignatureStampEditor,
  ElectronicSignatureStampRole,
  ElectronicSignatureStampSlot,
} from "./assinatura-eletronica.contract";
import {
  ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS,
  ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS,
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS,
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
  validateElectronicSignatureModelAssetUpload,
  verifyElectronicSignatureModelAssetDownload,
} from "./assinatura-eletronica.model-asset";
import {
  assertCanonicalInstitutionalWatermarkDataUri,
} from "./canonical-institutional-watermark";
import { toElectronicSignatureRpcError } from "./assinatura-eletronica.rpc-error";

/**
 * Chave de configuração do modelo de comprovante comum. Ela não habilita um
 * documento operacional nem substitui a aprovação jurídica por tipo.
 */
export const ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT = "MODELO_PADRAO";

const DEFAULT_INBOX_EMPTY_MESSAGE =
  "Não há documentos disponíveis para esta etapa.";
const RECEIPT_FIELD_IDS = [
  "envelope",
  "document_revision",
  "participants",
  "events",
] as const;
const ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION =
  "assinatura-eletronica-modelo-assets";
const ELECTRONIC_SIGNATURE_REAUTHENTICATION_FUNCTION =
  "assinatura-eletronica-reautenticacao";
const ELECTRONIC_SIGNATURE_DIARY_ARTIFACTS_FUNCTION =
  "assinatura-eletronica-diario-artefatos";
const ELECTRONIC_SIGNATURE_ARCHIVE_FUNCTION = "assinatura-eletronica-acervo";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export class ElectronicSignatureRequestError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code: string,
    status: number | null,
    retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "ElectronicSignatureRequestError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RpcRecord = Record<string, unknown>;

const asRecord = (value: unknown, message: string): RpcRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as RpcRecord;
};

const firstRpcRecord = (value: unknown, message: string): RpcRecord => {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(message);
    return asRecord(value[0], message);
  }
  return asRecord(value, message);
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return value;
};

const requiredBoundedString = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const normalized = requiredString(value, label);
  if (normalized.length > maximumLength) {
    throw new Error(`${label} excedeu o limite autorizado.`);
  }
  return normalized;
};

const requiredBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return value;
};

const requiredNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return value;
};

const requiredInteger = (value: unknown, label: string): number => {
  const normalized = requiredNumber(value, label);
  if (!Number.isInteger(normalized)) {
    throw new Error(`${label} deve ser um número inteiro.`);
  }
  return normalized;
};

const assertExactKeys = (
  source: RpcRecord,
  expected: readonly string[],
  label: string,
) => {
  const keys = Object.keys(source).sort();
  const canonical = [...expected].sort();
  if (
    keys.length !== canonical.length ||
    keys.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} não corresponde ao contrato autorizado.`);
  }
};

const asNullableString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value : null
);

const stringValue = (
  value: unknown,
  label: string,
  maximumLength = 500,
) => {
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new Error(
      `${label} não corresponde à identidade institucional autorizada.`,
    );
  }
  return value;
};

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
    !Number.isInteger(scale) || scale < 10 || scale > 100 ||
    scale % 5 !== 0
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

const normalizePreviewIdentity = (
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

const normalizeAssetId = (value: unknown, label: string): string => {
  const assetId = requiredString(value, label).trim();
  if (!UUID_PATTERN.test(assetId)) {
    throw new Error(`${label} não tem o formato autorizado.`);
  }
  return assetId;
};

const normalizeWatermark = (
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

const normalizeLegalSection = (
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
      number < limits.min ||
      number > limits.max ||
      number % limits.step !== 0
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

const normalizeEditor = (value: unknown): ElectronicSignatureDocumentEditor => {
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
  if (
    schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3
  ) {
    normalizeWatermark(page1.watermark, 1, schemaVersion);
    normalizeWatermark(page2.watermark, 2, schemaVersion);
  }
  return {
    schemaVersion: 5,
    pages: [
      {
        page: 1,
        template: "EVIDENCE",
      },
      {
        page: 2,
        template: "LEGAL_TEXTS",
        sections,
      },
    ],
    signatureStamp: schemaVersion === 5
      ? normalizeGlobalSignatureStamp(source.signatureStamp)
      : schemaVersion === 3 || schemaVersion === 4
      ? normalizeSignatureStamp(source.signatureStamp, schemaVersion)
      : legacySignatureStamp(),
  };
};

const normalizePrimaryAction = (
  value: unknown,
): ElectronicSignaturePrimaryAction => {
  switch (value) {
    case "NONE":
    case "VIEW":
    case "SIGN":
    case "WAITING_PREVIOUS_SIGNER":
    case "FINALIZATION_IN_PROGRESS":
    case "AWAITING_LEGAL_REVIEW":
    case "AWAITING_AUTHENTICATION_CHAIN":
      return value;
    default:
      throw new Error("A ação da assinatura não foi reconhecida pelo cliente.");
  }
};

const nullableUuid = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = requiredString(value, label).trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} não tem o formato autorizado.`);
  }
  return normalized;
};

const requiredUuid = (value: unknown, label: string): string => {
  const normalized = nullableUuid(value, label);
  if (!normalized) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return normalized;
};

const nullableInteger = (value: unknown, label: string): number | null => {
  if (value === null || value === undefined) return null;
  return requiredInteger(value, label);
};

const requiredTimestamp = (value: unknown, label: string): string => {
  const normalized = requiredString(value, label);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} não é uma data válida.`);
  }
  return normalized;
};

const nullableTimestamp = (value: unknown, label: string): string | null => (
  value === null || value === undefined ? null : requiredTimestamp(value, label)
);

const nullableSha256 = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} não corresponde a um SHA-256 autorizado.`);
  }
  return value;
};

const normalizeDocumentReadiness = (
  value: RpcRecord,
  labels: {
    ready: string;
    sha256: string;
    timestamp: string;
    timestampKey: string;
  },
) => {
  const ready = requiredBoolean(value.ready, labels.ready);
  const sha256 = nullableSha256(value.sha256, labels.sha256);
  const timestamp = nullableTimestamp(
    value[labels.timestampKey],
    labels.timestamp,
  );
  if (ready !== Boolean(sha256 && timestamp)) {
    throw new Error(
      `${labels.ready} está inconsistente com o hash e o instante canônicos.`,
    );
  }
  return { ready, sha256, timestamp };
};

const normalizeInboxItem = (
  source: RpcRecord,
): ElectronicSignatureInboxItem => ({
  envelopeId: requiredUuid(source.envelopeId, "O identificador do envelope"),
  participantId: nullableUuid(
    source.participantId,
    "O identificador do participante",
  ),
  title: requiredString(source.title, "O título do envelope"),
  documentType: requiredString(source.documentType, "O tipo do documento"),
  originType: requiredString(source.originType, "A origem do documento"),
  originVersion: requiredInteger(source.originVersion, "A versão da origem"),
  revisionLabel: asNullableString(source.revisionLabel),
  participantRole: asNullableString(source.participantRole),
  participantRoleLabel: asNullableString(source.participantRoleLabel),
  participantOrder: nullableInteger(
    source.participantOrder,
    "A ordem do participante",
  ),
  participantStatus: asNullableString(source.participantStatus),
  participantStatusLabel: asNullableString(source.participantStatusLabel),
  status: requiredString(source.status, "O status do envelope"),
  statusLabel: requiredString(source.statusLabel, "O status do envelope"),
  deadlineAt: nullableTimestamp(source.deadlineAt, "O prazo do envelope"),
  updatedAt: requiredTimestamp(source.updatedAt, "A atualização do envelope"),
  primaryAction: normalizePrimaryAction(source.primaryAction),
  primaryActionLabel: asNullableString(source.primaryActionLabel),
  canAct: requiredBoolean(source.canAct, "A disponibilidade da ação"),
  message: asNullableString(source.message),
});

const normalizeInboxCursor = (
  value: unknown,
): ElectronicSignatureInboxCursor | null => {
  if (value === null || value === undefined) return null;
  const source = asRecord(
    value,
    "O cursor da caixa de assinaturas é inválido.",
  );
  return {
    updatedAt: requiredTimestamp(source.updatedAt, "A atualização do cursor"),
    envelopeId: requiredUuid(source.envelopeId, "O envelope do cursor"),
  };
};

const normalizeInboxPage = (value: unknown): ElectronicSignatureInboxPage => {
  const source = firstRpcRecord(
    value,
    "A caixa de assinaturas retornou um formato inválido.",
  );
  if (!Array.isArray(source.items)) {
    throw new Error(
      "A caixa de assinaturas não informou os itens autorizados.",
    );
  }
  return {
    items: source.items.map((item) =>
      normalizeInboxItem(
        asRecord(item, "Item de assinatura inválido."),
      )
    ),
    nextCursor: normalizeInboxCursor(source.nextCursor),
  };
};

const normalizeRequiredSha256 = (value: unknown, label: string): string => {
  const normalized = nullableSha256(value, label);
  if (!normalized) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return normalized;
};

const normalizeConsentTerm = (
  value: unknown,
): ElectronicSignatureConsentTerm => {
  const source = firstRpcRecord(
    value,
    "O termo de aceite retornou um formato inválido.",
  );
  assertExactKeys(
    source,
    [
      "termId",
      "version",
      "versionLabel",
      "title",
      "confirmationMessage",
      "sections",
      "sha256",
    ],
    "O termo de aceite",
  );
  const version = requiredInteger(
    source.version,
    "A versão do termo de aceite",
  );
  if (version < 1) throw new Error("A versão do termo de aceite é inválida.");
  if (
    !Array.isArray(source.sections) ||
    source.sections.length !== ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS.length
  ) {
    throw new Error(
      "O termo de aceite deve conter os cinco blocos jurídicos canônicos.",
    );
  }
  const sections = source.sections.map(normalizeLegalSection);
  if (
    sections.reduce((total, section) => total + section.body.length, 0) >
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionsBodyTotal
  ) {
    throw new Error(
      "O conteúdo total do termo de aceite excedeu o limite autorizado.",
    );
  }
  return {
    termId: requiredBoundedString(
      source.termId,
      "O identificador do termo de aceite",
      160,
    ),
    version,
    versionLabel: requiredBoundedString(
      source.versionLabel,
      "A versão exibida do termo de aceite",
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.versionLabel,
    ),
    title: requiredBoundedString(
      source.title,
      "O título do termo de aceite",
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.name,
    ),
    confirmationMessage: requiredBoundedString(
      source.confirmationMessage,
      "A confirmação do termo de aceite",
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.confirmationMessage,
    ),
    sections,
    sha256: normalizeRequiredSha256(source.sha256, "O hash do termo de aceite"),
  };
};

const normalizeArchiveSigner = (
  value: unknown,
): ElectronicSignatureArchiveSigner => {
  const source = asRecord(
    value,
    "Um signatário do acervo retornou um formato inválido.",
  );
  assertExactKeys(
    source,
    ["role", "name", "signedAt"],
    "O signatário do acervo",
  );
  return {
    // Papel é evidência imutável devolvida pelo servidor, não um selector de
    // layout ou uma lista fixa de participantes no cliente.
    role: requiredBoundedString(source.role, "O papel do signatário", 40),
    name: requiredBoundedString(source.name, "O nome do signatário", 180),
    signedAt: requiredTimestamp(source.signedAt, "O instante da assinatura"),
  };
};

const assertDiarySignerCount = (
  signers: readonly unknown[],
  label: string,
) => {
  if (
    signers.length < 1 ||
    signers.length > ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS
  ) {
    throw new Error(
      `${label} deve informar entre 1 e ${ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS} signatários canônicos.`,
    );
  }
};

const normalizeArchiveItem = (
  value: unknown,
): ElectronicSignatureArchiveItem => {
  const source = asRecord(
    value,
    "Um documento do acervo retornou um formato inválido.",
  );
  assertExactKeys(source, [
    "envelopeId",
    "documentType",
    "title",
    "originType",
    "originVersion",
    "revisionLabel",
    "status",
    "poloId",
    "turmaId",
    "turmaNome",
    "disciplinaId",
    "disciplinaNome",
    "signers",
    "finalizedAt",
    "sha256",
    "validationCode",
    "artifacts",
  ], "O documento do acervo");
  if (source.documentType !== "diario_classe") {
    throw new Error("O tipo de documento do acervo não foi reconhecido.");
  }
  if (source.status !== "ASSINADO" && source.status !== "SUBSTITUIDO") {
    throw new Error("O status do documento do acervo não foi reconhecido.");
  }
  if (!Array.isArray(source.signers)) {
    throw new Error(
      "O diário finalizado não informou os signatários canônicos.",
    );
  }
  assertDiarySignerCount(source.signers, "O diário finalizado");
  const signers = source.signers.map(normalizeArchiveSigner);
  const artifacts = asRecord(
    source.artifacts,
    "Os artefatos disponíveis não foram informados.",
  );
  assertExactKeys(artifacts, ["final", "receipt"], "Os artefatos disponíveis");
  const validationCode = source.validationCode === null
    ? null
    : requiredBoundedString(
      source.validationCode,
      "O código de validação",
      160,
    );
  return {
    envelopeId: requiredUuid(source.envelopeId, "O envelope do acervo"),
    documentType: "diario_classe",
    title: requiredBoundedString(source.title, "O título do documento", 240),
    originType: requiredBoundedString(
      source.originType,
      "A origem do documento",
      80,
    ),
    originVersion: requiredInteger(source.originVersion, "A versão de origem"),
    revisionLabel: requiredBoundedString(
      source.revisionLabel,
      "A revisão do documento",
      80,
    ),
    status: source.status,
    poloId: requiredUuid(source.poloId, "O polo do documento"),
    turmaId: requiredUuid(source.turmaId, "A turma do documento"),
    turmaNome: requiredBoundedString(
      source.turmaNome,
      "A turma do documento",
      180,
    ),
    disciplinaId: requiredUuid(
      source.disciplinaId,
      "A disciplina do documento",
    ),
    disciplinaNome: requiredBoundedString(
      source.disciplinaNome,
      "A disciplina do documento",
      180,
    ),
    signers,
    finalizedAt: requiredTimestamp(
      source.finalizedAt,
      "A finalização do documento",
    ),
    sha256: normalizeRequiredSha256(source.sha256, "O hash do documento final"),
    validationCode,
    artifacts: {
      final: requiredBoolean(
        artifacts.final,
        "A disponibilidade do documento final",
      ),
      receipt: requiredBoolean(
        artifacts.receipt,
        "A disponibilidade do comprovante",
      ),
    },
  };
};

const normalizeArchiveCursor = (
  value: unknown,
): ElectronicSignatureArchiveCursor | null => {
  if (value === null || value === undefined) return null;
  const source = asRecord(
    value,
    "O cursor do acervo retornou um formato inválido.",
  );
  assertExactKeys(source, ["finalizedAt", "envelopeId"], "O cursor do acervo");
  return {
    finalizedAt: requiredTimestamp(
      source.finalizedAt,
      "A finalização do cursor",
    ),
    envelopeId: requiredUuid(source.envelopeId, "O envelope do cursor"),
  };
};

const normalizeArchivePage = (
  value: unknown,
): ElectronicSignatureArchivePage => {
  const source = firstRpcRecord(
    value,
    "O acervo retornou um formato inválido.",
  );
  assertExactKeys(source, ["items", "nextCursor"], "A página do acervo");
  if (!Array.isArray(source.items)) {
    throw new Error("O acervo não informou os documentos autorizados.");
  }
  return {
    items: source.items.map(normalizeArchiveItem),
    nextCursor: normalizeArchiveCursor(source.nextCursor),
  };
};

const normalizeArtifactClass = (
  value: unknown,
): ElectronicSignatureArtifactClass => {
  if (
    value !== "DOCUMENTO_ORIGINAL" &&
    value !== "DOCUMENTO_FINAL" &&
    value !== "COMPROVANTE_EVIDENCIA"
  ) {
    throw new Error("A classe do artefato não foi reconhecida.");
  }
  return value;
};

const normalizeArtifactProfile = (
  value: unknown,
): ElectronicSignatureArtifactProfile => {
  if (value !== "GESTOR" && value !== "PROFESSOR" && value !== "COORDENADOR") {
    throw new Error("O perfil não pode solicitar este artefato.");
  }
  return value;
};

const normalizeArtifactDownload = (
  value: unknown,
  expected: {
    requestId: string;
    envelopeId: string;
    artifactClass: ElectronicSignatureArtifactClass;
  },
): ElectronicSignatureArtifactDownload => {
  const response = asRecord(
    value,
    "O download do artefato retornou um formato inválido.",
  );
  assertExactKeys(
    response,
    ["ok", "action", "requestId", "data"],
    "A resposta do download",
  );
  if (response.ok !== true || response.action !== "CREATE_DOWNLOAD_URL") {
    throw new Error("O download não foi autorizado pelo serviço de artefatos.");
  }
  if (
    requiredUuid(response.requestId, "A chave do download") !==
      expected.requestId
  ) {
    throw new Error(
      "O download respondeu a uma operação diferente da solicitada.",
    );
  }
  const source = asRecord(
    response.data,
    "Os dados do download não foram informados.",
  );
  assertExactKeys(source, [
    "envelopeId",
    "artifactId",
    "artifactClass",
    "sha256",
    "byteSize",
    "mimeType",
    "fileName",
    "url",
    "expiresAt",
    "expiresIn",
  ], "Os dados do download");
  const envelopeId = requiredUuid(source.envelopeId, "O envelope do download");
  const artifactClass = normalizeArtifactClass(source.artifactClass);
  if (
    envelopeId !== expected.envelopeId ||
    artifactClass !== expected.artifactClass
  ) {
    throw new Error("O serviço retornou um artefato diferente do solicitado.");
  }
  const mimeType = requiredString(source.mimeType, "O tipo do artefato");
  if (mimeType !== "application/pdf") {
    throw new Error("O artefato autorizado não é um documento PDF.");
  }
  const byteSize = requiredInteger(source.byteSize, "O tamanho do artefato");
  if (byteSize < 1 || byteSize > 52_428_800) {
    throw new Error("O tamanho do artefato está fora do limite autorizado.");
  }
  const fileName = requiredBoundedString(
    source.fileName,
    "O nome do arquivo",
    180,
  );
  if (/[\\/\0]/u.test(fileName)) {
    throw new Error("O nome do arquivo retornado pelo serviço é inválido.");
  }
  const url = requiredBoundedString(
    source.url,
    "A URL temporária do artefato",
    16_384,
  );
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("A URL temporária do artefato é inválida.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("A URL temporária do artefato não usa uma origem segura.");
  }
  const expiresIn = requiredInteger(source.expiresIn, "A validade do download");
  if (expiresIn !== 120) {
    throw new Error(
      "A validade do download não corresponde ao contrato autorizado.",
    );
  }
  return {
    envelopeId,
    artifactId: requiredUuid(source.artifactId, "O identificador do artefato"),
    artifactClass,
    sha256: normalizeRequiredSha256(source.sha256, "O hash do artefato"),
    byteSize,
    mimeType: "application/pdf",
    fileName,
    url: parsedUrl.toString(),
    expiresAt: requiredTimestamp(source.expiresAt, "A expiração do download"),
    expiresIn,
  };
};

const parseCivilDate = (value: string, label: string) => {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) throw new Error(`${label} deve estar no formato AAAA-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`${label} não é uma data válida.`);
  }
  return { year, month, day };
};

const civilDateToMaceioIso = (
  value: string,
  label: string,
  addOneDay = false,
) => {
  const { year, month, day } = parseCivilDate(value, label);
  const probe = new Date(Date.UTC(year, month - 1, day + (addOneDay ? 1 : 0)));
  const dateKey = [
    String(probe.getUTCFullYear()).padStart(4, "0"),
    String(probe.getUTCMonth() + 1).padStart(2, "0"),
    String(probe.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return new Date(`${dateKey}T00:00:00-03:00`).toISOString();
};

const normalizeArchiveDateRange = (
  filters: ElectronicSignatureArchiveFilters,
) => {
  const from = filters.finalizedFrom?.trim() || null;
  const to = filters.finalizedTo?.trim() || null;
  if (from) parseCivilDate(from, "A data inicial");
  if (to) parseCivilDate(to, "A data final");
  if (from && to && from > to) {
    throw new Error("A data inicial não pode ser posterior à data final.");
  }
  return {
    finalizedFrom: from ? civilDateToMaceioIso(from, "A data inicial") : null,
    finalizedToExclusive: to
      ? civilDateToMaceioIso(to, "A data final", true)
      : null,
  };
};

const normalizeEnvelopeParticipant = (
  value: unknown,
): ElectronicSignatureEnvelopeParticipant => {
  const source = asRecord(value, "O participante do envelope é inválido.");
  return {
    participantId: requiredUuid(
      source.participantId,
      "O identificador do participante",
    ),
    role: requiredString(source.role, "O papel do participante"),
    roleLabel: requiredString(source.roleLabel, "O papel do participante"),
    order: requiredInteger(source.order, "A ordem do participante"),
    status: requiredString(source.status, "O status do participante"),
    statusLabel: requiredString(source.statusLabel, "O status do participante"),
    contextId: requiredUuid(source.contextId, "O contexto do participante"),
    canAct: requiredBoolean(
      source.canAct,
      "A disponibilidade da ação do participante",
    ),
    signedAt: nullableTimestamp(source.signedAt, "O instante da assinatura"),
  };
};

const normalizeCanonicalDiaryParticipants = (
  value: unknown,
): readonly ElectronicSignatureEnvelopeParticipant[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      "Os participantes canônicos do diário não foram informados.",
    );
  }
  assertDiarySignerCount(value, "O diário");
  const participants = value.map(normalizeEnvelopeParticipant);
  const participantIds = new Set<string>();
  for (const [index, participant] of participants.entries()) {
    if (
      participant.order !== index + 1 ||
      participantIds.has(participant.participantId)
    ) {
      throw new Error(
        "A ordem canônica dos participantes do diário é inválida.",
      );
    }
    participantIds.add(participant.participantId);
  }
  return participants;
};

const normalizeEnvelopeDetail = (
  value: unknown,
): ElectronicSignatureEnvelopeDetail => {
  const source = firstRpcRecord(
    value,
    "O envelope retornou um formato inválido.",
  );
  const envelope = asRecord(
    source.envelope,
    "Os dados do envelope não foram informados.",
  );
  const original = asRecord(
    envelope.original,
    "O documento original não foi informado.",
  );
  const finalDocument = asRecord(
    envelope.final,
    "O documento final não foi informado.",
  );
  if (!Array.isArray(source.participants)) {
    throw new Error("Os participantes do envelope não foram informados.");
  }
  const originalState = normalizeDocumentReadiness(original, {
    ready: "A disponibilidade do documento original",
    sha256: "O hash do documento original",
    timestamp: "O congelamento do documento original",
    timestampKey: "immutableAt",
  });
  const finalState = normalizeDocumentReadiness(finalDocument, {
    ready: "A disponibilidade do documento final",
    sha256: "O hash do documento final",
    timestamp: "A finalização do documento",
    timestampKey: "finalizedAt",
  });
  return {
    envelope: {
      envelopeId: requiredUuid(
        envelope.envelopeId,
        "O identificador do envelope",
      ),
      documentType: requiredString(
        envelope.documentType,
        "O tipo do documento",
      ),
      title: requiredString(envelope.title, "O título do envelope"),
      revisionLabel: requiredString(
        envelope.revisionLabel,
        "A revisão do envelope",
      ),
      originType: requiredString(envelope.originType, "A origem do documento"),
      status: requiredString(envelope.status, "O status do envelope"),
      statusLabel: requiredString(envelope.statusLabel, "O status do envelope"),
      deadlineAt: nullableTimestamp(envelope.deadlineAt, "O prazo do envelope"),
      createdAt: requiredTimestamp(envelope.createdAt, "A criação do envelope"),
      updatedAt: requiredTimestamp(
        envelope.updatedAt,
        "A atualização do envelope",
      ),
      policyVersion: requiredInteger(
        envelope.policyVersion,
        "A versão da política",
      ),
      original: {
        ready: originalState.ready,
        sha256: originalState.sha256,
        immutableAt: originalState.timestamp,
      },
      final: {
        ready: finalState.ready,
        sha256: finalState.sha256,
        finalizedAt: finalState.timestamp,
      },
    },
    participant: source.participant === null
      ? null
      : normalizeEnvelopeParticipant(source.participant),
    participants: source.participants.map(normalizeEnvelopeParticipant),
    canManage: requiredBoolean(
      source.canManage,
      "A permissão de gestão do envelope",
    ),
  };
};

const normalizeReauthentication = (
  value: unknown,
  expectedRequestId: string,
): ElectronicSignatureReauthenticationResult => {
  const response = asRecord(
    value,
    "A reautenticação retornou um formato inválido.",
  );
  if (response.ok !== true || response.action !== "REAUTHENTICATE") {
    throw new Error(
      "A reautenticação não foi confirmada pelo serviço autorizado.",
    );
  }
  if (
    requiredUuid(response.requestId, "A chave da reautenticação") !==
      expectedRequestId
  ) {
    throw new Error(
      "A reautenticação respondeu a uma operação diferente da solicitada.",
    );
  }
  const source = asRecord(
    response.data,
    "O ticket de reautenticação não foi informado.",
  );
  const profile = requiredString(source.profile, "O perfil da reautenticação");
  if (
    !["GESTOR", "PROFESSOR", "COORDENADOR", "ALUNO", "RESPONSAVEL_LEGAL"]
      .includes(profile)
  ) {
    throw new Error("O perfil da reautenticação não foi reconhecido.");
  }
  return {
    ticket: requiredString(source.ticket, "O ticket de reautenticação"),
    challengeId: requiredUuid(
      source.challengeId,
      "O desafio de reautenticação",
    ),
    envelopeId: requiredUuid(source.envelopeId, "O envelope da reautenticação"),
    participantId: requiredUuid(
      source.participantId,
      "O participante da reautenticação",
    ),
    participantRole: requiredString(
      source.participantRole,
      "O papel do participante",
    ),
    participantOrder: requiredInteger(
      source.participantOrder,
      "A ordem do participante",
    ),
    profile: profile as ElectronicSignatureProfile,
    contextId: requiredUuid(source.contextId, "O contexto da reautenticação"),
    issuedAt: requiredTimestamp(source.issuedAt, "A emissão do ticket"),
    expiresAt: requiredTimestamp(source.expiresAt, "A expiração do ticket"),
  };
};

const normalizeConfirmation = (
  value: unknown,
  expectedRequestId: string,
): ElectronicSignatureConfirmationResult => {
  const response = asRecord(
    value,
    "A confirmação retornou um formato inválido.",
  );
  if (response.ok !== true || response.action !== "CONFIRM_SIGNATURE") {
    throw new Error("A assinatura não foi confirmada pelo serviço autorizado.");
  }
  if (
    requiredUuid(response.requestId, "A chave da confirmação") !==
      expectedRequestId
  ) {
    throw new Error(
      "A confirmação respondeu a uma operação diferente da solicitada.",
    );
  }
  const source = asRecord(
    response.data,
    "O resultado da assinatura não foi informado.",
  );
  return {
    envelopeId: requiredUuid(source.envelopeId, "O envelope confirmado"),
    envelopeStatus: requiredString(
      source.envelopeStatus,
      "O status do envelope",
    ),
    participantId: requiredUuid(
      source.participantId,
      "O participante confirmado",
    ),
    participantRole: requiredString(
      source.participantRole,
      "O papel confirmado",
    ),
    participantOrder: requiredInteger(
      source.participantOrder,
      "A ordem confirmada",
    ),
    participantStatus: requiredString(
      source.participantStatus,
      "O status do participante",
    ),
    signedAt: requiredTimestamp(source.signedAt, "O instante da assinatura"),
    nextParticipantId: nullableUuid(
      source.nextParticipantId,
      "O próximo participante",
    ),
    nextParticipantRole: asNullableString(source.nextParticipantRole),
    requiresFinalization: requiredBoolean(
      source.requiresFinalization,
      "A necessidade de finalização",
    ),
  };
};

const normalizeDiaryEnvelopeRequest = (
  value: unknown,
): ElectronicSignatureDiaryEnvelopeRequestResult => {
  const source = asRecord(
    value,
    "A solicitação do diário retornou um formato inválido.",
  );
  assertExactKeys(source, [
    "envelopeId",
    "documentType",
    "originType",
    "originVersion",
    "composerSchemaVersion",
    "academicSnapshotSha256",
    "status",
    "statusLabel",
    "participants",
  ], "A solicitação do diário");
  const participants = normalizeCanonicalDiaryParticipants(source.participants);
  const academicSnapshotSha256 = nullableSha256(
    source.academicSnapshotSha256,
    "O hash do snapshot acadêmico",
  );
  if (!academicSnapshotSha256) {
    throw new Error(
      "O hash do snapshot acadêmico não foi informado pelo serviço autorizado.",
    );
  }
  const documentType = requiredString(
    source.documentType,
    "O tipo do documento",
  );
  const originType = requiredString(source.originType, "A origem do documento");
  const composerSchemaVersion = requiredInteger(
    source.composerSchemaVersion,
    "A versão do compositor",
  );
  if (
    documentType !== "diario_classe" || originType !== "DIARIO" ||
    composerSchemaVersion !== 1
  ) {
    throw new Error(
      "O envelope solicitado não corresponde ao contrato canônico do diário.",
    );
  }
  return {
    envelopeId: requiredUuid(source.envelopeId, "O envelope do diário"),
    documentType,
    originType,
    originVersion: requiredInteger(source.originVersion, "A versão de origem"),
    composerSchemaVersion,
    academicSnapshotSha256,
    status: requiredString(source.status, "O status do envelope"),
    statusLabel: requiredString(source.statusLabel, "O status do envelope"),
    participants,
  };
};

const normalizeOptionalEnvelopeDetail = (
  value: unknown,
): ElectronicSignatureEnvelopeDetail | null => (
  value === null || value === undefined ? null : normalizeEnvelopeDetail(value)
);

const normalizeDiaryArtifact = (
  value: unknown,
  expectedEnvelopeId: string,
): ElectronicSignatureDiaryArtifactResult => {
  const source = asRecord(
    value,
    "O processamento do artefato retornou um formato inválido.",
  );
  assertExactKeys(
    source,
    ["ok", "envelopeId", "status"],
    "O processamento do artefato",
  );
  if (source.ok !== true) {
    throw new Error(
      "O artefato do diário não foi confirmado pelo serviço autorizado.",
    );
  }
  const envelopeId = requiredUuid(source.envelopeId, "O envelope processado");
  if (envelopeId !== expectedEnvelopeId) {
    throw new Error("O serviço processou um envelope diferente do solicitado.");
  }
  return {
    envelopeId,
    status: requiredString(source.status, "O status do artefato"),
  };
};

const normalizeAdministration = (
  value: unknown,
): ElectronicSignatureAdministrationPresentation => {
  const source = firstRpcRecord(
    value,
    "A configuração de assinatura eletrônica retornou um formato inválido.",
  );
  const policy = asRecord(
    source.policy,
    "A política de assinatura eletrônica não foi encontrada.",
  );
  const certificate = asRecord(
    source.certificate,
    "A apresentação do comprovante não foi encontrada.",
  );
  if (!Array.isArray(policy.receiptFields)) {
    throw new Error(
      "Os campos do comprovante não foram informados pelo serviço autorizado.",
    );
  }
  const receiptFields = policy.receiptFields.map((field) => {
    const item = asRecord(field, "Campo de comprovante inválido.");
    const id = requiredString(
      item.id,
      "O identificador do campo do comprovante",
    );
    if (!RECEIPT_FIELD_IDS.includes(id as typeof RECEIPT_FIELD_IDS[number])) {
      throw new Error("Campo de comprovante não reconhecido.");
    }
    return {
      id: id as typeof RECEIPT_FIELD_IDS[number],
      label: requiredString(item.label, "O rótulo do campo do comprovante"),
      description: requiredString(
        item.description,
        "A descrição do campo do comprovante",
      ),
    };
  });
  if (
    receiptFields.length !== RECEIPT_FIELD_IDS.length ||
    receiptFields.some((field, index) => field.id !== RECEIPT_FIELD_IDS[index])
  ) {
    throw new Error(
      "A estrutura de campos do comprovante não corresponde ao contrato autorizado.",
    );
  }

  return {
    poloId: asNullableString(source.polo_id ?? source.poloId),
    version: requiredNumber(source.version, "A versão da configuração"),
    enabled: requiredBoolean(source.enabled, "A habilitação da configuração"),
    legalStatusLabel: requiredString(
      source.legal_status_label ?? source.legalStatusLabel,
      "O status jurídico",
    ),
    certificate: {
      statusLabel: requiredString(
        certificate.statusLabel ?? certificate.status_label,
        "O status do comprovante",
      ),
      description: requiredString(
        certificate.description,
        "A descrição do comprovante",
      ),
    },
    previewIdentity: normalizePreviewIdentity(
      source.previewIdentity ?? source.preview_identity,
    ),
    policy: {
      documentType: requiredString(
        policy.documentType ?? policy.document_type,
        "O tipo do modelo",
      ),
      name: requiredBoundedString(
        policy.name,
        "O nome da política",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.name,
      ),
      versionLabel: requiredBoundedString(
        policy.versionLabel ?? policy.version_label,
        "A versão exibida",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.versionLabel,
      ),
      confirmationMessage: requiredBoundedString(
        policy.confirmationMessage ?? policy.confirmation_message,
        "A mensagem de confirmação",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.confirmationMessage,
      ),
      receiptTitle: requiredBoundedString(
        policy.receiptTitle ?? policy.receipt_title,
        "O título do comprovante",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptTitle,
      ),
      receiptMessage: requiredBoundedString(
        policy.receiptMessage ?? policy.receipt_message,
        "A mensagem do comprovante",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptMessage,
      ),
      receiptFields,
      editor: normalizeEditor(policy.editor),
    },
  };
};

const rpcOrThrow = async <T>(
  name: string,
  args: Record<string, unknown>,
  normalize: (value: unknown) => T,
): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toElectronicSignatureRpcError(error);
  return normalize(data);
};

const invokeReauthentication = async <T>(
  body: Record<string, unknown>,
  normalize: (value: unknown) => T,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_REAUTHENTICATION_FUNCTION,
    { body },
  );
  if (error) {
    const response = error.context && typeof error.context.clone === "function"
      ? error.context.clone()
      : error.context;
    const payload = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const failure = payload && typeof payload === "object" && payload.error &&
        typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    throw new ElectronicSignatureRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Não foi possível confirmar sua identidade para esta assinatura.",
      typeof failure?.code === "string" ? failure.code : "SERVICE_UNAVAILABLE",
      response && typeof response.status === "number" ? response.status : null,
      typeof failure?.retryAfterSeconds === "number"
        ? failure.retryAfterSeconds
        : null,
    );
  }
  return normalize(data);
};

const invokeArchiveArtifact = async (
  body: {
    action: "CREATE_DOWNLOAD_URL";
    envelopeId: string;
    artifactClass: ElectronicSignatureArtifactClass;
    profile: ElectronicSignatureArtifactProfile;
    contextId: string;
    requestId: string;
  },
): Promise<ElectronicSignatureArtifactDownload> => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_ARCHIVE_FUNCTION,
    { body },
  );
  if (error) {
    const response = error.context && typeof error.context.clone === "function"
      ? error.context.clone()
      : error.context;
    const payload = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const failure = payload && typeof payload === "object" && payload.error &&
        typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    throw new ElectronicSignatureRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Não foi possível autorizar o acesso a este documento.",
      typeof failure?.code === "string" ? failure.code : "SERVICE_UNAVAILABLE",
      response && typeof response.status === "number" ? response.status : null,
      null,
    );
  }
  return normalizeArtifactDownload(data, {
    requestId: body.requestId,
    envelopeId: body.envelopeId,
    artifactClass: body.artifactClass,
  });
};

const invokeDiaryArtifacts = async (
  action: ElectronicSignatureDiaryArtifactAction,
  envelopeId: string,
  requestId: string,
) => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_DIARY_ARTIFACTS_FUNCTION,
    { body: { action, envelopeId, requestId } },
  );
  if (error) {
    const response = error.context && typeof error.context.clone === "function"
      ? error.context.clone()
      : error.context;
    const payload = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const failure = payload && typeof payload === "object" && payload.error &&
        typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    throw new ElectronicSignatureRequestError(
      typeof failure?.message === "string"
        ? failure.message
        : "Não foi possível processar o documento oficial do diário.",
      typeof failure?.code === "string" ? failure.code : "SERVICE_UNAVAILABLE",
      response && typeof response.status === "number" ? response.status : null,
      null,
    );
  }
  return normalizeDiaryArtifact(data, envelopeId);
};

const normalizeModelAsset = (value: unknown): ElectronicSignatureModelAsset => {
  const source = asRecord(
    value,
    "O ativo da marca-d'água retornou um formato inválido.",
  );
  const hasCamelCaseKeys = Object.prototype.hasOwnProperty.call(
    source,
    "assetId",
  );
  assertExactKeys(
    source,
    hasCamelCaseKeys
      ? [
        "assetId",
        "signedUrl",
        "mimeType",
        "byteSize",
        "width",
        "height",
        "sha256",
        "expiresIn",
      ]
      : [
        "asset_id",
        "signed_url",
        "mime_type",
        "byte_size",
        "width",
        "height",
        "sha256",
        "expires_in",
      ],
    "O ativo da marca-d'água",
  );
  const assetId = normalizeAssetId(
    hasCamelCaseKeys ? source.assetId : source.asset_id,
    "O identificador do ativo da marca-d'água",
  );
  const signedUrl = stringValue(
    hasCamelCaseKeys ? source.signedUrl : source.signed_url,
    "A URL temporária do ativo da marca-d'água",
    16 * 1024,
  ).trim();
  if (!/^https:\/\//iu.test(signedUrl)) {
    throw new Error(
      "A URL temporária do ativo da marca-d'água não é autorizada.",
    );
  }
  const mimeType = requiredString(
    hasCamelCaseKeys ? source.mimeType : source.mime_type,
    "O tipo do ativo da marca-d'água",
  );
  if (mimeType !== "image/png") {
    throw new Error("O ativo da marca-d'água não é uma imagem PNG autorizada.");
  }
  const byteSize = requiredInteger(
    hasCamelCaseKeys ? source.byteSize : source.byte_size,
    "O tamanho do ativo da marca-d'água",
  );
  if (
    byteSize < 1 ||
    byteSize > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxBytes
  ) {
    throw new Error(
      "O tamanho do ativo da marca-d'água está fora do limite autorizado.",
    );
  }
  const width = requiredInteger(
    source.width,
    "A largura do ativo da marca-d'água",
  );
  const height = requiredInteger(
    source.height,
    "A altura do ativo da marca-d'água",
  );
  if (
    width < 1 ||
    height < 1 ||
    width > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxDimension ||
    height > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxDimension ||
    width * height > ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS.maxPixels
  ) {
    throw new Error(
      "As dimensões do ativo da marca-d'água estão fora do limite autorizado.",
    );
  }
  const sha256 = requiredString(
    source.sha256,
    "O hash do ativo da marca-d'água",
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new Error("O hash do ativo da marca-d'água não é válido.");
  }
  const expiresIn = requiredInteger(
    hasCamelCaseKeys ? source.expiresIn : source.expires_in,
    "A validade da URL temporária do ativo da marca-d'água",
  );
  if (expiresIn < 1 || expiresIn > 86_400) {
    throw new Error(
      "A validade da URL temporária do ativo da marca-d'água está fora do limite autorizado.",
    );
  }
  return {
    assetId,
    signedUrl,
    mimeType,
    byteSize,
    width,
    height,
    sha256,
    expiresIn,
  };
};

const invokeModelAssets = async (
  body: FormData | Record<string, unknown>,
): Promise<ElectronicSignatureModelAsset> => {
  const { data, error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION,
    { body },
  );
  if (error) throw error;
  return normalizeModelAsset(data);
};

const cleanupModelAsset = async (assetId: string): Promise<void> => {
  const { error } = await supabase.functions.invoke(
    ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION,
    {
      body: {
        action: "cleanup",
        assetId,
      },
    },
  );
  if (error) throw error;
};

const getInboxSection = (params: {
  profile: ElectronicSignatureProfile;
  contextId: string;
  poloId?: string | null;
  status: "PENDENTES" | "ASSINADOS";
  limit?: number;
  cursor?: ElectronicSignatureInboxCursor | null;
}) =>
  rpcOrThrow(
    "assinatura_eletronica_listar_caixa_contexto",
    {
      p_perfil: params.profile,
      p_context_id: requiredUuid(
        params.contextId,
        "O contexto da caixa de assinaturas",
      ),
      p_status: params.status,
      p_polo_id: params.poloId
        ? requiredUuid(params.poloId, "O polo da caixa de assinaturas")
        : null,
      p_limite: params.limit ?? 50,
      p_cursor_updated_at: params.cursor?.updatedAt ?? null,
      p_cursor_envelope_id: params.cursor?.envelopeId ?? null,
    },
    normalizeInboxPage,
  );

/**
 * Camada de fronteira do cliente. Nenhuma regra de estado, elegibilidade,
 * sequência de signatários ou autorização é calculada aqui: cada RPC devolve
 * a decisão canônica do banco já no formato de apresentação.
 */
export const electronicSignatureService = {
  getAdministration: (params: {
    poloId?: string | null;
    documentType?: string;
  } = {}) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_configuracao",
      {
        p_polo_id: params.poloId ?? null,
        p_documento: params.documentType ??
          ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT,
      },
      normalizeAdministration,
    ),

  saveAdministration: (params: {
    poloId?: string | null;
    documentType?: string;
    draft: ElectronicSignatureAdministrationDraft;
    expectedVersion: number;
    requestId?: string | null;
  }) => {
    if (
      !Number.isInteger(params.expectedVersion) || params.expectedVersion < 0
    ) {
      throw new Error(
        "A versão-base do modelo não foi informada pelo serviço autorizado.",
      );
    }
    return rpcOrThrow(
      "assinatura_eletronica_salvar_configuracao",
      {
        p_polo_id: params.poloId ?? null,
        p_documento: params.documentType ??
          ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT,
        p_configuracao: {
          ...params.draft,
          expectedVersion: params.expectedVersion,
        },
        p_request_id: params.requestId ?? null,
      },
      normalizeAdministration,
    );
  },

  /**
   * A Edge Function autoriza e armazena o PNG; o cliente só recebe o UUID e
   * a URL temporária de prévia. Não existe upload direto a Storage nesta UI.
   */
  uploadModelAsset: async (file: File) => {
    await validateElectronicSignatureModelAssetUpload(file);
    const form = new FormData();
    form.append("action", "upload");
    form.append("file", file, file.name || "marca-dagua.png");
    return invokeModelAssets(form);
  },

  /** A autorização de leitura e a URL assinada são decisão exclusiva da Edge Function. */
  getModelAsset: async (assetId: string) => {
    const normalizedAssetId = normalizeAssetId(
      assetId,
      "O identificador do ativo da marca-d'água",
    );
    const asset = await invokeModelAssets({
      action: "resolve-preview",
      assetId: normalizedAssetId,
    });
    if (asset.assetId !== normalizedAssetId) {
      throw new Error("A prévia retornou um ativo diferente do solicitado.");
    }
    return asset;
  },

  /**
   * O único caminho para o compositor: URL assinada, tamanho, dimensões e
   * SHA-256 são conferidos antes de a imagem virar um data URL efêmero.
   */
  getVerifiedModelAsset: async (assetId: string) =>
    verifyElectronicSignatureModelAssetDownload(
      await electronicSignatureService.getModelAsset(assetId),
    ),

  /**
   * Limpa somente um upload transitório ainda fora de uma versão salva. A UI
   * não espera essa chamada e nunca tenta apagar ativos vinculados ao histórico.
   */
  cleanupModelAsset: async (assetId: string) =>
    cleanupModelAsset(
      normalizeAssetId(assetId, "O identificador do ativo da marca-d'água"),
    ),

  getInboxSection,

  listGestorArchive: (params: {
    contextId: string;
    poloId?: string | null;
    filters: ElectronicSignatureArchiveFilters;
    limit?: number;
    cursor?: ElectronicSignatureArchiveCursor | null;
  }) => {
    if (!["TODOS", "ASSINADO", "SUBSTITUIDO"].includes(params.filters.status)) {
      throw new Error("O filtro de status do acervo não foi reconhecido.");
    }
    if (
      params.filters.documentType !== null &&
      params.filters.documentType !== "diario_classe"
    ) {
      throw new Error("O filtro de documento do acervo não foi reconhecido.");
    }
    const search = params.filters.search.trim();
    if (search.length > 120) {
      throw new Error("A busca do acervo excedeu o limite autorizado.");
    }
    if (
      [...params.filters.search].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      })
    ) {
      throw new Error("A busca do acervo contém caracteres inválidos.");
    }
    const limit = params.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("O tamanho da página do acervo é inválido.");
    }
    const range = normalizeArchiveDateRange(params.filters);
    const cursor = params.cursor
      ? {
        finalizedAt: requiredTimestamp(
          params.cursor.finalizedAt,
          "A finalização do cursor do acervo",
        ),
        envelopeId: requiredUuid(
          params.cursor.envelopeId,
          "O envelope do cursor do acervo",
        ),
      }
      : null;
    return rpcOrThrow(
      "assinatura_eletronica_listar_acervo_gestor",
      {
        p_context_id: requiredUuid(params.contextId, "O contexto do acervo"),
        p_polo_id: params.poloId
          ? requiredUuid(params.poloId, "O polo do acervo")
          : null,
        p_documento: params.filters.documentType,
        p_status: params.filters.status,
        p_busca: search || null,
        p_turma_id: params.filters.turmaId
          ? requiredUuid(params.filters.turmaId, "A turma do acervo")
          : null,
        p_finalizado_de: range.finalizedFrom,
        p_finalizado_ate: range.finalizedToExclusive,
        p_limite: limit,
        p_cursor_finalizado_em: cursor?.finalizedAt ?? null,
        p_cursor_envelope_id: cursor?.envelopeId ?? null,
      },
      normalizeArchivePage,
    );
  },

  getEnvelope: (params: {
    envelopeId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_envelope",
      {
        p_envelope_id: requiredUuid(params.envelopeId, "O envelope solicitado"),
        p_perfil: params.profile,
        p_context_id: requiredUuid(params.contextId, "O contexto do envelope"),
      },
      normalizeEnvelopeDetail,
    ),

  getConsentTerm: (params: {
    envelopeId: string;
    participantId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_termo",
      {
        p_envelope_id: requiredUuid(
          params.envelopeId,
          "O envelope do termo de aceite",
        ),
        p_participante_id: requiredUuid(
          params.participantId,
          "O participante do termo de aceite",
        ),
        p_perfil: params.profile,
        p_context_id: requiredUuid(
          params.contextId,
          "O contexto do termo de aceite",
        ),
      },
      normalizeConsentTerm,
    ),

  createArtifactDownloadUrl: (params: {
    envelopeId: string;
    artifactClass: ElectronicSignatureArtifactClass;
    profile: ElectronicSignatureArtifactProfile;
    contextId: string;
    requestId: string;
  }) => {
    const body = {
      action: "CREATE_DOWNLOAD_URL" as const,
      envelopeId: requiredUuid(params.envelopeId, "O envelope do artefato"),
      artifactClass: normalizeArtifactClass(params.artifactClass),
      profile: normalizeArtifactProfile(params.profile),
      contextId: requiredUuid(params.contextId, "O contexto do artefato"),
      requestId: requiredUuid(params.requestId, "A chave do download"),
    };
    return invokeArchiveArtifact(body);
  },

  getCurrentDiaryEnvelope: (params: {
    turmaId: string;
    disciplinaId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_obter_envelope_diario_atual",
      {
        p_turma_id: requiredUuid(params.turmaId, "A turma do diário"),
        p_disciplina_id: requiredUuid(
          params.disciplinaId,
          "A disciplina do diário",
        ),
        p_perfil: params.profile,
        p_context_id: requiredUuid(params.contextId, "O contexto do diário"),
      },
      normalizeOptionalEnvelopeDetail,
    ),

  requestDiaryEnvelope: (params: {
    turmaId: string;
    disciplinaId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
    requestId: string;
  }) =>
    rpcOrThrow(
      "assinatura_eletronica_solicitar_envelope_diario",
      {
        p_turma_id: requiredUuid(params.turmaId, "A turma do diário"),
        p_disciplina_id: requiredUuid(
          params.disciplinaId,
          "A disciplina do diário",
        ),
        p_perfil: params.profile,
        p_context_id: requiredUuid(params.contextId, "O contexto do diário"),
        p_request_id: requiredUuid(
          params.requestId,
          "A chave da solicitação do diário",
        ),
      },
      normalizeDiaryEnvelopeRequest,
    ),

  processDiaryArtifact: (params: {
    action: ElectronicSignatureDiaryArtifactAction;
    envelopeId: string;
    requestId: string;
  }) =>
    invokeDiaryArtifacts(
      params.action,
      requiredUuid(params.envelopeId, "O envelope do artefato"),
      requiredUuid(params.requestId, "A chave do artefato"),
    ),

  reauthenticateForSignature: (params: {
    envelopeId: string;
    participantId: string;
    profile: ElectronicSignatureProfile;
    contextId: string;
    requestId: string;
    password: string;
    consent: ElectronicSignatureConsentEvidence;
  }) => {
    const password = params.password;
    if (!password || password.length > 512) {
      throw new ElectronicSignatureRequestError(
        "Informe sua senha atual para continuar.",
        "INVALID_REQUEST",
        400,
        null,
      );
    }
    const requestId = requiredUuid(params.requestId, "A chave da assinatura");
    const envelopeId = requiredUuid(
      params.envelopeId,
      "O envelope da assinatura",
    );
    const participantId = requiredUuid(
      params.participantId,
      "O participante da assinatura",
    );
    const contextId = requiredUuid(
      params.contextId,
      "O contexto da assinatura",
    );
    if (params.consent?.accepted !== true) {
      throw new ElectronicSignatureRequestError(
        "Confirme o aceite do termo para continuar.",
        "INVALID_REQUEST",
        400,
        null,
      );
    }
    const consent: ElectronicSignatureConsentEvidence = {
      accepted: true,
      termId: requiredBoundedString(
        params.consent.termId,
        "O identificador do termo de aceite",
        160,
      ),
      sha256: normalizeRequiredSha256(
        params.consent.sha256,
        "O hash do termo de aceite",
      ),
    };
    return invokeReauthentication(
      {
        action: "REAUTHENTICATE",
        envelopeId,
        participantId,
        profile: params.profile,
        contextId,
        requestId,
        password,
        consent,
      },
      (value) => {
        const result = normalizeReauthentication(value, requestId);
        if (
          result.envelopeId !== envelopeId ||
          result.participantId !== participantId ||
          result.profile !== params.profile ||
          result.contextId !== contextId
        ) {
          throw new Error(
            "A reautenticação não corresponde ao envelope e ao perfil solicitados.",
          );
        }
        return result;
      },
    );
  },

  confirmSignature: (params: {
    requestId: string;
    ticket: string;
  }) => {
    const requestId = requiredUuid(params.requestId, "A chave da assinatura");
    return invokeReauthentication(
      {
        action: "CONFIRM_SIGNATURE",
        requestId,
        ticket: requiredBoundedString(
          params.ticket,
          "O ticket de reautenticação",
          2_048,
        ),
      },
      (value) => normalizeConfirmation(value, requestId),
    );
  },

  /**
   * Cada aba é solicitada explicitamente ao banco. O cliente não reclassifica
   * nem filtra envelopes: apenas reúne as duas respostas canônicas para a UI.
   */
  getInbox: async (params: {
    profile: ElectronicSignatureProfile;
    contextId: string;
    poloId?: string | null;
    limit?: number;
  }): Promise<ElectronicSignatureInbox> => {
    const [pending, signed] = await Promise.all([
      getInboxSection({
        ...params,
        status: "PENDENTES",
      }),
      getInboxSection({
        ...params,
        status: "ASSINADOS",
      }),
    ]);
    return {
      pending: pending.items,
      signed: signed.items,
      pendingEmptyMessage: DEFAULT_INBOX_EMPTY_MESSAGE,
      signedEmptyMessage: DEFAULT_INBOX_EMPTY_MESSAGE,
    };
  },
};
