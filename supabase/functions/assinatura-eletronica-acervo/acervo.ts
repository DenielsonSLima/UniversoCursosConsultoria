import { buildCorsHeaders } from "../_shared/http.ts";

export const MAX_ARCHIVE_REQUEST_BYTES = 8 * 1024;
export const ARCHIVE_DOWNLOAD_TTL_SECONDS = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ALLOWED_PROFILES = new Set(
  [
    "GESTOR",
    "PROFESSOR",
    "COORDENADOR",
  ] as const,
);
const ALLOWED_ARTIFACT_CLASSES = new Set(
  [
    "DOCUMENTO_ORIGINAL",
    "DOCUMENTO_FINAL",
    "COMPROVANTE_EVIDENCIA",
  ] as const,
);

export type ArchiveProfile = "GESTOR" | "PROFESSOR" | "COORDENADOR";
export type ArchiveArtifactClass =
  | "DOCUMENTO_ORIGINAL"
  | "DOCUMENTO_FINAL"
  | "COMPROVANTE_EVIDENCIA";

export type CreateDownloadUrlRequest = {
  action: "CREATE_DOWNLOAD_URL";
  envelopeId: string;
  artifactClass: ArchiveArtifactClass;
  profile: ArchiveProfile;
  contextId: string;
  requestId: string;
};

export type AuthenticatedArchiveIdentity = {
  userId: string;
  sessionId: string;
};

export type AuthorizedArtifact = {
  envelopeId: string;
  artifactId: string;
  artifactClass: ArchiveArtifactClass;
  sha256: string;
  byteSize: number;
  mimeType: "application/pdf";
  fileName: string;
};

export type ResolvedArtifact = AuthorizedArtifact & {
  requestId: string;
  bucketId: string;
  storagePath: string;
};

export type CreateSignedDownloadInput = {
  bucketId: string;
  storagePath: string;
  fileName: string;
  expiresIn: typeof ARCHIVE_DOWNLOAD_TTL_SECONDS;
};

export type ArchiveDependencies = {
  authenticate: (bearer: string) => Promise<AuthenticatedArchiveIdentity>;
  resolveAuthorizedArtifact: (
    identity: AuthenticatedArchiveIdentity,
    input: CreateDownloadUrlRequest,
  ) => Promise<ResolvedArtifact>;
  createSignedDownload: (input: CreateSignedDownloadInput) => Promise<string>;
  now?: () => Date;
};

export type ArchivePublicErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "AUTHENTICATION_REQUIRED"
  | "SESSION_INVALID"
  | "INVALID_REQUEST"
  | "REQUEST_BODY_TOO_LARGE"
  | "ACCESS_DENIED"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_UNAVAILABLE"
  | "SECURE_CONFIGURATION_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE";

type ArchiveHttpErrorOptions = { cause?: unknown };

export class ArchiveHttpError extends Error {
  readonly status: number;
  readonly code: ArchivePublicErrorCode;

  constructor(
    status: number,
    code: ArchivePublicErrorCode,
    message: string,
    options: ArchiveHttpErrorOptions = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ArchiveHttpError";
    this.status = status;
    this.code = code;
  }
}

const invalidRequest = () =>
  new ArchiveHttpError(
    400,
    "INVALID_REQUEST",
    "Os dados enviados para acessar o documento são inválidos.",
  );

const artifactUnavailable = () =>
  new ArchiveHttpError(
    503,
    "ARTIFACT_UNAVAILABLE",
    "O documento está temporariamente indisponível.",
  );

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const unwrapRecord = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.length === 1 ? asRecord(value[0]) : null;
  }
  return asRecord(value);
};

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
) => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index]);
};

const requiredUuid = (
  source: Record<string, unknown>,
  key: string,
) => {
  const candidate = typeof source[key] === "string" ? source[key] : "";
  if (!UUID_PATTERN.test(candidate)) throw invalidRequest();
  return candidate.toLowerCase();
};

const requiredExactString = (
  source: Record<string, unknown>,
  key: string,
  maximumLength: number,
) => {
  const candidate = typeof source[key] === "string" ? source[key] : "";
  if (
    !candidate || candidate.length > maximumLength ||
    candidate !== candidate.trim()
  ) throw invalidRequest();
  return candidate;
};

export const parseArchiveRequest = (
  value: unknown,
): CreateDownloadUrlRequest => {
  const source = asRecord(value);
  const keys = [
    "action",
    "envelopeId",
    "artifactClass",
    "profile",
    "contextId",
    "requestId",
  ] as const;
  if (!source || !hasExactKeys(source, keys)) throw invalidRequest();
  if (source.action !== "CREATE_DOWNLOAD_URL") throw invalidRequest();

  const artifactClass = requiredExactString(
    source,
    "artifactClass",
    32,
  ) as ArchiveArtifactClass;
  const profile = requiredExactString(source, "profile", 32) as ArchiveProfile;
  if (
    !ALLOWED_ARTIFACT_CLASSES.has(artifactClass) ||
    !ALLOWED_PROFILES.has(profile)
  ) throw invalidRequest();

  return {
    action: "CREATE_DOWNLOAD_URL",
    envelopeId: requiredUuid(source, "envelopeId"),
    artifactClass,
    profile,
    contextId: requiredUuid(source, "contextId"),
    requestId: requiredUuid(source, "requestId"),
  };
};

