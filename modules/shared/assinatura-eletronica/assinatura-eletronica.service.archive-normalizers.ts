import type {
  ElectronicSignatureArchiveCursor,
  ElectronicSignatureArchiveFilters,
  ElectronicSignatureArchiveItem,
  ElectronicSignatureArchivePage,
  ElectronicSignatureArchiveSigner,
  ElectronicSignatureArtifactClass,
  ElectronicSignatureArtifactDownload,
  ElectronicSignatureArtifactProfile,
} from "./assinatura-eletronica.contract";
import { ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS } from "./assinatura-eletronica.contract";
import {
  asRecord,
  assertExactKeys,
  firstRpcRecord,
  normalizeRequiredSha256,
  requiredBoolean,
  requiredBoundedString,
  requiredInteger,
  requiredString,
  requiredTimestamp,
  requiredUuid,
} from "./assinatura-eletronica.service.shared";

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

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
    role: requiredBoundedString(source.role, "O papel do signatário", 40),
    name: requiredBoundedString(source.name, "O nome do signatário", 180),
    signedAt: requiredTimestamp(source.signedAt, "O instante da assinatura"),
  };
};

export const assertDiarySignerCount = (
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

export const normalizeArchivePage = (
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

export const normalizeArtifactClass = (
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

export const normalizeArtifactProfile = (
  value: unknown,
): ElectronicSignatureArtifactProfile => {
  if (value !== "GESTOR" && value !== "PROFESSOR" && value !== "COORDENADOR") {
    throw new Error("O perfil não pode solicitar este artefato.");
  }
  return value;
};

export const normalizeArtifactDownload = (
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

export const normalizeArchiveDateRange = (
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
