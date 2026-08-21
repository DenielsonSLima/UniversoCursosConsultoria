import type { jsPDF } from "jspdf";

import {
  type CanonicalPdfImage,
  drawCanonicalPdfText,
  drawCanonicalPdfWatermark,
  getCanonicalPdfInlineImage,
} from "../shared/canonical-document-vector-pdf.core.ts";
import {
  type CanonicalInstitutionalHeader,
  drawCanonicalInstitutionalHeader,
} from "../shared/canonical-institutional-header-pdf.ts";
import type { CanonicalDocumentPdfResult } from "../shared/canonical-document-pdf.types.ts";
import {
  ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS,
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS,
  ELECTRONIC_SIGNATURE_STAMP_ROLES,
  type ElectronicSignatureDocumentEditor,
  type ElectronicSignatureInstitutionalWatermarkSettings,
  type ElectronicSignatureLegalSection,
  type ElectronicSignaturePageWatermark,
  type ElectronicSignaturePolicyPresentation,
  type ElectronicSignatureStampContentLayout,
  type ElectronicSignatureStampEditor,
  type ElectronicSignatureStampPlacement,
  type ElectronicSignatureStampRole,
  type ElectronicSignatureStampSlot,
  type ElectronicSignatureStampTemplateElement,
  type ElectronicSignatureStampTemplateFont,
  type ElectronicSignatureStampTemplateHiddenElementId,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  isCanonicalInstitutionalWatermarkDataUri,
} from "../../../shared/assinatura-eletronica/canonical-institutional-watermark.ts";
import {
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
  signatureStampPlacementsOverlap,
} from "../../../shared/assinatura-eletronica/signature-stamp-placement.ts";
import {
  createDefaultElectronicSignatureStampTemplate,
  deriveAutomaticSignatureStampPlacements,
  getSignatureStampTemplateElementVisualBoundsForSurface,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
} from "../../../shared/assinatura-eletronica/signature-stamp-template.ts";
import { getDocumentValidationQrValue } from "../../../shared/document-validation/document-validation.qr.ts";
import { formatDocumentValidationUrlForDisplay } from "../../../shared/document-validation/document-validation.url.ts";
import { createLocalQrCodeDataUrl } from "../../../shared/qrcode/local-qrcode.ts";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_LEFT = 20;
const PAGE_RIGHT = 20;
const MAX_PARTICIPANTS = ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS;
const MAX_EVENTS = 8;
const PUBLIC_VALIDATION_QUERY_KEY = "code";
const HASH_LENGTH_BY_ALGORITHM = {
  "SHA-256": 64,
  "SHA-512": 128,
} as const;

const SENSITIVE_PUBLIC_CONTENT = [
  /\b\d{3}[.]?\d{3}[.]?\d{3}-?\d{2}\b/u,
  /\b(?:\d{1,3}[.]){3}\d{1,3}\b/u,
  /\b(?:cpf|ip|sess[aã]o|session|senha|password|pin|otp|token|bearer|cookie)\b/iu,
];
const UNSAFE_EDITOR_TEXT = /(?:https?:\/\/|www\.|<[^>]*>|\[[^\]]+\]\s*\()/iu;

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

export const ELECTRONIC_SIGNATURE_RECEIPT_STATUSES = [
  "ASSINADO",
  "RECUSADO",
  "CANCELADO",
  "SUBSTITUIDO",
] as const;

export type ElectronicSignatureReceiptStatus =
  typeof ELECTRONIC_SIGNATURE_RECEIPT_STATUSES[number];

export const ELECTRONIC_SIGNATURE_RECEIPT_EVENT_TYPES = [
  "DOCUMENTO_FECHADO",
  "DOCUMENTO_DISPONIBILIZADO",
  "LEITURA_CONFIRMADA",
  "AUTENTICACAO_CONFIRMADA",
  "ASSINATURA_CONCLUIDA",
  "RECUSA_REGISTRADA",
  "CANCELAMENTO_REGISTRADO",
  "VERSAO_SUBSTITUIDA",
] as const;

export type ElectronicSignatureReceiptEventType =
  typeof ELECTRONIC_SIGNATURE_RECEIPT_EVENT_TYPES[number];

export const ELECTRONIC_SIGNATURE_RECEIPT_METHODS = [
  "SENHA_REAUTENTICADA",
  "CONTA_E_PIN",
  "CONTA_E_OTP",
  "ASSINATURA_AVANCADA_EXTERNA",
  "ICP_BRASIL",
] as const;

export type ElectronicSignatureReceiptMethod =
  typeof ELECTRONIC_SIGNATURE_RECEIPT_METHODS[number];

export type ElectronicSignatureReceiptHashAlgorithm =
  keyof typeof HASH_LENGTH_BY_ALGORITHM;

export interface ElectronicSignatureReceiptHash {
  algorithm: ElectronicSignatureReceiptHashAlgorithm;
  value: string;
}

/**
 * Dados já autorizados pelo backend para a representação visual do comprovante.
 * Campos técnicos sensíveis não fazem parte deste contrato por desenho.
 */
export interface ElectronicSignatureReceiptParticipant {
  id: string;
  name: string;
  role: string;
}

export interface ElectronicSignatureReceiptEvent {
  type: ElectronicSignatureReceiptEventType;
  occurredAt: string;
  participantId?: string | null;
  method?: ElectronicSignatureReceiptMethod | null;
  /** Exibido apenas para recusa, cancelamento ou substituição após validação segura. */
  reason?: string | null;
}

/**
 * Apresentação congelada pelo backend junto do envelope. Nunca deve ser
 * montada a partir de formulário do navegador no momento de gerar o PDF.
 */
export interface ElectronicSignatureReceiptPresentation {
  policyName: string;
  policyVersionLabel: string;
  confirmationMessage: string;
  receiptTitle: string;
  receiptMessage: string;
  editor: ElectronicSignatureDocumentEditor;
}

export type ElectronicSignatureStampAssets = Readonly<
  Record<string, CanonicalPdfImage>
>;

/**
 * Recurso institucional já congelado junto do documento. A apresentação é
 * parte do modelo oficial: não se reconstrói uma marca genérica no PDF.
 * `settings: null` existe exclusivamente para manter a reprodução dos
 * comprovantes históricos emitidos antes da configuração ser congelada.
 */
export interface ElectronicSignatureInstitutionalWatermark {
  image: CanonicalPdfImage;
  settings: ElectronicSignatureInstitutionalWatermarkSettings | null;
}

/**
 * Adaptador puro do snapshot de política entregue pelo servidor. O chamador
 * deve utilizar apenas a versão imutável vinculada ao envelope, nunca o
 * formulário aberto no navegador.
 */
export const toElectronicSignatureReceiptPresentation = (
  policy: Pick<
    ElectronicSignaturePolicyPresentation,
    | "name"
    | "versionLabel"
    | "confirmationMessage"
    | "receiptTitle"
    | "receiptMessage"
    | "editor"
  >,
): ElectronicSignatureReceiptPresentation => ({
  policyName: policy.name,
  policyVersionLabel: policy.versionLabel,
  confirmationMessage: policy.confirmationMessage,
  receiptTitle: policy.receiptTitle,
  receiptMessage: policy.receiptMessage,
  editor: policy.editor,
});

export interface ElectronicSignatureReceiptPayload {
  institution: CanonicalInstitutionalHeader;
  logo: CanonicalPdfImage | null;
  /** Marca-d'água canônica congelada no manifesto do documento. */
  institutionalWatermark: ElectronicSignatureInstitutionalWatermark | null;
  presentation: ElectronicSignatureReceiptPresentation;
  document: {
    type: string;
    reference: string;
    version: string;
    /** Hash dos bytes congelados antes de qualquer carimbo. */
    originalHash: ElectronicSignatureReceiptHash;
    /** Hash dos bytes finais depois dos dois carimbos vetoriais. */
    hash: ElectronicSignatureReceiptHash;
  };
  status: ElectronicSignatureReceiptStatus;
  participants: readonly ElectronicSignatureReceiptParticipant[];
  events: readonly ElectronicSignatureReceiptEvent[];
  validation: {
    code: string;
    url?: string | null;
  };
}