const unavailableFromContract = () => artifactUnavailable();

const requiredArtifactUuid = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const candidate = typeof source?.[key] === "string" ? source[key] : "";
  if (!UUID_PATTERN.test(candidate)) throw unavailableFromContract();
  return candidate.toLowerCase();
};

const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

const requiredArtifactString = (
  source: Record<string, unknown> | null,
  key: string,
  maximumLength: number,
) => {
  const candidate = typeof source?.[key] === "string" ? source[key] : "";
  if (
    !candidate || candidate.length > maximumLength ||
    candidate !== candidate.trim() || hasControlCharacters(candidate)
  ) throw unavailableFromContract();
  return candidate;
};

const normalizeCommonArtifact = (
  source: Record<string, unknown> | null,
): AuthorizedArtifact => {
  const artifactClass = requiredArtifactString(
    source,
    "artifactClass",
    32,
  ) as ArchiveArtifactClass;
  const sha256 = requiredArtifactString(source, "sha256", 64);
  const mimeType = requiredArtifactString(source, "mimeType", 128);
  const fileName = requiredArtifactString(source, "fileName", 255);
  const byteSize = source?.byteSize;
  if (
    !ALLOWED_ARTIFACT_CLASSES.has(artifactClass) ||
    !SHA256_PATTERN.test(sha256) || mimeType !== "application/pdf" ||
    typeof byteSize !== "number" || !Number.isSafeInteger(byteSize) ||
    byteSize <= 0 || !fileName.toLowerCase().endsWith(".pdf") ||
    /[/\\]/.test(fileName)
  ) throw unavailableFromContract();

  return {
    envelopeId: requiredArtifactUuid(source, "envelopeId"),
    artifactId: requiredArtifactUuid(source, "artifactId"),
    artifactClass,
    sha256,
    byteSize,
    mimeType: "application/pdf",
    fileName,
  };
};

const PUBLIC_ARTIFACT_KEYS = [
  "envelopeId",
  "artifactId",
  "artifactClass",
  "sha256",
  "byteSize",
  "mimeType",
  "fileName",
] as const;

export const normalizeResolvedArtifact = (
  value: unknown,
): ResolvedArtifact => {
  const source = unwrapRecord(value);
  if (
    !source ||
    !hasExactKeys(source, [
      "requestId",
      ...PUBLIC_ARTIFACT_KEYS,
      "bucketId",
      "storagePath",
    ])
  ) throw unavailableFromContract();

  const common = normalizeCommonArtifact(source);
  const requestId = requiredArtifactUuid(source, "requestId");
  const bucketId = requiredArtifactString(source, "bucketId", 128);
  const storagePath = requiredArtifactString(source, "storagePath", 1024);
  if (
    bucketId.startsWith("/") || bucketId.endsWith("/") ||
    /[/\\]/.test(bucketId) || storagePath.startsWith("/") ||
    storagePath.split("/").some((segment) => !segment || segment === "..") ||
    storagePath.includes("\\")
  ) throw unavailableFromContract();

  return { requestId, ...common, bucketId, storagePath };
};

const readBodyBounded = async (request: Request) => {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0) throw invalidRequest();
    if (declared > MAX_ARCHIVE_REQUEST_BYTES) {
      throw new ArchiveHttpError(
        413,
        "REQUEST_BODY_TOO_LARGE",
        "A solicitação ultrapassa o limite permitido.",
      );
    }
  }
  if (!request.body) throw invalidRequest();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > MAX_ARCHIVE_REQUEST_BYTES) {
        await reader.cancel("request-body-limit");
        throw new ArchiveHttpError(
          413,
          "REQUEST_BODY_TOO_LARGE",
          "A solicitação ultrapassa o limite permitido.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const parseJsonBody = async (request: Request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) throw invalidRequest();
  try {
    const bytes = await readBodyBounded(request);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ArchiveHttpError) throw error;
    throw invalidRequest();
  }
};

const bearerFromRequest = (request: Request) => {
  const value = request.headers.get("authorization") || "";
  return /^Bearer\s+([^\s]+)$/i.exec(value.trim())?.[1] || "";
};

const responseHeaders = (request: Request) => ({
  ...buildCorsHeaders(request),
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
});

const jsonResponse = (
  request: Request,
  body: unknown,
  status: number,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });

