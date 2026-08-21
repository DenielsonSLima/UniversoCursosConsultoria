export type ElectronicSignatureAudience =
  | "gestor"
  | "professor"
  | "coordenador"
  | "aluno"
  | "responsavel";

export type ElectronicSignatureProfile =
  | "GESTOR"
  | "PROFESSOR"
  | "COORDENADOR"
  | "ALUNO"
  | "RESPONSAVEL_LEGAL";

export type ElectronicSignatureInboxTab = "pending" | "signed";

/**
 * A ação é decidida pelo serviço autorizado e somente apresentada pela UI.
 * A fundação atual não libera assinatura conclusiva no cliente.
 */
export type ElectronicSignaturePrimaryAction =
  | "NONE"
  | "VIEW"
  | "SIGN"
  | "WAITING_PREVIOUS_SIGNER"
  | "FINALIZATION_IN_PROGRESS"
  | "AWAITING_LEGAL_REVIEW"
  | "AWAITING_AUTHENTICATION_CHAIN";

/**
 * Dados de apresentação entregues pelo serviço autoritativo de assinaturas.
 * A interface apenas os exibe; não deriva elegibilidade, autorização ou status.
 */
export interface ElectronicSignatureInboxItem {
  envelopeId: string;
  participantId: string | null;
  title: string;
  documentType: string;
  originType: string;
  originVersion: number;
  revisionLabel?: string | null;
  participantRole: string | null;
  participantRoleLabel: string | null;
  participantOrder: number | null;
  participantStatus: string | null;
  participantStatusLabel: string | null;
  status: string;
  statusLabel: string;
  deadlineAt: string | null;
  updatedAt: string;
  primaryAction: ElectronicSignaturePrimaryAction;
  primaryActionLabel?: string | null;
  canAct: boolean;
  message?: string | null;
}

export interface ElectronicSignatureInboxCursor {
  updatedAt: string;
  envelopeId: string;
}

export interface ElectronicSignatureInboxPage {
  items: readonly ElectronicSignatureInboxItem[];
  nextCursor: ElectronicSignatureInboxCursor | null;
}

export type ElectronicSignatureArtifactClass =
  | "DOCUMENTO_ORIGINAL"
  | "DOCUMENTO_FINAL"
  | "COMPROVANTE_EVIDENCIA";

export type ElectronicSignatureArtifactProfile = Extract<
  ElectronicSignatureProfile,
  "GESTOR" | "PROFESSOR" | "COORDENADOR"
>;

export type ElectronicSignatureArchiveStatus = "ASSINADO" | "SUBSTITUIDO";
export type ElectronicSignatureArchiveStatusFilter =
  | "TODOS"
  | ElectronicSignatureArchiveStatus;
export type ElectronicSignatureArchiveDocumentType = "diario_classe";

export interface ElectronicSignatureConsentTerm {
  termId: string;
  version: number;
  versionLabel: string;
  title: string;
  confirmationMessage: string;
  sections: readonly ElectronicSignatureLegalSection[];
  sha256: string;
}

export interface ElectronicSignatureConsentEvidence {
  accepted: true;
  termId: string;
  sha256: string;
}

export interface ElectronicSignatureArchiveFilters {
  search: string;
  status: ElectronicSignatureArchiveStatusFilter;
  documentType: ElectronicSignatureArchiveDocumentType | null;
  turmaId: string | null;
  /** Data civil no formato YYYY-MM-DD, interpretada no fuso America/Maceio. */
  finalizedFrom: string | null;
  /** Data civil inclusiva na UI; o adapter envia o início exclusivo do dia seguinte. */
  finalizedTo: string | null;
}

export interface ElectronicSignatureArchiveCursor {
  finalizedAt: string;
  envelopeId: string;
}

export interface ElectronicSignatureArchiveSigner {
  role: string;
  name: string;
  signedAt: string;
}

export interface ElectronicSignatureArchiveItem {
  envelopeId: string;
  documentType: ElectronicSignatureArchiveDocumentType;
  title: string;
  originType: string;
  originVersion: number;
  revisionLabel: string;
  status: ElectronicSignatureArchiveStatus;
  poloId: string;
  turmaId: string;
  turmaNome: string;
  disciplinaId: string;
  disciplinaNome: string;
  signers: readonly ElectronicSignatureArchiveSigner[];
  finalizedAt: string;
  sha256: string;
  validationCode: string | null;
  artifacts: {
    final: boolean;
    receipt: boolean;
  };
}