/**
 * A prévia recebe somente apresentação e identidade. Por desenho não existe
 * campo para status, pessoa, evento, hash, método, QR, código ou URL.
 */
export interface ElectronicSignatureTemplatePreviewPayload {
  institution: CanonicalInstitutionalHeader;
  logo: CanonicalPdfImage | null;
  institutionalWatermark: ElectronicSignatureInstitutionalWatermark | null;
  /** Ativo visual próprio do carimbo; nunca é reutilizado como marca-d'água. */
  signatureStampAssets: ElectronicSignatureStampAssets;
  presentation: ElectronicSignatureReceiptPresentation;
}

interface PreparedElectronicSignatureReceipt {
  payload: ElectronicSignatureReceiptPayload;
  validationUrl: string;
  validationCode: string;
  qr: CanonicalPdfImage;
  participantsById: Map<string, ElectronicSignatureReceiptParticipant>;
}

const statusLabels: Record<ElectronicSignatureReceiptStatus, string> = {
  ASSINADO: "ASSINADO",
  RECUSADO: "RECUSADO",
  CANCELADO: "CANCELADO",
  SUBSTITUIDO: "SUBSTITUÍDO",
};

const statusColors: Record<
  ElectronicSignatureReceiptStatus,
  readonly [number, number, number]
> = {
  ASSINADO: [22, 101, 52],
  RECUSADO: [185, 28, 28],
  CANCELADO: [146, 64, 14],
  SUBSTITUIDO: [30, 64, 175],
};

const eventLabels: Record<ElectronicSignatureReceiptEventType, string> = {
  DOCUMENTO_FECHADO: "Documento fechado e integridade registrada",
  DOCUMENTO_DISPONIBILIZADO: "Documento disponibilizado aos participantes",
  LEITURA_CONFIRMADA: "Leitura e concordância registradas",
  AUTENTICACAO_CONFIRMADA: "Autenticação confirmada",
  ASSINATURA_CONCLUIDA: "Assinatura eletrônica concluída",
  RECUSA_REGISTRADA: "Recusa registrada",
  CANCELAMENTO_REGISTRADO: "Cancelamento registrado",
  VERSAO_SUBSTITUIDA: "Versão substituída com preservação do original",
};

const methodLabels: Record<ElectronicSignatureReceiptMethod, string> = {
  SENHA_REAUTENTICADA: "Senha da conta reautenticada",
  CONTA_E_PIN: "Conta autenticada e PIN",
  CONTA_E_OTP: "Conta autenticada e segundo fator",
  ASSINATURA_AVANCADA_EXTERNA: "Assinatura avançada externa",
  ICP_BRASIL: "Certificado ICP-Brasil",
};

const assertString = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!normalized) {
    throw new Error(`${label} e obrigatorio para gerar o comprovante.`);
  }
  if (normalized.length > maximumLength) {
    throw new Error(`${label} excede o limite permitido para o comprovante.`);
  }
  if (SENSITIVE_PUBLIC_CONTENT.some((pattern) => pattern.test(normalized))) {
    throw new Error(
      `${label} contem dado tecnico ou pessoal que nao pode constar no comprovante.`,
    );
  }
  return normalized;
};

const assertIdentifier = (value: unknown, label: string) => {
  const normalized = assertString(value, label, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(normalized)) {
    throw new Error(`${label} possui formato invalido para o comprovante.`);
  }
  return normalized;
};

const assertEditorText = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const normalized = assertString(value, label, maximumLength);
  if (UNSAFE_EDITOR_TEXT.test(normalized)) {
    throw new Error(
      `${label} contem HTML, Markdown ou URL livre que nao pode constar no modelo.`,
    );
  }
  return normalized;
};

const parseOccurredAt = (value: string, label: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} possui data e hora invalidas.`);
  }
  return parsed;
};

const formatOccurredAt = (value: string) => {
  const instant = parseOccurredAt(value, "O evento");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const displayedUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((displayedUtc - instant.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");
  return [
    `${parts.day}/${parts.month}/${parts.year}`,
    `${parts.hour}:${parts.minute}:${parts.second} UTC${sign}${offsetHours}:${offsetRemainder}`,
  ] as const;
};

const validateHash = (
  hash: ElectronicSignatureReceiptHash,
) => {
  const expectedLength = HASH_LENGTH_BY_ALGORITHM[hash.algorithm];
  const value = String(hash.value || "").trim().toLowerCase();
  if (
    !expectedLength ||
    !new RegExp(`^[a-f0-9]{${expectedLength}}$`, "u").test(value)
  ) {
    throw new Error(`O hash ${hash.algorithm} do documento e invalido.`);
  }
  return value;
};

type EditorRecord = Record<string, unknown>;

const asEditorRecord = (value: unknown, label: string): EditorRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} e invalido.`);
  }
  return value as EditorRecord;
};

