import type {
  ElectronicSignatureInboxCursor,
  ElectronicSignatureInboxItem,
  ElectronicSignatureInboxPage,
  ElectronicSignaturePrimaryAction,
} from "./assinatura-eletronica.contract";
import {
  asNullableString,
  asRecord,
  firstRpcRecord,
  nullableInteger,
  nullableSha256,
  nullableTimestamp,
  nullableUuid,
  requiredBoolean,
  requiredInteger,
  requiredString,
  requiredTimestamp,
  requiredUuid,
  type RpcRecord,
} from "./assinatura-eletronica.service.shared";

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

export const normalizeDocumentReadiness = (
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

export const normalizeInboxPage = (
  value: unknown,
): ElectronicSignatureInboxPage => {
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
      normalizeInboxItem(asRecord(item, "Item de assinatura inválido."))
    ),
    nextCursor: normalizeInboxCursor(source.nextCursor),
  };
};