export const publicArchiveErrorFromUnknown = (
  error: unknown,
): ArchiveHttpError => {
  if (error instanceof ArchiveHttpError) return error;
  const source = asRecord(error);
  const internal = [source?.code, source?.message]
    .map((value) => String(value || ""))
    .join(" ")
    .toUpperCase();

  if (
    internal.includes("ASSINATURA_ACERVO_SESSAO_INVALIDA") ||
    internal.includes("ACERVO_SESSAO_INVALIDA") ||
    internal.includes("ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA") ||
    internal.includes("AUTENTICACAO_OBRIGATORIA")
  ) {
    return new ArchiveHttpError(
      401,
      "SESSION_INVALID",
      "Sua sessão não é mais válida. Entre novamente.",
    );
  }
  if (
    internal.includes("SERVICE_ROLE_OBRIGATORIA") ||
    internal.includes("CONFIGURACAO_SEGURA_INDISPONIVEL")
  ) {
    return new ArchiveHttpError(
      503,
      "SECURE_CONFIGURATION_UNAVAILABLE",
      "O acesso seguro ao documento está temporariamente indisponível.",
    );
  }
  if (
    internal.includes("42501") || internal.includes("NAO_AUTORIZADO") ||
    internal.includes("ACESSO_NEGADO")
  ) {
    return new ArchiveHttpError(
      403,
      "ACCESS_DENIED",
      "Você não pode acessar este documento.",
    );
  }
  if (internal.includes("P0002") || internal.includes("NAO_ENCONTRADO")) {
    return new ArchiveHttpError(
      404,
      "ARTIFACT_NOT_FOUND",
      "Documento não encontrado.",
    );
  }
  if (internal.includes("ASSINATURA_ARTEFATO_ESCOPO_INVALIDO")) {
    return invalidRequest();
  }
  if (
    internal.includes("ARTEFATO_INDISPONIVEL") ||
    internal.includes("METADADOS_DIVERGENTES") ||
    internal.includes("INTEGRIDADE_INVALIDA")
  ) return artifactUnavailable();

  return new ArchiveHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O acervo de documentos está temporariamente indisponível.",
  );
};

const errorResponse = (request: Request, error: unknown) => {
  const safe = publicArchiveErrorFromUnknown(error);
  return jsonResponse(request, {
    ok: false,
    error: { code: safe.code, message: safe.message },
  }, safe.status);
};

const validateSignedUrl = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw artifactUnavailable();
  }
  const localHttp = parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !localHttp) || parsed.username ||
    parsed.password
  ) throw artifactUnavailable();
  return parsed.toString();
};

export const createArchiveHandler =
  (dependencies: ArchiveDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: buildCorsHeaders(request) });
    }
    if (request.method !== "POST") {
      return errorResponse(
        request,
        new ArchiveHttpError(
          405,
          "METHOD_NOT_ALLOWED",
          "Método não permitido.",
        ),
      );
    }

    try {
      const bearer = bearerFromRequest(request);
      if (!bearer) {
        throw new ArchiveHttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Autenticação obrigatória.",
        );
      }
      const identity = await dependencies.authenticate(bearer);
      const body = parseArchiveRequest(await parseJsonBody(request));

      // Uma única RPC service-role revalida sessão e RBAC com identidade
      // explícita e resolve a coordenada privada no mesmo statement.
      const resolved = normalizeResolvedArtifact(
        await dependencies.resolveAuthorizedArtifact(identity, body),
      );
      if (
        resolved.requestId !== body.requestId ||
        resolved.envelopeId !== body.envelopeId ||
        resolved.artifactClass !== body.artifactClass
      ) throw artifactUnavailable();

      const authorized: AuthorizedArtifact = {
        envelopeId: resolved.envelopeId,
        artifactId: resolved.artifactId,
        artifactClass: resolved.artifactClass,
        sha256: resolved.sha256,
        byteSize: resolved.byteSize,
        mimeType: resolved.mimeType,
        fileName: resolved.fileName,
      };

      // Calculado antes da assinatura para nunca anunciar validade maior do
      // que o TTL efetivamente solicitado ao Storage.
      const now = (dependencies.now || (() => new Date()))();
      if (!Number.isFinite(now.getTime())) throw artifactUnavailable();
      const expiresAt = new Date(
        now.getTime() + ARCHIVE_DOWNLOAD_TTL_SECONDS * 1000,
      ).toISOString();
      const url = validateSignedUrl(
        await dependencies.createSignedDownload({
          bucketId: resolved.bucketId,
          storagePath: resolved.storagePath,
          fileName: authorized.fileName,
          expiresIn: ARCHIVE_DOWNLOAD_TTL_SECONDS,
        }),
      );

      return jsonResponse(request, {
        ok: true,
        action: "CREATE_DOWNLOAD_URL",
        requestId: body.requestId,
        data: {
          ...authorized,
          url,
          expiresAt,
          expiresIn: ARCHIVE_DOWNLOAD_TTL_SECONDS,
        },
      }, 200);
    } catch (error) {
      return errorResponse(request, error);
    }
  };
