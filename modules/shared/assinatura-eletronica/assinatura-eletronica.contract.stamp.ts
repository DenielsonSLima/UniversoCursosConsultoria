import type {
  ElectronicSignatureEvidenceEditorPage,
  ElectronicSignatureLegalEditorPage,
} from "./assinatura-eletronica.contract.legal.ts";

export const ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL =
  "Documento assinado eletronicamente" as const;
export const ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE =
  "Assinado digitalmente" as const;
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
  | "HELVETICA_OBLIQUE"
  | "HELVETICA_BOLD_OBLIQUE"
  | "COURIER"
  | "COURIER_BOLD"
  | "COURIER_OBLIQUE"
  | "COURIER_BOLD_OBLIQUE";

export const ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_HELVETICA_FONTS = [
  "HELVETICA",
  "HELVETICA_BOLD",
  "HELVETICA_OBLIQUE",
  "HELVETICA_BOLD_OBLIQUE",
] as const satisfies readonly ElectronicSignatureStampTemplateFont[];

export const ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_COURIER_FONTS = [
  "COURIER",
  "COURIER_BOLD",
  "COURIER_OBLIQUE",
  "COURIER_BOLD_OBLIQUE",
] as const satisfies readonly ElectronicSignatureStampTemplateFont[];

/** Faixa segura compartilhada pelo editor, banco e compositores vetoriais. */
export const ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS = {
  minBp: 4_000,
  maxBp: 16_000,
  stepBp: 500,
} as const;

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