const assertExactEditorKeys = (
  source: EditorRecord,
  expected: readonly string[],
  label: string,
) => {
  const keys = Object.keys(source).sort();
  const canonical = [...expected].sort();
  if (
    keys.length !== canonical.length ||
    keys.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} nao corresponde ao contrato autorizado.`);
  }
};

const ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const prepareWatermark = (
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
const legacyPreparedSignatureStamp = (
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

const prepareSignatureStamp = (
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

const prepareGlobalSignatureStamp = (
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
const prepareEditor = (source: unknown): ElectronicSignatureDocumentEditor => {
  const editor = asEditorRecord(source, "O editor do comprovante");
  const rawSchemaVersion = editor.schemaVersion;
  if (
    rawSchemaVersion !== 1 && rawSchemaVersion !== 2 &&
    rawSchemaVersion !== 3 &&
    rawSchemaVersion !== 4 &&
    rawSchemaVersion !== 5
  ) {
    throw new Error("A versão do editor do comprovante não é suportada.");
  }
  const schemaVersion = rawSchemaVersion;
  assertExactEditorKeys(
    editor,
    schemaVersion >= 3
      ? ["schemaVersion", "pages", "signatureStamp"]
      : ["schemaVersion", "pages"],
    "O editor do comprovante",
  );
  if (!Array.isArray(editor.pages) || editor.pages.length !== 2) {
    throw new Error(
      `O editor do comprovante deve conter exatamente duas paginas no schema ${schemaVersion}.`,
    );
  }
  const page1 = asEditorRecord(editor.pages[0], "A pagina 1 do editor");
  const page2 = asEditorRecord(editor.pages[1], "A pagina 2 do editor");
  assertExactEditorKeys(
    page1,
    schemaVersion === 4 || schemaVersion === 5
      ? ["page", "template"]
      : ["page", "template", "watermark"],
    "A pagina 1 do editor",
  );
  assertExactEditorKeys(
    page2,
    schemaVersion === 4 || schemaVersion === 5
      ? ["page", "template", "sections"]
      : ["page", "template", "sections", "watermark"],
    "A pagina 2 do editor",
  );
  if (page1.page !== 1 || page1.template !== "EVIDENCE") {
    throw new Error("A pagina 1 deve usar o modelo canonico de evidencias.");
  }
  if (page2.page !== 2 || page2.template !== "LEGAL_TEXTS") {
    throw new Error(
      "A pagina 2 deve usar o modelo canonico de textos juridicos.",
    );
  }
  if (
    !Array.isArray(page2.sections) ||
    page2.sections.length !== ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS.length
  ) {
    throw new Error(
      "A pagina 2 deve conter os cinco blocos juridicos canonicos.",
    );
  }
  const sections = page2.sections.map(
    (value, index): ElectronicSignatureLegalSection => {
      const section = asEditorRecord(value, `O bloco juridico ${index + 1}`);
      assertExactEditorKeys(
        section,
        ["id", "title", "body"],
        `O bloco juridico ${index + 1}`,
      );
      const expectedId = ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS[index];
      if (section.id !== expectedId) {
        throw new Error(
          "A ordem dos blocos juridicos do comprovante e invalida.",
        );
      }
      return {
        id: expectedId,
        title: assertEditorText(
          section.title,
          `O titulo do bloco juridico ${index + 1}`,
          ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionTitle,
        ),
        body: assertEditorText(
          section.body,
          `O texto do bloco juridico ${index + 1}`,
          ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionBody,
        ),
      };
    },
  );
  if (
    sections.reduce((total, section) => total + section.body.length, 0) >
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionsBodyTotal
  ) {
    throw new Error(
      "O conjunto de textos juridicos excede a area segura do comprovante.",
    );
  }
  if (
    schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3
  ) {
    prepareWatermark(page1.watermark, 1, schemaVersion);
    prepareWatermark(page2.watermark, 2, schemaVersion);
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
      ? prepareGlobalSignatureStamp(editor.signatureStamp)
      : schemaVersion === 3 || schemaVersion === 4
      ? legacyPreparedSignatureStamp(
        prepareSignatureStamp(editor.signatureStamp, schemaVersion),
      )
      : legacyPreparedSignatureStamp(),
  };
};

const preparePresentation = (
  source: ElectronicSignatureReceiptPresentation,
): ElectronicSignatureReceiptPresentation => ({
  policyName: assertEditorText(
    source?.policyName,
    "O nome da política",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.name,
  ),
  policyVersionLabel: assertString(
    source?.policyVersionLabel,
    "A versão da política",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.versionLabel,
  ),
  confirmationMessage: assertEditorText(
    source?.confirmationMessage,
    "A mensagem de confirmação",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.confirmationMessage,
  ),
  receiptTitle: assertEditorText(
    source?.receiptTitle,
    "O título do comprovante",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptTitle,
  ),
  receiptMessage: assertEditorText(
    source?.receiptMessage,
    "A mensagem do comprovante",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptMessage,
  ),
  editor: prepareEditor(source?.editor),
});

const validatePublicValidationUrl = (
  rawUrl: string,
  expectedCode: string,
  canonicalUrl: string,
) => {
  let url: URL;
  let expectedUrl: URL;
  try {
    url = new URL(rawUrl);
    expectedUrl = new URL(canonicalUrl);
  } catch {
    throw new Error("A URL de validacao do comprovante e invalida.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.origin !== expectedUrl.origin ||
    url.pathname !== expectedUrl.pathname
  ) {
    throw new Error(
      "A URL de validacao do comprovante nao pertence ao validador institucional canonico.",
    );
  }
  const parameters = [...url.searchParams.entries()];
  if (
    parameters.length !== 1 ||
    parameters[0][0] !== PUBLIC_VALIDATION_QUERY_KEY ||
    parameters[0][1] !== expectedCode
  ) {
    throw new Error(
      "A URL de validacao so pode transportar o codigo publico do documento.",
    );
  }
  return url.toString();
};

const assertFinalStatusHasEvidence = (
  status: ElectronicSignatureReceiptStatus,
  events: readonly ElectronicSignatureReceiptEvent[],
) => {
  const requiredEvent: Record<
    ElectronicSignatureReceiptStatus,
    ElectronicSignatureReceiptEventType
  > = {
    ASSINADO: "ASSINATURA_CONCLUIDA",
    RECUSADO: "RECUSA_REGISTRADA",
    CANCELADO: "CANCELAMENTO_REGISTRADO",
    SUBSTITUIDO: "VERSAO_SUBSTITUIDA",
  };
  const finalEvent = events.at(-1);
  if (!finalEvent || finalEvent.type !== requiredEvent[status]) {
    throw new Error(
      `O status ${status} exige o evento terminal correspondente no relatorio de evidencias.`,
    );
  }
  if (
    status === "ASSINADO" && (!finalEvent.participantId || !finalEvent.method)
  ) {
    throw new Error(
      "A assinatura concluida exige participante e metodo de autenticacao no evento terminal.",
    );
  }
  if (
    status === "RECUSADO" && (!finalEvent.participantId || !finalEvent.reason)
  ) {
    throw new Error("A recusa exige participante e motivo no evento terminal.");
  }
  if (status === "CANCELADO" && !finalEvent.reason) {
    throw new Error("O cancelamento exige motivo no evento terminal.");
  }
  if (status === "SUBSTITUIDO" && !finalEvent.reason) {
    throw new Error("A substituicao exige motivo no evento terminal.");
  }
};

const prepareReceipt = async (
  payload: ElectronicSignatureReceiptPayload,
  canonicalValidationUrl?: string,
): Promise<PreparedElectronicSignatureReceipt> => {
  const documentType = assertString(
    payload.document?.type,
    "O tipo do documento",
    80,
  );
  const reference = assertString(
    payload.document?.reference,
    "A referencia do documento",
    100,
  );
  const version = assertString(
    payload.document?.version,
    "A versao do documento",
    40,
  );
  const originalHash = validateHash(payload.document.originalHash);
  const hash = validateHash(payload.document.hash);
  if (originalHash === hash) {
    throw new Error(
      "Os hashes do documento original e do documento final precisam ser distintos.",
    );
  }
  const presentation = preparePresentation(payload.presentation);
  const status = payload.status;
  if (!ELECTRONIC_SIGNATURE_RECEIPT_STATUSES.includes(status)) {
    throw new Error("O status do comprovante e invalido.");
  }
  if (!Array.isArray(payload.participants) || !payload.participants.length) {
    throw new Error("O comprovante exige ao menos um participante.");
  }
  if (payload.participants.length > MAX_PARTICIPANTS) {
    throw new Error(
      `O comprovante suporta ate ${MAX_PARTICIPANTS} participantes no payload canonico.`,
    );
  }
  if (!Array.isArray(payload.events) || !payload.events.length) {
    throw new Error("O comprovante exige ao menos um evento de evidencia.");
  }
  if (payload.events.length > MAX_EVENTS) {
    throw new Error(
      `O comprovante suporta ate ${MAX_EVENTS} eventos no payload canonico.`,
    );
  }

  const participantsById = new Map<
    string,
    ElectronicSignatureReceiptParticipant
  >();
  payload.participants.forEach((participant, index) => {
    const id = assertIdentifier(
      participant.id,
      `O identificador do participante ${index + 1}`,
    );
    if (participantsById.has(id)) {
      throw new Error(
        "Os participantes do comprovante precisam ter identificadores unicos.",
      );
    }
    participantsById.set(id, {
      id,
      name: assertString(
        participant.name,
        `O nome do participante ${index + 1}`,
        100,
      ),
      role: assertString(
        participant.role,
        `O papel do participante ${index + 1}`,
        80,
      ),
    });
  });

  let previousEventTime = Number.NEGATIVE_INFINITY;
  payload.events.forEach((event, index) => {
    if (!ELECTRONIC_SIGNATURE_RECEIPT_EVENT_TYPES.includes(event.type)) {
      throw new Error(`O tipo do evento ${index + 1} e invalido.`);
    }
    const eventTime = parseOccurredAt(event.occurredAt, `O evento ${index + 1}`)
      .getTime();
    if (eventTime < previousEventTime) {
      throw new Error(
        "Os eventos devem chegar do payload canônico em ordem cronologica.",
      );
    }
    previousEventTime = eventTime;
    if (event.participantId && !participantsById.has(event.participantId)) {
      throw new Error(
        `O evento ${index + 1} referencia um participante inexistente.`,
      );
    }
    if (event.reason) {
      assertString(event.reason, `O motivo do evento ${index + 1}`, 120);
    }
    if (
      event.method &&
      !ELECTRONIC_SIGNATURE_RECEIPT_METHODS.includes(event.method)
    ) {
      throw new Error(`O metodo do evento ${index + 1} e invalido.`);
    }
  });
  assertFinalStatusHasEvidence(status, payload.events);

  const validationCode = assertIdentifier(
    payload.validation?.code,
    "O codigo de validacao",
  );
  const generatedUrl = canonicalValidationUrl ||
    getDocumentValidationQrValue(validationCode);
  const validationUrl = validatePublicValidationUrl(
    payload.validation.url || generatedUrl,
    validationCode,
    generatedUrl,
  );
  const qrDataUrl = await createLocalQrCodeDataUrl(validationUrl, {
    size: 640,
    margin: 1,
    errorCorrectionLevel: "H",
  });
  const qr = getCanonicalPdfInlineImage(qrDataUrl);
  if (!qr) throw new Error("Nao foi possivel preparar o QR Code de validacao.");

  return {
    payload: {
      ...payload,
      presentation,
      document: {
        ...payload.document,
        type: documentType,
        reference,
        version,
        originalHash: { ...payload.document.originalHash, value: originalHash },
        hash: { ...payload.document.hash, value: hash },
      },
      participants: [...participantsById.values()],
    },
    validationUrl,
    validationCode,
    qr,
    participantsById,
  };
};

const drawSectionHeading = (pdf: jsPDF, label: string, y: number) => {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.4);
  pdf.setTextColor(71, 85, 105);
  pdf.text(label.toUpperCase(), PAGE_LEFT, y, { baseline: "top" });
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_LEFT, y + 4.5, PAGE_WIDTH - PAGE_RIGHT, y + 4.5);
};

const drawStatusMessageCard = (
  pdf: jsPDF,
  badgeLabel: string,
  badgeColor: readonly [number, number, number],
  heading: string,
  receiptMessage: string,
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 14, 2, 2, "FD");
  pdf.setFillColor(...badgeColor);
  pdf.roundedRect(PAGE_LEFT + 3, top + 3, 27, 8, 1.6, 1.6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(5.5);
  pdf.text(badgeLabel, PAGE_LEFT + 16.5, top + 5.4, {
    align: "center",
    baseline: "top",
  });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(7.2);
  pdf.text(heading, PAGE_LEFT + 34, top + 3.2, {
    baseline: "top",
  });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.55);
  drawCanonicalPdfText(pdf, receiptMessage, PAGE_LEFT + 34, top + 7.7, {
    maxWidth: width - 38,
    maxLines: 2,
    lineHeight: 1.12,
  });
};

const drawStatusCard = (
  pdf: jsPDF,
  status: ElectronicSignatureReceiptStatus,
  receiptMessage: string,
  top: number,
) =>
  drawStatusMessageCard(
    pdf,
    statusLabels[status],
    statusColors[status],
    "Estado do documento no momento da emissão deste comprovante",
    receiptMessage,
    top,
  );

const drawPreviewStatusCard = (
  pdf: jsPDF,
  receiptMessage: string,
  top: number,
) =>
  drawStatusMessageCard(
    pdf,
    "MODELO",
    [71, 85, 105],
    "Mensagem de apoio configurada para o comprovante",
    receiptMessage,
    top,
  );

const drawReferenceCard = (
  pdf: jsPDF,
  document: ElectronicSignatureReceiptPayload["document"],
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 40, 2, 2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text("DOCUMENTO", PAGE_LEFT + 4, top + 3, { baseline: "top" });
  pdf.text("VERSÃO", PAGE_LEFT + 117, top + 3, { baseline: "top" });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(6.4);
  drawCanonicalPdfText(
    pdf,
    `${document.type} - ${document.reference}`,
    PAGE_LEFT + 4,
    top + 7.1,
    { maxWidth: 108, maxLines: 2, lineHeight: 1.08 },
  );
  pdf.setFont("courier", "bold");
  pdf.setFontSize(6.4);
  drawCanonicalPdfText(
    pdf,
    document.version,
    PAGE_LEFT + 117,
    top + 7.1,
    { maxWidth: width - 121, maxLines: 2, lineHeight: 1.08 },
  );

  pdf.setDrawColor(241, 245, 249);
  pdf.line(PAGE_LEFT + 4, top + 13, PAGE_LEFT + width - 4, top + 13);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text(
    `HASH DO DOCUMENTO ORIGINAL - ${document.originalHash.algorithm}`,
    PAGE_LEFT + 4,
    top + 16.3,
    {
      baseline: "top",
    },
  );
  pdf.setFont("courier", "normal");
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(document.originalHash.algorithm === "SHA-512" ? 3.55 : 4.5);
  const originalHashLines = document.originalHash.algorithm === "SHA-512"
    ? [
      document.originalHash.value.slice(0, 64),
      document.originalHash.value.slice(64),
    ]
    : [document.originalHash.value];
  pdf.text(originalHashLines, PAGE_LEFT + 4, top + 19.7, {
    baseline: "top",
    lineHeightFactor: 1.16,
  });

  const finalHashLabelTop = document.originalHash.algorithm === "SHA-512"
    ? 27.1
    : 24.6;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text(
    `HASH DO DOCUMENTO FINAL - ${document.hash.algorithm}`,
    PAGE_LEFT + 4,
    top + finalHashLabelTop,
    {
      baseline: "top",
    },
  );
  pdf.setFont("courier", "normal");
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(document.hash.algorithm === "SHA-512" ? 3.55 : 4.5);
  const finalHashLines = document.hash.algorithm === "SHA-512"
    ? [document.hash.value.slice(0, 64), document.hash.value.slice(64)]
    : [document.hash.value];
  pdf.text(finalHashLines, PAGE_LEFT + 4, top + finalHashLabelTop + 3.4, {
    baseline: "top",
    lineHeightFactor: 1.16,
  });
};

const drawParticipantGrid = (
  pdf: jsPDF,
  participants: readonly ElectronicSignatureReceiptParticipant[],
  top: number,
) => {
  const columnGap = 5;
  const availableWidth = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const columnWidth = (availableWidth - columnGap) / 2;
  const rows = Math.ceil(participants.length / 2);
  participants.forEach((participant, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE_LEFT + column * (columnWidth + columnGap);
    const y = top + row * 8.3;
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, columnWidth, 6.8, 1.3, 1.3, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(5.7);
    drawCanonicalPdfText(
      pdf,
      participant.name,
      x + 2,
      y + 1.35,
      { maxWidth: columnWidth - 4, maxLines: 1 },
    );
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(4.9);
    drawCanonicalPdfText(
      pdf,
      participant.role,
      x + 2,
      y + 4.05,
      { maxWidth: columnWidth - 4, maxLines: 1 },
    );
  });
  return top + rows * 8.3;
};

const drawEventTimeline = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  top: number,
) => {
  const labelX = PAGE_LEFT + 27;
  const lineX = PAGE_LEFT + 21;
  const descriptionWidth = PAGE_WIDTH - PAGE_RIGHT - labelX;
  const eventHeight = 7.25;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.line(
    lineX,
    top + 2,
    lineX,
    top + (prepared.payload.events.length - 1) * eventHeight + 2,
  );
  prepared.payload.events.forEach((event, index) => {
    const y = top + index * eventHeight;
    const participant = event.participantId
      ? prepared.participantsById.get(event.participantId) || null
      : null;
    const details = [
      participant
        ? `${participant.name} - ${participant.role}`
        : "Sistema institucional",
      event.method ? methodLabels[event.method] : "",
      event.reason
        ? `Motivo: ${assertString(event.reason, "O motivo do evento", 120)}`
        : "",
    ].filter(Boolean).join(" | ");
    pdf.setFillColor(37, 99, 235);
    pdf.circle(lineX, y + 2, 1.3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(4.2);
    const [eventDate, eventTime] = formatOccurredAt(event.occurredAt);
    pdf.text(eventDate, PAGE_LEFT, y - 0.2, {
      baseline: "top",
      maxWidth: 17.5,
    });
    pdf.text(eventTime, PAGE_LEFT, y + 2.1, {
      baseline: "top",
      maxWidth: 19.5,
    });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(5.7);
    drawCanonicalPdfText(
      pdf,
      eventLabels[event.type],
      labelX,
      y - 0.1,
      { maxWidth: descriptionWidth, maxLines: 1 },
    );
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(4.65);
    drawCanonicalPdfText(
      pdf,
      details,
      labelX,
      y + 2.8,
      { maxWidth: descriptionWidth, maxLines: 1 },
    );
  });
  return top + prepared.payload.events.length * eventHeight;
};

const drawValidationCard = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const qrSize = 25;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 31, 2, 2, "FD");
  pdf.addImage(
    prepared.qr.dataUrl,
    prepared.qr.format,
    PAGE_LEFT + 4,
    top + 3,
    qrSize,
    qrSize,
    `comprovante-assinatura-qr-${prepared.validationCode}`,
    "FAST",
  );
  const contentX = PAGE_LEFT + qrSize + 8;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(6.6);
  pdf.text("VALIDAÇÃO PÚBLICA", contentX, top + 4, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.5);
  pdf.text(
    "Confira o estado e a integridade deste comprovante pelo QR Code ou pela URL.",
    contentX,
    top + 8.1,
    {
      baseline: "top",
      maxWidth: width - qrSize - 15,
    },
  );
  pdf.setFont("courier", "bold");
  pdf.setTextColor(29, 78, 216);
  pdf.setFontSize(6.1);
  pdf.text(prepared.validationCode, contentX, top + 13.2, { baseline: "top" });
  pdf.setFont("courier", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(4.45);
  pdf.text(
    formatDocumentValidationUrlForDisplay(prepared.validationUrl),
    contentX,
    top + 17.2,
    {
      baseline: "top",
      maxWidth: width - qrSize - 15,
    },
  );
};

const drawConfirmationCard = (
  pdf: jsPDF,
  confirmationMessage: string,
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const textX = PAGE_LEFT + 4;
  const textWidth = width - 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.8);
  const lines = pdf.splitTextToSize(confirmationMessage, textWidth) as string[];
  if (lines.length > 18) {
    throw new Error(
      "A mensagem de confirmação excede a área segura do comprovante.",
    );
  }
  const height = Math.max(24, 10 + lines.length * 2.45);
  if (top + height > 188) {
    throw new Error(
      "A mensagem de confirmação excede a primeira área segura da segunda página.",
    );
  }
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, height, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.2);
  pdf.text("DECLARAÇÃO DE CONFIRMAÇÃO", textX, top + 3.5, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(5.8);
  pdf.text(lines, textX, top + 8.3, {
    baseline: "top",
    lineHeightFactor: 1.18,
  });
  return top + height;
};

const drawFooter = (pdf: jsPDF, page: 1 | 2) => {
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_LEFT, 278, PAGE_WIDTH - PAGE_RIGHT, 278);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(4.7);
  pdf.text(
    "Este comprovante é uma representação visual das evidências registradas para o documento.",
    PAGE_WIDTH / 2,
    281,
    {
      align: "center",
      baseline: "top",
    },
  );
  pdf.text(
    "Não substitui a consulta ao documento original e ao relatório de evidências.",
    PAGE_WIDTH / 2,
    284.2,
    {
      align: "center",
      baseline: "top",
    },
  );
  pdf.text(`Página ${page} de 2`, PAGE_WIDTH - PAGE_RIGHT, 281, {
    align: "right",
    baseline: "top",
  });
};

const drawInstitutionalWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  institutionalWatermark: ElectronicSignatureInstitutionalWatermark | null,
) => {
  /**
   * A origem retrato configurada no polo é resolvida e congelada antes de
   * chegar ao compositor. Aqui aceitamos exclusivamente sua imagem válida;
   * sem esse ativo não há texto institucional substituto nem fallback visual.
   */
  if (!institutionalWatermark) {
    throw new Error(
      "A marca-d'água institucional canônica retrato do polo é obrigatória para gerar o comprovante.",
    );
  }
  const canonicalAsset = isCanonicalInstitutionalWatermarkDataUri(
      institutionalWatermark.image.dataUrl,
    )
    ? getCanonicalPdfInlineImage(institutionalWatermark.image.dataUrl)
    : null;
  if (!canonicalAsset) {
    throw new Error(
      "A marca-d'água institucional canônica retrato do polo é obrigatória para gerar o comprovante.",
    );
  }
  const settings = institutionalWatermark.settings;
  if (!settings) {
    /**
     * Emissões antigas não carregam a apresentação do modelo no snapshot.
     * Mantemos seus bytes/reprodução intactos em vez de reinterpretá-las.
     */
    drawCanonicalPdfWatermark(pdf, GState, {
      enabled: true,
      imageUrl: canonicalAsset.dataUrl,
      label: null,
      opacity: 0.1,
    }, {
      x: 25,
      y: 62,
      width: 160,
      height: 172,
      textSize: 28,
      rotate: -45,
    });
    return;
  }
  if (
    !Number.isFinite(settings.opacity) || settings.opacity < 0 ||
    settings.opacity > 1 || !Number.isFinite(settings.scale) ||
    !Number.isInteger(settings.scale) || settings.scale < 10 ||
    settings.scale > 100 || settings.scale % 5 !== 0 ||
    typeof settings.rotate !== "boolean"
  ) {
    throw new Error(
      "A apresentação congelada da marca-d'água institucional é inválida.",
    );
  }

  /**
   * Espelha o modelo pronto da tela de Documentos: largura percentual da
   * página, contido verticalmente, centralizado e sem uma opacidade/rotação
   * adicional além daquela salva no próprio template institucional.
   */
  const properties = pdf.getImageProperties(canonicalAsset.dataUrl);
  const factor = Math.min(
    (PAGE_WIDTH * settings.scale / 100) / properties.width,
    PAGE_HEIGHT / properties.height,
  );
  const width = properties.width * factor;
  const height = properties.height * factor;
  pdf.saveGraphicsState();
  try {
    pdf.setGState(new GState({ opacity: settings.opacity }) as never);
    pdf.addImage(
      canonicalAsset.dataUrl,
      canonicalAsset.format,
      (PAGE_WIDTH - width) / 2,
      (PAGE_HEIGHT - height) / 2,
      width,
      height,
      "assinatura-marca-dagua-institucional",
      "FAST",
      settings.rotate ? -45 : 0,
    );
  } finally {
    pdf.restoreGraphicsState();
  }
};

const drawLegalSections = (
  pdf: jsPDF,
  sections: readonly ElectronicSignatureLegalSection[],
  top: number,
  maximumBottom: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  let y = top;
  sections.forEach((section, index) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.35);
    const titleLines = pdf.splitTextToSize(
      section.title.toUpperCase(),
      width,
    ) as string[];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.55);
    const bodyLines = pdf.splitTextToSize(section.body, width) as string[];
    const titleHeight = titleLines.length * 2.15;
    const bodyHeight = bodyLines.length * 2.35;
    const sectionHeight = titleHeight + bodyHeight + 6.2;
    if (y + sectionHeight > maximumBottom) {
      throw new Error(
        `O bloco juridico ${index + 1} excede a area segura da segunda pagina.`,
      );
    }
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(5.35);
    pdf.text(titleLines, PAGE_LEFT, y, {
      baseline: "top",
      lineHeightFactor: 1.15,
    });
    const separatorY = y + titleHeight + 0.8;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(PAGE_LEFT, separatorY, PAGE_WIDTH - PAGE_RIGHT, separatorY);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(5.55);
    pdf.text(bodyLines, PAGE_LEFT, separatorY + 2.2, {
      baseline: "top",
      lineHeightFactor: 1.18,
    });
    y += sectionHeight;
  });
  return y;
};

const drawPreviewSeal = (pdf: jsPDF, top: number) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(147, 197, 253);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 10, 1.8, 1.8, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(29, 78, 216);
  pdf.setFontSize(6.4);
  pdf.text("PRÉVIA DO MODELO — SEM VALIDADE", PAGE_WIDTH / 2, top + 3, {
    align: "center",
    baseline: "top",
  });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(4.8);
  pdf.text(
    "Dados, evidências e validação serão inseridos somente pelo serviço autorizado.",
    PAGE_WIDTH / 2,
    top + 6.3,
    {
      align: "center",
      baseline: "top",
    },
  );
  return top + 10;
};

const drawPreviewReferenceCard = (pdf: jsPDF, top: number) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const columns = [
    ["DOCUMENTO", "Gerado no fechamento"],
    ["REVISÃO", "Congelada pelo serviço"],
    ["INTEGRIDADE", "Hash calculado no fechamento"],
  ] as const;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(PAGE_LEFT, top, width, 23, 2, 2, "FD");
  columns.forEach(([label, value], index) => {
    const columnWidth = width / columns.length;
    const x = PAGE_LEFT + index * columnWidth + 4;
    if (index > 0) {
      pdf.setDrawColor(241, 245, 249);
      pdf.line(
        PAGE_LEFT + index * columnWidth,
        top + 4,
        PAGE_LEFT + index * columnWidth,
        top + 19,
      );
    }
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(5);
    pdf.text(label, x, top + 5, { baseline: "top" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(5.5);
    drawCanonicalPdfText(pdf, value, x, top + 10, {
      maxWidth: columnWidth - 8,
      maxLines: 2,
    });
  });
};

const drawPreviewReservedArea = (
  pdf: jsPDF,
  label: string,
  description: string,
  top: number,
  height: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineDashPattern([1.2, 1.2], 0);
  pdf.roundedRect(PAGE_LEFT, top, width, height, 2, 2, "FD");
  pdf.setLineDashPattern([], 0);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.4);
  pdf.text(label.toUpperCase(), PAGE_LEFT + 4, top + 4, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  drawCanonicalPdfText(pdf, description, PAGE_LEFT + 4, top + 9, {
    maxWidth: width - 8,
    maxLines: 3,
  });
};

const drawPreviewValidationCard = (pdf: jsPDF, top: number) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(PAGE_LEFT, top, width, 27, 2, 2, "FD");
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.45);
  pdf.roundedRect(PAGE_LEFT + 5, top + 4, 19, 19, 1.5, 1.5, "S");
  pdf.line(PAGE_LEFT + 9, top + 8, PAGE_LEFT + 20, top + 19);
  pdf.line(PAGE_LEFT + 20, top + 8, PAGE_LEFT + 9, top + 19);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(6.2);
  pdf.text("VALIDAÇÃO PÚBLICA", PAGE_LEFT + 30, top + 5, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.3);
  pdf.text(
    "QR Code, código e URL ficam disponíveis somente após a conclusão autorizada.",
    PAGE_LEFT + 30,
    top + 10,
    {
      baseline: "top",
      maxWidth: width - 36,
    },
  );
  pdf.setFont("courier", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text("ÁREA RESERVADA PELO SERVIÇO", PAGE_LEFT + 30, top + 17, {
    baseline: "top",
  });
};

const drawPreviewFooter = (pdf: jsPDF, page: 1 | 2) => {
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_LEFT, 278, PAGE_WIDTH - PAGE_RIGHT, 278);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(148, 163, 184);
  pdf.setFontSize(4.8);
  pdf.text("PRÉVIA DO MODELO — SEM VALIDADE", PAGE_LEFT, 281, {
    baseline: "top",
  });
  pdf.text(`Página ${page} de 2`, PAGE_WIDTH - PAGE_RIGHT, 281, {
    align: "right",
    baseline: "top",
  });
};

const drawReceipt = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  GState: PdfGStateConstructor,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    prepared.payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    prepared.payload.institution,
    prepared.payload.logo,
    {
      orientation: "portrait",
      alias: "comprovante-assinatura-logo-institucional",
      meta: {
        eyebrow: "RELATÓRIO DE EVIDÊNCIAS",
        title: prepared.payload.presentation.receiptTitle,
        label: "STATUS",
        value: statusLabels[prepared.payload.status],
      },
    },
  );
  const statusTop = header.contentTop + 1.5;
  drawStatusCard(
    pdf,
    prepared.payload.status,
    prepared.payload.presentation.receiptMessage,
    statusTop,
  );
  const referenceTop = statusTop + 18;
  drawReferenceCard(pdf, prepared.payload.document, referenceTop);
  const participantsHeading = referenceTop + 45.5;
  drawSectionHeading(pdf, "Participantes e papéis", participantsHeading);
  const participantBottom = drawParticipantGrid(
    pdf,
    prepared.payload.participants,
    participantsHeading + 6.5,
  );
  const eventsHeading = participantBottom + 3.7;
  drawSectionHeading(pdf, "Linha do tempo de evidências", eventsHeading);
  const eventsBottom = drawEventTimeline(pdf, prepared, eventsHeading + 6.5);
  const validationTop = Math.max(eventsBottom + 6, 210);
  if (validationTop + 31 > 276) {
    throw new Error(
      "Os eventos autorizados excedem a area segura do comprovante vetorial.",
    );
  }
  drawValidationCard(pdf, prepared, validationTop);
  drawFooter(pdf, 1);
};

const drawPresentationPage = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  GState: PdfGStateConstructor,
) => {
  pdf.addPage("a4", "portrait");
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    prepared.payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    prepared.payload.institution,
    prepared.payload.logo,
    {
      orientation: "portrait",
      alias: "comprovante-assinatura-logo-institucional-pagina-2",
      meta: {
        eyebrow: "POLÍTICA DO COMPROVANTE",
        title: prepared.payload.presentation.policyName,
        label: "VERSÃO",
        value: prepared.payload.presentation.policyVersionLabel,
      },
    },
  );
  const confirmationBottom = drawConfirmationCard(
    pdf,
    prepared.payload.presentation.confirmationMessage,
    header.contentTop + 1.5,
  );
  const sectionsBottom = drawLegalSections(
    pdf,
    prepared.payload.presentation.editor.pages[1].sections,
    confirmationBottom + 5,
    232,
  );
  const validationTop = Math.max(sectionsBottom + 5, 232);
  if (validationTop + 31 > 276) {
    throw new Error(
      "A política configurada excede a área segura da segunda página do comprovante.",
    );
  }
  drawValidationCard(pdf, prepared, validationTop);
  drawFooter(pdf, 2);
};

const drawTemplatePreviewPageOne = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: ElectronicSignatureTemplatePreviewPayload,
  presentation: ElectronicSignatureReceiptPresentation,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    payload.institution,
    payload.logo,
    {
      orientation: "portrait",
      alias: "preview-assinatura-logo-institucional-pagina-1",
      meta: {
        eyebrow: "MODELO DO COMPROVANTE",
        title: presentation.receiptTitle,
        label: "PÁGINA",
        value: "1 DE 2",
      },
    },
  );
  const sealBottom = drawPreviewSeal(pdf, header.contentTop + 1.5);
  const statusTop = sealBottom + 4;
  drawPreviewStatusCard(pdf, presentation.receiptMessage, statusTop);
  const referenceTop = statusTop + 18;
  drawPreviewReferenceCard(pdf, referenceTop);
  const participantHeading = referenceTop + 28;
  drawSectionHeading(pdf, "Participantes e papéis", participantHeading);
  drawPreviewReservedArea(
    pdf,
    "Participantes autorizados",
    "Nomes, papéis e ordem são inseridos a partir do envelope congelado pelo serviço.",
    participantHeading + 6.5,
    23,
  );
  const eventHeading = participantHeading + 34.5;
  drawSectionHeading(pdf, "Linha do tempo de evidências", eventHeading);
  drawPreviewReservedArea(
    pdf,
    "Eventos do processo",
    "Datas, métodos e evidências são apresentados somente quando houver registro canônico concluído ou encerrado.",
    eventHeading + 6.5,
    34,
  );
  drawPreviewValidationCard(pdf, 239);
  drawPreviewFooter(pdf, 1);
};

const drawTemplatePreviewPageTwo = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: ElectronicSignatureTemplatePreviewPayload,
  presentation: ElectronicSignatureReceiptPresentation,
) => {
  pdf.addPage("a4", "portrait");
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    payload.institution,
    payload.logo,
    {
      orientation: "portrait",
      alias: "preview-assinatura-logo-institucional-pagina-2",
      meta: {
        eyebrow: "POLÍTICA DO COMPROVANTE",
        title: presentation.policyName,
        label: "VERSÃO",
        value: presentation.policyVersionLabel,
      },
    },
  );
  const sealBottom = drawPreviewSeal(pdf, header.contentTop + 1.5);
  const confirmationBottom = drawConfirmationCard(
    pdf,
    presentation.confirmationMessage,
    sealBottom + 4,
  );
  const sectionsBottom = drawLegalSections(
    pdf,
    presentation.editor.pages[1].sections,
    confirmationBottom + 5,
    232,
  );
  const validationTop = Math.max(sectionsBottom + 5, 244);
  if (validationTop + 27 > 276) {
    throw new Error(
      "Os textos configurados excedem a area segura da previa da segunda pagina.",
    );
  }
  drawPreviewValidationCard(pdf, validationTop);
  drawPreviewFooter(pdf, 2);
};
interface StampPreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const stampPreviewRectFromPlacement = (
  placement: ElectronicSignatureStampPlacement,
): StampPreviewRect => ({
  x: PAGE_WIDTH * placement.xBp / 100_000,
  y: PAGE_HEIGHT * placement.yBp / 100_000,
  width: PAGE_WIDTH * placement.widthBp / 100_000,
  height: PAGE_HEIGHT * placement.heightBp / 100_000,
});

const stampPreviewRectForElement = (
  stampRect: StampPreviewRect,
  element: ElectronicSignatureStampTemplateElement,
): StampPreviewRect => {
  const visualBounds = getSignatureStampTemplateElementVisualBoundsForSurface(
    element,
    stampRect.width,
    stampRect.height,
  );
  return {
    x: stampRect.x + stampRect.width * visualBounds.xBp / 100_000,
    y: stampRect.y + stampRect.height * visualBounds.yBp / 100_000,
    width: stampRect.width * visualBounds.widthBp / 100_000,
    height: stampRect.height * visualBounds.heightBp / 100_000,
  };
};

const stampTemplateColor = (value: string) =>
  [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ] as const;

const STAMP_PREVIEW_BINDING_VALUES = {
  SIGNER_ROLE: "Signatário",
  DISPLAY_TITLE: ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  SIGNER_NAME: "Maria S. Lima",
  SIGNED_AT: "20/08/2026, 15:42",
  SIGNER_CPF_MASKED: "12*.***.**9-01",
  SIGNATURE_HASH: "a91f…5e7c",
  VERIFICATION_CODE: "SIG-00000000-0000-4000-8000-000000000001",
  VERIFICATION_URL:
    "https://universocc.com.br/validador?code=SIG-00000000-0000-4000-8000-000000000001",
} as const;

/** Conteúdo demonstrativo; nunca corresponde a um evento de assinatura real. */
const STAMP_PREVIEW_QR_VALUE =
  "https://universocc.com.br/validador?code=SIG-00000000-0000-4000-8000-000000000001";

const drawStampTemplateQr = (
  pdf: jsPDF,
  rect: StampPreviewRect,
  color: readonly [number, number, number],
  dataUrl: string,
  sampleIndex: number,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.13);
  pdf.rect(rect.x, rect.y, rect.width, rect.height, "FD");
  pdf.addImage(
    dataUrl,
    "PNG",
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    `preview-carimbo-global-qr-${sampleIndex}`,
    "FAST",
  );
};

const stampTemplateJsPdfFont = (
  font: ElectronicSignatureStampTemplateFont,
): readonly [family: "helvetica" | "courier", style: string] => {
  switch (font) {
    case "HELVETICA":
      return ["helvetica", "normal"];
    case "HELVETICA_BOLD":
      return ["helvetica", "bold"];
    case "HELVETICA_OBLIQUE":
      return ["helvetica", "italic"];
    case "HELVETICA_BOLD_OBLIQUE":
      return ["helvetica", "bolditalic"];
    case "COURIER":
      return ["courier", "normal"];
    case "COURIER_BOLD":
      return ["courier", "bold"];
    case "COURIER_OBLIQUE":
      return ["courier", "italic"];
    case "COURIER_BOLD_OBLIQUE":
      return ["courier", "bolditalic"];
  }
};

const stampTemplatePreviewTextLines = (
  element: Extract<ElectronicSignatureStampTemplateElement, { kind: "TEXT" }>,
  value: string,
) => {
  if (element.binding === "VERIFICATION_CODE") {
    return [
      "CÓD. VALIDAÇÃO",
      value.slice(0, 20),
      value.slice(20),
    ];
  }
  if (element.binding === "VERIFICATION_URL") {
    const displayUrl = formatDocumentValidationUrlForDisplay(value);
    return element.widthBp >= 40_000 && element.heightBp <= 16_000
      ? [`${element.style.label}${displayUrl}`]
      : [element.style.label.trim(), displayUrl];
  }
  if (element.binding === "SIGNER_NAME") return [value];
  return [`${element.style.label}${value}`];
};

const resolveStampTemplateJsPdfTextSize = (
  pdf: jsPDF,
  lines: readonly string[],
  rect: StampPreviewRect,
  configuredSize: number,
) => {
  const minimumSize = 3.2;
  let size = Math.max(minimumSize, configuredSize);
  const fits = (candidate: number) => {
    pdf.setFontSize(candidate);
    const lineHeightMm = candidate * 25.4 / 72 * 1.14;
    return lines.length * lineHeightMm <= rect.height + 0.001 &&
      lines.every((line) => pdf.getTextWidth(line) <= rect.width + 0.001);
  };
  while (size > minimumSize && !fits(size)) {
    size = Math.max(minimumSize, size - 0.1);
  }
  if (!fits(size)) {
    throw new Error(
      "O texto do template não cabe integralmente na área configurada.",
    );
  }
  return size;
};

const drawGlobalSignatureStamp = (
  pdf: jsPDF,
  stamp: ElectronicSignatureStampEditor,
  placement: ElectronicSignatureStampPlacement,
  asset: CanonicalPdfImage | null,
  sampleIndex: number,
  qrDataUrl: string,
) => {
  const stampRect = stampPreviewRectFromPlacement(placement);
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(
    stampRect.x,
    stampRect.y,
    stampRect.width,
    stampRect.height,
    0.9,
    0.9,
    "S",
  );

  stamp.template.elements.forEach((element) => {
    if (
      stamp.template.hiddenElementIds?.includes(
        element.id as ElectronicSignatureStampTemplateHiddenElementId,
      )
    ) {
      return;
    }
    const rect = stampPreviewRectForElement(stampRect, element);
    if (element.kind === "LINE") {
      const color = stampTemplateColor(element.style.color);
      pdf.setDrawColor(...color);
      pdf.setLineWidth(
        Math.max(0.1, stampRect.height * element.style.widthBp / 100_000),
      );
      pdf.line(
        rect.x,
        rect.y + rect.height / 2,
        rect.x + rect.width,
        rect.y + rect.height / 2,
      );
      return;
    }
    if (element.kind === "QR") {
      drawStampTemplateQr(pdf, rect, [7, 26, 51], qrDataUrl, sampleIndex);
      return;
    }
    if (element.kind === "IMAGE") {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.13);
      pdf.roundedRect(rect.x, rect.y, rect.width, rect.height, 0.6, 0.6, "FD");
      if (asset) {
        const properties = pdf.getImageProperties(asset.dataUrl);
        const scale = Math.min(
          rect.width / properties.width,
          rect.height / properties.height,
        );
        const width = properties.width * scale;
        const height = properties.height * scale;
        pdf.addImage(
          asset.dataUrl,
          asset.format,
          rect.x + (rect.width - width) / 2,
          rect.y + (rect.height - height) / 2,
          width,
          height,
          `preview-carimbo-global-${
            stamp.assetId || "sem-ativo"
          }-${sampleIndex}`,
          "FAST",
        );
      } else {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(Math.max(2.4, Math.min(4.2, rect.width * 0.4)));
        pdf.text("IMAGEM", rect.x + rect.width / 2, rect.y + rect.height / 2, {
          align: "center",
          baseline: "middle",
        });
      }
      return;
    }

    const color = stampTemplateColor(element.style.color);
    const [fontFamily, fontStyle] = stampTemplateJsPdfFont(element.style.font);
    pdf.setFont(fontFamily, fontStyle);
    pdf.setTextColor(...color);
    const value = STAMP_PREVIEW_BINDING_VALUES[element.binding];
    const lines = stampTemplatePreviewTextLines(element, value);
    const configuredSize = stampRect.height * 72 / 25.4 *
      element.style.fontSizeBp / 100_000;
    const fontSize = resolveStampTemplateJsPdfTextSize(
      pdf,
      lines,
      rect,
      configuredSize,
    );
    pdf.setFontSize(fontSize);
    pdf.text(
      lines,
      element.style.align === "CENTER"
        ? rect.x + rect.width / 2
        : element.style.align === "RIGHT"
        ? rect.x + rect.width
        : rect.x,
      rect.y,
      {
        align: element.style.align.toLowerCase() as "left" | "center" | "right",
        baseline: "top",
        lineHeightFactor: 1.14,
      },
    );
  });

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(Math.max(2.1, Math.min(3.2, stampRect.height * 0.2)));
  pdf.text(
    `MODELO GLOBAL · SEM VALIDADE · ${sampleIndex + 1}`,
    stampRect.x + stampRect.width - 0.9,
    stampRect.y + stampRect.height - 1.2,
    { align: "right", baseline: "top" },
  );
};

const drawSignatureStampPlacementPreview = async (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: ElectronicSignatureTemplatePreviewPayload,
  presentation: ElectronicSignatureReceiptPresentation,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(pdf, GState, payload.institutionalWatermark);
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    payload.institution,
    payload.logo,
    {
      orientation: "portrait",
      alias: "preview-posicionamento-carimbo-logo-institucional",
      meta: {
        eyebrow: "DOCUMENTO ORIGINAL",
        title: "Prévia de posicionamento do carimbo",
        label: "ALVO",
        value: "ÚLTIMA PÁGINA",
      },
    },
  );
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.text(
    "CONTEÚDO DEMONSTRATIVO DO DOCUMENTO",
    PAGE_WIDTH / 2,
    header.contentTop + 9,
    {
      align: "center",
      baseline: "top",
    },
  );
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(6.2);
  drawCanonicalPdfText(
    pdf,
    "Esta folha A4 representa somente a última página do PDF original. O mesmo template global será aplicado automaticamente, na ordem autorizada, a cada signatário do envelope congelado.",
    PAGE_LEFT,
    header.contentTop + 18,
    {
      maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
      maxLines: 3,
      lineHeight: 1.25,
    },
  );
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  [118, 132, 146, 160, 174].forEach((y) =>
    pdf.line(PAGE_LEFT, y, PAGE_WIDTH - PAGE_RIGHT, y)
  );

  const stamp = presentation.editor.signatureStamp;
  const asset = stamp.assetId
    ? payload.signatureStampAssets[stamp.assetId] ?? null
    : null;
  if (stamp.assetId && !asset) {
    throw new Error(
      "A imagem própria do carimbo não foi resolvida para a prévia.",
    );
  }
  const qrDataUrl = await createLocalQrCodeDataUrl(STAMP_PREVIEW_QR_VALUE, {
    size: 512,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  const sampleSignerCount = Math.min(3, stamp.autoLayout.maxSigners);
  const placements = deriveAutomaticSignatureStampPlacements(
    stamp.autoLayout,
    sampleSignerCount,
  );
  placements.forEach((placement, index) => {
    drawGlobalSignatureStamp(pdf, stamp, placement, asset, index, qrDataUrl);
  });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(148, 163, 184);
  pdf.setFontSize(4.8);
  pdf.text("PRÉVIA GLOBAL - SEM VALIDADE", PAGE_LEFT, 184, {
    baseline: "top",
  });
  pdf.text(
    "3 exemplos neutros de N signatários",
    PAGE_WIDTH - PAGE_RIGHT,
    184,
    {
      align: "right",
      baseline: "top",
    },
  );
};

const toSafeFileSegment = (value: string) =>
  value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60) || "documento";

/**
 * Gera a prévia real do mesmo compositor vetorial sem fabricar evidências. O
 * contrato não possui campos para status, pessoas, eventos, hash ou QR Code.
 */
export const createElectronicSignatureTemplatePreviewPdf = async (
  payload: ElectronicSignatureTemplatePreviewPayload,
): Promise<CanonicalDocumentPdfResult> => {
  const presentation = preparePresentation(payload.presentation);
  const { jsPDF, GState } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: "Prévia do Modelo de Comprovante de Assinatura Eletrônica",
    subject: "Prévia sem validade do modelo de duas páginas",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });
  const gState = GState as unknown as PdfGStateConstructor;
  drawTemplatePreviewPageOne(pdf, gState, payload, presentation);
  drawTemplatePreviewPageTwo(pdf, gState, payload, presentation);
  return {
    blob: pdf.output("blob"),
    fileName: "previa-modelo-comprovante-assinatura.pdf",
  };
};

/** Gera uma única folha demonstrativa para posicionar o carimbo no PDF original. */
export const createElectronicSignatureStampTemplatePreviewPdf = async (
  payload: ElectronicSignatureTemplatePreviewPayload,
): Promise<CanonicalDocumentPdfResult> => {
  const presentation = preparePresentation(payload.presentation);
  const { jsPDF, GState } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: "Prévia de Posicionamento do Carimbo de Assinatura",
    subject: "Última página demonstrativa do documento original - sem validade",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });
  await drawSignatureStampPlacementPreview(
    pdf,
    GState as unknown as PdfGStateConstructor,
    payload,
    presentation,
  );
  return {
    blob: pdf.output("blob"),
    fileName: "previa-posicionamento-carimbo-assinatura.pdf",
  };
};

/**
 * Gera somente a representacao vetorial de um payload previamente autorizado.
 * Este compositor nao consulta banco, nao resolve dados de pessoas e nao aceita
 * campos tecnicos sensiveis no PDF.
 */
export const createElectronicSignatureReceiptPdf = async (
  payload: ElectronicSignatureReceiptPayload,
  options: { canonicalValidationUrl?: string } = {},
): Promise<CanonicalDocumentPdfResult> => {
  const prepared = await prepareReceipt(
    payload,
    options.canonicalValidationUrl,
  );
  const { jsPDF, GState } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: "Comprovante de Assinatura Eletrônica",
    subject: "Relatório de evidências de assinatura eletrônica",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });
  pdf.setFileId(
    prepared.payload.document.hash.value.slice(0, 32).toUpperCase(),
  );
  pdf.setCreationDate(
    new Date(prepared.payload.events.at(-1)?.occurredAt || 0),
  );
  const gState = GState as unknown as PdfGStateConstructor;
  drawReceipt(pdf, prepared, gState);
  drawPresentationPage(pdf, prepared, gState);
  return {
    blob: pdf.output("blob"),
    fileName: `comprovante-assinatura-${
      toSafeFileSegment(prepared.payload.document.reference)
    }.pdf`,
  };
};