export interface ElectronicSignatureArchivePage {
  items: readonly ElectronicSignatureArchiveItem[];
  nextCursor: ElectronicSignatureArchiveCursor | null;
}

export interface ElectronicSignatureArtifactDownload {
  envelopeId: string;
  artifactId: string;
  artifactClass: ElectronicSignatureArtifactClass;
  sha256: string;
  byteSize: number;
  mimeType: "application/pdf";
  fileName: string;
  url: string;
  expiresAt: string;
  expiresIn: number;
}

export interface ElectronicSignatureEnvelopeParticipant {
  participantId: string;
  role: string;
  roleLabel: string;
  order: number;
  status: string;
  statusLabel: string;
  contextId: string;
  canAct: boolean;
  signedAt: string | null;
}

export interface ElectronicSignatureEnvelopeDetail {
  envelope: {
    envelopeId: string;
    documentType: string;
    title: string;
    revisionLabel: string;
    originType: string;
    status: string;
    statusLabel: string;
    deadlineAt: string | null;
    createdAt: string;
    updatedAt: string;
    policyVersion: number;
    original: {
      ready: boolean;
      sha256: string | null;
      immutableAt: string | null;
    };
    final: {
      ready: boolean;
      sha256: string | null;
      finalizedAt: string | null;
    };
  };
  participant: ElectronicSignatureEnvelopeParticipant | null;
  participants: readonly ElectronicSignatureEnvelopeParticipant[];
  canManage: boolean;
}

export interface ElectronicSignatureConfirmationResult {
  envelopeId: string;
  envelopeStatus: string;
  participantId: string;
  participantRole: string;
  participantOrder: number;
  participantStatus: string;
  signedAt: string;
  nextParticipantId: string | null;
  nextParticipantRole: string | null;
  requiresFinalization: boolean;
}

export interface ElectronicSignatureDiaryEnvelopeRequestResult {
  envelopeId: string;
  documentType: string;
  originType: string;
  originVersion: number;
  composerSchemaVersion: number;
  academicSnapshotSha256: string;
  status: string;
  statusLabel: string;
  participants: readonly ElectronicSignatureEnvelopeParticipant[];
}

export type ElectronicSignatureDiaryArtifactAction =
  | "PREPARE_ORIGINAL"
  | "FINALIZE";

export interface ElectronicSignatureDiaryArtifactResult {
  envelopeId: string;
  status: string;
}

