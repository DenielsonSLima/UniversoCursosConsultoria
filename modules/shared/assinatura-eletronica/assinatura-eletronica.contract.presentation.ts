import type { ElectronicSignatureReceiptField } from "./assinatura-eletronica.contract.inbox.ts";
import type { ElectronicSignatureDocumentEditor } from "./assinatura-eletronica.contract.stamp.ts";

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
 * A marca retrato institucional é um recurso inline já congelado pelo
 * backend. O identificador do Modelo de Documentos continua sendo a única
 * autoridade de origem; esta forma não admite URL, Storage ou fallback.
 */
export type ElectronicSignatureCanonicalInstitutionalWatermarkDataUri =
  `data:image/${"png" | "jpeg" | "webp"};base64,${string}`;

/**
 * Apresentação materializada em Modelos de Documentos junto do recurso
 * cadastro retrato do polo (`watermark_*`). Esses valores não podem ser recriados por
 * cada compositor: a prévia e o comprovante usam exatamente este registro.
 */
export interface ElectronicSignatureInstitutionalWatermarkSettings {
  opacity: number;
  scale: number;
  rotate: boolean;
}

export interface ElectronicSignaturePreviewWatermark
  extends ElectronicSignatureInstitutionalWatermarkSettings {
  url: ElectronicSignatureCanonicalInstitutionalWatermarkDataUri;
}

export interface ElectronicSignaturePreviewIdentity {
  institution: ElectronicSignaturePreviewInstitution;
  logoUrl: string | null;
  /** Sempre vem do cadastro retrato canônico da unidade emissora. */
  watermark: ElectronicSignaturePreviewWatermark;
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
