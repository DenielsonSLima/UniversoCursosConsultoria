export const ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT = "MODELO_PADRAO";

export const DEFAULT_INBOX_EMPTY_MESSAGE =
  "Não há documentos disponíveis para esta etapa.";
export const RECEIPT_FIELD_IDS = [
  "envelope",
  "document_revision",
  "participants",
  "events",
] as const;
export const ELECTRONIC_SIGNATURE_MODEL_ASSETS_FUNCTION =
  "assinatura-eletronica-modelo-assets";
export const ELECTRONIC_SIGNATURE_REAUTHENTICATION_FUNCTION =
  "assinatura-eletronica-reautenticacao";
export const ELECTRONIC_SIGNATURE_DIARY_ARTIFACTS_FUNCTION =
  "assinatura-eletronica-diario-artefatos";
export const ELECTRONIC_SIGNATURE_ARCHIVE_FUNCTION =
  "assinatura-eletronica-acervo";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export class ElectronicSignatureRequestError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code: string,
    status: number | null,
    retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "ElectronicSignatureRequestError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type RpcRecord = Record<string, unknown>;

export const asRecord = (value: unknown, message: string): RpcRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as RpcRecord;
};

export const firstRpcRecord = (value: unknown, message: string): RpcRecord => {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(message);
    return asRecord(value[0], message);
  }
  return asRecord(value, message);
};

export const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return value;
};

export const requiredBoundedString = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const normalized = requiredString(value, label);
  if (normalized.length > maximumLength) {
    throw new Error(`${label} excedeu o limite autorizado.`);
  }
  return normalized;
};

export const requiredBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return value;
};

export const requiredNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return value;
};

export const requiredInteger = (value: unknown, label: string): number => {
  const normalized = requiredNumber(value, label);
  if (!Number.isInteger(normalized)) {
    throw new Error(`${label} deve ser um número inteiro.`);
  }
  return normalized;
};

export const assertExactKeys = (
  source: RpcRecord,
  expected: readonly string[],
  label: string,
) => {
  const keys = Object.keys(source).sort();
  const canonical = [...expected].sort();
  if (
    keys.length !== canonical.length ||
    keys.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} não corresponde ao contrato autorizado.`);
  }
};

export const asNullableString = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value : null
);

export const stringValue = (
  value: unknown,
  label: string,
  maximumLength = 500,
) => {
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new Error(
      `${label} não corresponde à identidade institucional autorizada.`,
    );
  }
  return value;
};

export const normalizeAssetId = (value: unknown, label: string): string => {
  const assetId = requiredString(value, label).trim();
  if (!UUID_PATTERN.test(assetId)) {
    throw new Error(`${label} não tem o formato autorizado.`);
  }
  return assetId;
};

export const nullableUuid = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = requiredString(value, label).trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} não tem o formato autorizado.`);
  }
  return normalized;
};

export const requiredUuid = (value: unknown, label: string): string => {
  const normalized = nullableUuid(value, label);
  if (!normalized) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return normalized;
};

export const nullableInteger = (
  value: unknown,
  label: string,
): number | null => {
  if (value === null || value === undefined) return null;
  return requiredInteger(value, label);
};

export const requiredTimestamp = (value: unknown, label: string): string => {
  const normalized = requiredString(value, label);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} não é uma data válida.`);
  }
  return normalized;
};

export const nullableTimestamp = (
  value: unknown,
  label: string,
): string | null => (
  value === null || value === undefined ? null : requiredTimestamp(value, label)
);

export const nullableSha256 = (
  value: unknown,
  label: string,
): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} não corresponde a um SHA-256 autorizado.`);
  }
  return value;
};

export const normalizeRequiredSha256 = (
  value: unknown,
  label: string,
): string => {
  const normalized = nullableSha256(value, label);
  if (!normalized) {
    throw new Error(`${label} não foi informado pelo serviço autorizado.`);
  }
  return normalized;
};