export interface ElectronicSignatureReauthenticationResult {
  ticket: string;
  challengeId: string;
  envelopeId: string;
  participantId: string;
  participantRole: string;
  participantOrder: number;
  profile: ElectronicSignatureProfile;
  contextId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ElectronicSignatureInbox {
  pending: readonly ElectronicSignatureInboxItem[];
  signed: readonly ElectronicSignatureInboxItem[];
  pendingEmptyMessage: string;
  signedEmptyMessage: string;
}

export interface ElectronicSignatureReceiptField {
  id: "envelope" | "document_revision" | "participants" | "events";
  label: string;
  description: string;
}

export const ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS = [
  "ownership",
  "consent",
  "terms_update",
  "contact",
  "copies",
] as const;

export type ElectronicSignatureLegalSectionId =
  typeof ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS[number];

/**
 * A marca-d'água do editor é um recurso próprio do modelo. Ela nunca reutiliza
 * a marca institucional do cabeçalho canônico.
 */
export type ElectronicSignatureWatermarkSource = "TEXT" | "CUSTOM_ASSET";

export interface ElectronicSignaturePageWatermark {
  enabled: boolean;
  source: ElectronicSignatureWatermarkSource;
  label: string | null;
  /** UUID do ativo autorizado pela Edge Function; URLs e base64 não persistem no editor. */
  assetId: string | null;
  opacity: number;
  scalePercent: number;
  rotationDegrees: number;
}

export interface ElectronicSignatureLegalSection {
  id: ElectronicSignatureLegalSectionId;
  title: string;
  body: string;
}

export interface ElectronicSignatureEvidenceEditorPage {
  page: 1;
  template: "EVIDENCE";
}

export interface ElectronicSignatureLegalEditorPage {
  page: 2;
  template: "LEGAL_TEXTS";
  sections: readonly ElectronicSignatureLegalSection[];
}

export const ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL =
  "Documento assinado eletronicamente" as const;
export const ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE =
  "Documento assinado digitalmente" as const;
/**
 * Papéis de prova atualmente autorizados pelo piloto. Eles pertencem ao
 * participante/evento imutável, nunca à configuração visual do carimbo.
 */
export const ELECTRONIC_SIGNATURE_STAMP_ROLES = [
  "PROFESSOR",
  "COORDENADOR",
] as const;
export type ElectronicSignatureStampRole =
  typeof ELECTRONIC_SIGNATURE_STAMP_ROLES[number];
export type ElectronicSignatureStampLayout = "HORIZONTAL" | "COMPACT";
export type ElectronicSignatureStampPageTarget = "LAST_PAGE";
export type ElectronicSignatureStampCoordinateSpace = "PAGE_TOP_LEFT_BP_V1";
export const ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS = {
  signerName: "{{NOME_DO_SIGNATARIO}}",
  signerCpfMasked: "{{CPF_MASCARADO_DO_SIGNATARIO}}",
  signedAt: "{{DATA_HORA_SEGUNDOS_FUSO}}",
  signatureHash: "{{HASH_INDIVIDUAL_DA_ASSINATURA}}",
  verificationUrl: "{{URL_VERIFICADORA_DA_ASSINATURA}}",
} as const;

/**
 * Coordenadas inteiras normalizadas na área visível da página. A origem é o
 * canto superior esquerdo e 100000 representa 100% de cada eixo.
 */
export interface ElectronicSignatureStampPlacement {
  /** O carimbo é aplicado ao PDF original, nunca às páginas do comprovante. */
  pageTarget: ElectronicSignatureStampPageTarget;
  coordinateSpace: ElectronicSignatureStampCoordinateSpace;
  xBp: number;
  yBp: number;
  widthBp: number;
  heightBp: number;
}

export interface ElectronicSignatureStampSlot
  extends ElectronicSignatureStampPlacement {
  role: ElectronicSignatureStampRole;
}

export interface ElectronicSignatureStampContentLayout {
  sealScalePercent: number;
  lineSpacingPercent: number;
  qrScalePercent: number;
}

export const ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS = {
  sealScalePercent: 100,
  lineSpacingPercent: 100,
  qrScalePercent: 100,
} as const satisfies ElectronicSignatureStampContentLayout;

export const ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS = {
  sealScalePercent: { min: 70, max: 130, step: 5 },
  lineSpacingPercent: { min: 85, max: 105, step: 5 },
  qrScalePercent: { min: 85, max: 115, step: 5 },
} as const;

export type ElectronicSignatureStampTemplateFont =
  | "HELVETICA"
  | "HELVETICA_BOLD"
  | "COURIER";

export type ElectronicSignatureStampTemplateTextAlign =
  | "LEFT"
  | "CENTER"
  | "RIGHT";

/**
 * Bindings fechados: o editor pode posicionar e dimensionar elementos, mas
 * não pode trocar os valores de evidência que o backend preencherá.
 */
export type ElectronicSignatureStampTemplateBinding =
  | "STAMP_ASSET"
  | "SIGNER_ROLE"
  | "DISPLAY_TITLE"
  | "SIGNER_NAME"
  | "SIGNED_AT"
  | "SIGNER_CPF_MASKED"
  | "SIGNATURE_HASH"
  | "VERIFICATION_CODE"
  | "VERIFICATION_URL"
  | "DECORATIVE";

export type ElectronicSignatureStampTemplateElementId =
  | "seal"
  | "signerRole"
  | "title"
  | "signerName"
  | "signedAt"
  | "signerCpfMasked"
  | "signatureHash"
  | "verificationCode"
  | "verificationUrl"
  | "verificationQr"
  | "divider";

/**
 * Exceções visuais fechadas. Estes itens podem ser ocultados somente no
 * desenho do carimbo; a prova individual, seus bindings e os campos de
 * verificação continuam íntegros no snapshot autoritativo.
 */
export type ElectronicSignatureStampTemplateHiddenElementId =
  | "signerRole"
  | "title"
  | "divider";

interface ElectronicSignatureStampTemplateElementBase {
  id: ElectronicSignatureStampTemplateElementId;
  kind: "IMAGE" | "TEXT" | "QR" | "LINE";
  binding: ElectronicSignatureStampTemplateBinding;
  /** Coordenadas inteiras no canvas normalizado STAMP_TOP_LEFT_BP_V1. */
  xBp: number;
  yBp: number;
  widthBp: number;
  heightBp: number;
}

export interface ElectronicSignatureStampTemplateTextElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: Exclude<
    ElectronicSignatureStampTemplateElementId,
    "seal" | "verificationQr" | "divider"
  >;
  kind: "TEXT";
  binding: Exclude<
    ElectronicSignatureStampTemplateBinding,
    "STAMP_ASSET" | "DECORATIVE"
  >;
  style: {
    font: ElectronicSignatureStampTemplateFont;
    fontSizeBp: number;
    color: string;
    align: ElectronicSignatureStampTemplateTextAlign;
    /** Prefixo canônico fechado por id; nunca é texto livre. */
    label: string;
  };
}

export interface ElectronicSignatureStampTemplateImageElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: "seal";
  kind: "IMAGE";
  binding: "STAMP_ASSET";
  style: { fit: "CONTAIN"; opacityBp: number };
}

export interface ElectronicSignatureStampTemplateQrElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: "verificationQr";
  kind: "QR";
  binding: "VERIFICATION_URL";
  style: { quietZoneModules: 4 };
}

export interface ElectronicSignatureStampTemplateLineElement
  extends ElectronicSignatureStampTemplateElementBase {
  id: "divider";
  kind: "LINE";
  binding: "DECORATIVE";
  style: { color: string; widthBp: number };
}

export type ElectronicSignatureStampTemplateElement =
  | ElectronicSignatureStampTemplateTextElement
  | ElectronicSignatureStampTemplateImageElement
  | ElectronicSignatureStampTemplateQrElement
  | ElectronicSignatureStampTemplateLineElement;

/** Um desenho global aplicado repetidamente a cada prova individual. */
export interface ElectronicSignatureStampTemplateV1 {
  schemaVersion: 1;
  coordinateSpace: "STAMP_TOP_LEFT_BP_V1";
  elements: readonly ElectronicSignatureStampTemplateElement[];
  /**
   * Ausente em modelos históricos. Quando presente, só pode ocultar papel,
   * título ou linha decorativa — nunca nome, CPF, hash, código, URL ou QR.
   */
  hiddenElementIds?: readonly ElectronicSignatureStampTemplateHiddenElementId[];
}

/**
 * Distribuição automática, congelada com o envelope. Não contém papel,
 * participante ou dados probatórios: usa somente a ordem autoritativa.
 */
export interface ElectronicSignatureStampAutoLayoutV1 {
  schemaVersion: 1;
  pageTarget: "LAST_PAGE";
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1";
  columns: number;
  widthBp: number;
  heightBp: number;
  gapBp: number;
  marginBp: number;
  maxSigners: number;
}

/** Capacidade do comprovante vetorial canônico de duas páginas. */
export const ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS = 6;

export const ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS = {
  schemaVersion: 1,
  pageTarget: "LAST_PAGE",
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
  columns: 2,
  widthBp: 38_000,
  heightBp: 14_000,
  gapBp: 2_000,
  marginBp: 2_000,
  maxSigners: ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS,
} as const satisfies ElectronicSignatureStampAutoLayoutV1;

/**
 * Configuração exclusivamente visual. O backend mantém `enabled=false` até a
 * aprovação jurídica; nome, instante, fuso e URL jamais são textos editáveis.
 */
export interface ElectronicSignatureStampEditor {
  enabled: false;
  canonicalLabel: typeof ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL;
  /** UUID do ativo autorizado; é independente dos assetIds de marca-d'água. */
  /** Nulo apenas enquanto o rascunho ainda não recebeu a imagem obrigatória. */
  assetId: string | null;
  template: ElectronicSignatureStampTemplateV1;
  autoLayout: ElectronicSignatureStampAutoLayoutV1;
}

/**
 * Estrutura fechada e versionada pelo servidor. Cabeçalho, campos de evidência,
 * QR Code e rodapé não são itens editáveis deste contrato.
 */
export interface ElectronicSignatureDocumentEditor {
  schemaVersion: 5;
  pages: readonly [
    ElectronicSignatureEvidenceEditorPage,
    ElectronicSignatureLegalEditorPage,
  ];
  signatureStamp: ElectronicSignatureStampEditor;
}

export const ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS = {
  name: 120,
  versionLabel: 80,
  confirmationMessage: 600,
  receiptTitle: 120,
  receiptMessage: 240,
  watermarkLabel: 60,
  legalSectionTitle: 80,
  legalSectionBody: 260,
  legalSectionsBodyTotal: 1_000,
} as const;

/** Limites espelhados pela Edge Function e pelo normalizador autoritativo. */
export const ELECTRONIC_SIGNATURE_MODEL_ASSET_LIMITS = {
  mimeType: "image/png",
  maxBytes: 1_048_576,
  maxDimension: 4_096,
  maxPixels: 12_000_000,
} as const;

