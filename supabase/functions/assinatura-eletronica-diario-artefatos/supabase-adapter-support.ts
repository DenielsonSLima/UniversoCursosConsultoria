import { PublicHttpError } from "./artifact-contracts.ts";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
export const MASKED_CPF_PATTERN =
  /^(?:[0-9]{2}\*\.\*{3}\.\*{2}[0-9]-[0-9]{2}|\*{3}\.\*{3}\.\*{3}-[0-9]{2})$/u;
export const SIGNATURE_CODE_PATTERN =
  /^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;

export type RpcResult = { data: unknown; error: unknown };
export type StorageResult<T> = { data: T | null; error: unknown };

export type StorageBucket = {
  download: (path: string) => PromiseLike<StorageResult<Blob>>;
  upload: (
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; cacheControl: string; upsert: false },
  ) => PromiseLike<StorageResult<{ path?: string }>>;
  remove: (
    paths: string[],
  ) => PromiseLike<StorageResult<Array<{ name?: string }>>>;
};

export type AdminClient = {
  auth: {
    getClaims: (
      bearer: string,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    getUser: (bearer: string) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
  storage: { from: (bucketId: string) => StorageBucket };
};

export type ClientFactory = (
  supabaseUrl: string,
  apiKey: string,
  options: Record<string, unknown>,
) => AdminClient;

export type OrphanUploadClaim = {
  intentId: string;
  leaseToken: string;
  envelopeId: string;
  artifactClass:
    | "DOCUMENTO_ORIGINAL"
    | "DOCUMENTO_FINAL"
    | "COMPROVANTE_EVIDENCIA";
  bucketId: string;
  storagePath: string;
  byteSize: number;
  sha256: string;
};

export type DiarioArtifactRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  validationOrigin: string;
  validationAllowedOrigins: readonly string[];
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const unwrapRecord = (value: unknown) =>
  asRecord(Array.isArray(value) ? value[0] : value);

export const unavailable = (cause?: unknown) =>
  new PublicHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O serviço de documentos está temporariamente indisponível.",
    cause,
  );

export const sessionInvalid = () =>
  new PublicHttpError(401, "SESSION_INVALID", "Sua sessão não é mais válida.");

export const requiredString = (
  source: Record<string, unknown> | null,
  key: string,
  maximumLength = 4096,
) => {
  const value = typeof source?.[key] === "string" ? source[key].trim() : "";
  if (!value || value.length > maximumLength) throw unavailable();
  return value;
};

export const requiredUuid = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = requiredString(source, key, 36).toLowerCase();
  if (!UUID_PATTERN.test(value)) throw unavailable();
  return value;
};

export const requiredSha256 = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = requiredString(source, key, 64).toLowerCase();
  if (!SHA256_PATTERN.test(value)) throw unavailable();
  return value;
};

export const requiredInteger = (
  source: Record<string, unknown> | null,
  key: string,
  minimum: number,
  maximum: number,
) => {
  const value = Number(source?.[key]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw unavailable();
  }
  return value;
};

export const requiredRecord = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = asRecord(source?.[key]);
  if (!value) throw unavailable();
  return value;
};

export const requiredArray = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = source?.[key];
  if (!Array.isArray(value)) throw unavailable();
  return value;
};

export const requiredFiniteNumber = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = source?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw unavailable();
  return value;
};
