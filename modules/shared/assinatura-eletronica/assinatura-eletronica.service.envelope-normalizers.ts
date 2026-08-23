import type {
  ElectronicSignatureConfirmationResult,
  ElectronicSignatureDiaryArtifactResult,
  ElectronicSignatureDiaryEnvelopeRequestResult,
  ElectronicSignatureEnvelopeDetail,
  ElectronicSignatureEnvelopeParticipant,
  ElectronicSignatureProfile,
  ElectronicSignatureReauthenticationResult,
} from "./assinatura-eletronica.contract";
import { assertDiarySignerCount } from "./assinatura-eletronica.service.archive-normalizers";
import { normalizeDocumentReadiness } from "./assinatura-eletronica.service.inbox-normalizers";
import {
  asNullableString,
  asRecord,
  assertExactKeys,
  firstRpcRecord,
  nullableSha256,
  nullableTimestamp,
  nullableUuid,
  requiredBoolean,
  requiredInteger,
  requiredString,
  requiredTimestamp,
  requiredUuid,
} from "./assinatura-eletronica.service.shared";

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

export const normalizeEnvelopeDetail = (
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

export const normalizeReauthentication = (
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

export const normalizeConfirmation = (
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

export const normalizeDiaryEnvelopeRequest = (
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

export const normalizeOptionalEnvelopeDetail = (
  value: unknown,
): ElectronicSignatureEnvelopeDetail | null => (
  value === null || value === undefined ? null : normalizeEnvelopeDetail(value)
);

export const normalizeDiaryArtifact = (
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