export interface ElectronicSignaturePolicyPresentation {
  documentType: string;
  name: string;
  versionLabel: string;
  confirmationMessage: string;
  receiptTitle: string;
  receiptMessage: string;
  receiptFields: readonly ElectronicSignatureReceiptField[];
  editor: ElectronicSignatureDocumentEditor;
}

export interface ElectronicSignatureCertificatePresentation {
  statusLabel: string;
  description: string;
}

/**
 * Identidade visual canônica escolhida pelo banco para o MODELO_PADRAO.
 * O navegador pode preparar os ativos raster, mas não escolhe empresa, polo
 * ou marca-d'água para compor o cabeçalho do comprovante.
 */
export interface ElectronicSignaturePreviewInstitution {
  name: string;
  legalName: string;
  cnpj: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  isHeadquarters: boolean;
}

/**
 * A marca landscape institucional é um recurso inline já congelado pelo
 * backend. O identificador do Modelo de Documentos continua sendo a única
 * autoridade de origem; esta forma não admite URL, Storage ou fallback.
 */
export type ElectronicSignatureCanonicalInstitutionalWatermarkDataUri =
  `data:image/${"png" | "jpeg" | "webp"};base64,${string}`;

export interface ElectronicSignaturePreviewIdentity {
  institution: ElectronicSignaturePreviewInstitution;
  logoUrl: string | null;
  /** Sempre vem de watermark_landscape_<polo_id> como data URI canônica. */
  watermarkUrl: ElectronicSignatureCanonicalInstitutionalWatermarkDataUri;
}

/** Ativo de marca-d'água resolvido pela Edge Function autorizada. */
export interface ElectronicSignatureModelAsset {
  assetId: string;
  signedUrl: string;
  mimeType: "image/png";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  expiresIn: number;
}

export interface ElectronicSignatureAdministrationPresentation {
  poloId: string | null;
  version: number;
  enabled: boolean;
  legalStatusLabel: string;
  certificate: ElectronicSignatureCertificatePresentation;
  previewIdentity: ElectronicSignaturePreviewIdentity;
  policy: ElectronicSignaturePolicyPresentation;
}

export type ElectronicSignatureAdministrationDraft = Pick<
  ElectronicSignaturePolicyPresentation,
  "name" | "confirmationMessage" | "receiptTitle" | "receiptMessage" | "editor"
>;

export const electronicSignatureQueryKeys = {
  administration: (poloId: string | null, documentType: string) =>
    [
      "assinatura-eletronica",
      "administration",
      poloId,
      documentType,
    ] as const,
  inbox: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    poloId: string | null,
    status: ElectronicSignatureInboxTab,
  ) =>
    [
      "assinatura-eletronica",
      "inbox",
      profile,
      contextId,
      poloId,
      status,
    ] as const,
  envelope: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    envelopeId: string,
  ) =>
    [
      "assinatura-eletronica",
      "envelope",
      profile,
      contextId,
      envelopeId,
    ] as const,
  consentTerm: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    envelopeId: string,
    participantId: string,
  ) =>
    [
      "assinatura-eletronica",
      "consent-term",
      profile,
      contextId,
      envelopeId,
      participantId,
    ] as const,
  archiveLists: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    poloId: string | null,
  ) =>
    [
      "assinatura-eletronica",
      "archive",
      profile,
      contextId,
      poloId,
    ] as const,
  archiveList: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    poloId: string | null,
    filters: ElectronicSignatureArchiveFilters,
  ) =>
    [
      ...electronicSignatureQueryKeys.archiveLists(profile, contextId, poloId),
      "list",
      filters,
    ] as const,
  archiveTurmas: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    poloId: string | null,
  ) =>
    [
      ...electronicSignatureQueryKeys.archiveLists(profile, contextId, poloId),
      "turmas",
    ] as const,
  diaryEnvelopes: () =>
    [
      "assinatura-eletronica",
      "diary-envelope",
    ] as const,
  diaryEnvelope: (
    profile: ElectronicSignatureProfile,
    contextId: string,
    poloId: string,
    turmaId: string,
    disciplinaId: string,
  ) =>
    [
      "assinatura-eletronica",
      "diary-envelope",
      profile,
      contextId,
      poloId,
      turmaId,
      disciplinaId,
    ] as const,
  modelAsset: (assetId: string) =>
    [
      "assinatura-eletronica",
      "model-asset",
      assetId,
    ] as const,
};
