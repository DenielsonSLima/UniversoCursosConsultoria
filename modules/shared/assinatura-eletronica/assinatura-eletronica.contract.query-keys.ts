import type {
  ElectronicSignatureArchiveFilters,
  ElectronicSignatureInboxTab,
  ElectronicSignatureProfile,
} from "./assinatura-eletronica.contract.inbox.ts";

export const electronicSignatureQueryKeys = {
  administration: (poloId: string | null, documentType: string) =>
    ["assinatura-eletronica", "administration", poloId, documentType] as const,
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
  diaryEnvelopes: () => ["assinatura-eletronica", "diary-envelope"] as const,
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
    ["assinatura-eletronica", "model-asset", assetId] as const,
};
