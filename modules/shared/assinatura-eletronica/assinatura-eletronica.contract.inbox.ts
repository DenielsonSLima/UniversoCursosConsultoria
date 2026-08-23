import type { ElectronicSignatureLegalSection } from "./assinatura-eletronica.contract.legal.ts";

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
