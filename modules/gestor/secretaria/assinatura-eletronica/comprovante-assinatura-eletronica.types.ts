import type { CanonicalPdfImage } from "../shared/canonical-document-vector-pdf.core.ts";
import type { CanonicalInstitutionalHeader } from "../shared/canonical-institutional-header-pdf.ts";
import type {
  ElectronicSignatureDocumentEditor,
  ElectronicSignatureInstitutionalWatermarkSettings,
  ElectronicSignaturePolicyPresentation,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";

const HASH_LENGTH_BY_ALGORITHM = {
  "SHA-256": 64,
  "SHA-512": 128,
} as const;

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

export interface PreparedElectronicSignatureReceipt {
  payload: ElectronicSignatureReceiptPayload;
  validationUrl: string;
  validationCode: string;
  qr: CanonicalPdfImage;
  participantsById: Map<string, ElectronicSignatureReceiptParticipant>;
}


