import { buildCorsHeaders, getClientIp } from "../_shared/http.ts";

export const MAX_REQUEST_BYTES = 8 * 1024;
export const REAUTH_TICKET_TTL_SECONDS = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TERM_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const ALLOWED_PROFILES = new Set([
  "ALUNO",
  "RESPONSAVEL_LEGAL",
  "PROFESSOR",
  "COORDENADOR",
  "GESTOR",
]);

export type ReauthenticationAction =
  | "REAUTHENTICATE"
  | "CONFIRM_SIGNATURE";

export type PublicErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "AUTHENTICATION_REQUIRED"
  | "SESSION_INVALID"
  | "INVALID_REQUEST"
  | "REQUEST_BODY_TOO_LARGE"
  | "RATE_LIMITED"
  | "PASSWORD_REAUTH_UNAVAILABLE"
  | "INVALID_PASSWORD"
  | "ACCESS_DENIED"
  | "REAUTH_TICKET_INVALID"
  | "REAUTH_TICKET_EXPIRED"
  | "REAUTH_TICKET_CONSUMED"
  | "IDEMPOTENCY_CONFLICT"
  | "SIGNATURE_ORDER_BLOCKED"
  | "SIGNATURE_POLICY_DISABLED"
  | "SECURE_CONFIGURATION_UNAVAILABLE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE";

export type PublicErrorBody = {
  ok: false;
  error: {
    code: PublicErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
};

export type ReauthenticateRequest = {
  action: "REAUTHENTICATE";
  envelopeId: string;
  participantId: string;
  profile: string;
  contextId: string;
  requestId: string;
  password: string;
  consent: SignatureConsent;
};

export type SignatureConsent = {
  accepted: true;
  termId: string;
  sha256: string;
};

export type ConfirmSignatureRequest = {
  action: "CONFIRM_SIGNATURE";
  requestId: string;
  ticket: string;
};

export type ReauthenticationRequest =
  | ReauthenticateRequest
  | ConfirmSignatureRequest;

export type AuthenticatedIdentity = {
  userId: string;
  sessionId: string;
};

export type ReauthenticationPreflight = {
  attemptId: string;
  email: string;
  passwordEnabled: boolean;
  rateLimit: {
    remaining: number;
    resetAt: string;
  };
};

export type SecondarySession = {
  userId: string;
  accessToken: string;
};

export type ReauthenticationTicket = {
  ticket: string;
  challengeId: string;
  envelopeId: string;
  participantId: string;
  participantRole: string;
  participantOrder: number;
  profile: string;
  contextId: string;
  issuedAt: string;
  expiresAt: string;
};

export type SignatureConfirmation = {
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
};

export type PrepareReauthenticationInput =
  & Omit<
    ReauthenticateRequest,
    "action" | "password"
  >
  & AuthenticatedIdentity
  & {
    attemptId: string;
  };

export type ReauthenticationEvidence = {
  provider: "SUPABASE_PASSWORD";
  authenticatedAt: string;
  consent: SignatureConsent;
  ipHash?: string;
  userAgentHash?: string;
};

export type RegisterReauthenticationInput = PrepareReauthenticationInput & {
  reauthenticatedAt: string;
  evidence: ReauthenticationEvidence;
};

export type ConfirmSignatureInput =
  & ConfirmSignatureRequest
  & AuthenticatedIdentity;

export type ReauthenticationDependencies = {
  authenticate: (bearer: string) => Promise<AuthenticatedIdentity>;
  prepareReauthentication: (
    input: PrepareReauthenticationInput,
  ) => Promise<ReauthenticationPreflight>;
  verifyPassword: (
    email: string,
    password: string,
  ) => Promise<SecondarySession>;
  revokeSecondarySession: (accessToken: string) => Promise<void>;
  registerReauthentication: (
    input: RegisterReauthenticationInput,
  ) => Promise<ReauthenticationTicket>;
  confirmSignature: (
    input: ConfirmSignatureInput,
  ) => Promise<SignatureConfirmation>;
  newAttemptId?: () => string;
  now?: () => Date;
};

type PublicHttpErrorOptions = {
  retryAfterSeconds?: number;
  cause?: unknown;
};

export class PublicHttpError extends Error {
  readonly status: number;
  readonly code: PublicErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: PublicErrorCode,
    message: string,
    options: PublicHttpErrorOptions = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : {
        cause: options.cause,
      },
    );
    this.name = "PublicHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class InvalidPasswordError extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super(
      "Password verification failed.",
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "InvalidPasswordError";
  }
}

export class AuthenticationServiceError extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super(
      "Authentication service unavailable.",
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "AuthenticationServiceError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const exactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
) => Object.keys(value).every((key) => allowed.includes(key));

const requiredUuid = (
  value: Record<string, unknown>,
  key: string,
) => {
  const candidate = typeof value[key] === "string" ? value[key].trim() : "";
  if (!UUID_PATTERN.test(candidate)) {
    throw invalidRequest();
  }
  return candidate.toLowerCase();
};

const requiredBoundedString = (
  value: Record<string, unknown>,
  key: string,
  maximumLength: number,
  trim = true,
) => {
  if (typeof value[key] !== "string") throw invalidRequest();
  const candidate = trim ? value[key].trim() : value[key];
  if (!candidate || candidate.length > maximumLength) throw invalidRequest();
  return candidate;
};

const requiredConsent = (value: unknown): SignatureConsent => {
  const source = asRecord(value);
  if (
    !source || !exactKeys(source, ["accepted", "termId", "sha256"]) ||
    source.accepted !== true
  ) {
    throw invalidRequest();
  }
  const termId = requiredBoundedString(source, "termId", 128, false);
  const sha256 = requiredBoundedString(source, "sha256", 64, false);
  if (!TERM_ID_PATTERN.test(termId) || !SHA256_PATTERN.test(sha256)) {
    throw invalidRequest();
  }
  return { accepted: true, termId, sha256 };
};

const invalidRequest = () =>
  new PublicHttpError(
    400,
    "INVALID_REQUEST",
    "Os dados enviados para a assinatura são inválidos.",
  );

export const parseReauthenticationRequest = (
  value: unknown,
): ReauthenticationRequest => {
  const source = asRecord(value);
  if (!source || typeof source.action !== "string") throw invalidRequest();

  if (source.action === "REAUTHENTICATE") {
    const allowed = [
      "action",
      "envelopeId",
      "participantId",
      "profile",
      "contextId",
      "requestId",
      "password",
      "consent",
    ] as const;
    if (!exactKeys(source, allowed)) throw invalidRequest();
    const profile = requiredBoundedString(source, "profile", 32);
    if (!ALLOWED_PROFILES.has(profile)) throw invalidRequest();
    return {
      action: "REAUTHENTICATE",
      envelopeId: requiredUuid(source, "envelopeId"),
      participantId: requiredUuid(source, "participantId"),
      profile,
      contextId: requiredUuid(source, "contextId"),
      requestId: requiredUuid(source, "requestId"),
      // Passwords are never normalized: spaces may be intentional.
      password: requiredBoundedString(source, "password", 1024, false),
      consent: requiredConsent(source.consent),
    };
  }

  if (source.action === "CONFIRM_SIGNATURE") {
    const allowed = ["action", "requestId", "ticket"] as const;
    if (!exactKeys(source, allowed)) throw invalidRequest();
    return {
      action: "CONFIRM_SIGNATURE",
      requestId: requiredUuid(source, "requestId"),
      ticket: requiredBoundedString(source, "ticket", 4096),
    };
  }

  throw invalidRequest();
};

const boundedRetryAfter = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 900;
  return Math.max(1, Math.min(900, Math.ceil(parsed)));
};

const readRetryAfterFromDatabaseError = (error: unknown) => {
  const record = asRecord(error);
  const detail = typeof record?.details === "string" ? record.details : "";
  try {
    const parsed = asRecord(JSON.parse(detail));
    return boundedRetryAfter(parsed?.retryAfterSeconds);
  } catch {
    return 900;
  }
};

export const publicErrorFromUnknown = (error: unknown): PublicHttpError => {
  if (error instanceof PublicHttpError) return error;
  if (error instanceof InvalidPasswordError) {
    return new PublicHttpError(
      401,
      "INVALID_PASSWORD",
      "A senha informada é inválida.",
    );
  }
  if (error instanceof AuthenticationServiceError) {
    return new PublicHttpError(
      503,
      "AUTH_SERVICE_UNAVAILABLE",
      "Não foi possível validar a senha agora. Tente novamente.",
    );
  }

  const record = asRecord(error);
  const internal = [record?.code, record?.message]
    .map((item) => String(item || ""))
    .join(" ")
    .toUpperCase();

  if (internal.includes("ASSINATURA_REAUTH_RATE_LIMITED")) {
    return new PublicHttpError(
      429,
      "RATE_LIMITED",
      "Muitas tentativas. Aguarde antes de tentar novamente.",
      { retryAfterSeconds: readRetryAfterFromDatabaseError(error) },
    );
  }
  if (
    internal.includes("ASSINATURA_REAUTH_SESSAO_INVALIDA") ||
    internal.includes("ASSINATURA_REAUTH_SESSION_INVALID") ||
    internal.includes("ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA") ||
    internal.includes("ASSINATURA_REAUTH_IDENTIDADE_DIVERGENTE")
  ) {
    return new PublicHttpError(
      401,
      "SESSION_INVALID",
      "Sua sessão não é mais válida. Entre novamente.",
    );
  }
  if (internal.includes("ASSINATURA_REAUTH_TICKET_INVALIDO")) {
    return new PublicHttpError(
      400,
      "REAUTH_TICKET_INVALID",
      "A confirmação de senha é inválida.",
    );
  }
  if (internal.includes("ASSINATURA_REAUTH_TICKET_EXPIRADO")) {
    return new PublicHttpError(
      409,
      "REAUTH_TICKET_EXPIRED",
      "A confirmação de senha expirou. Informe a senha novamente.",
    );
  }
  if (internal.includes("ASSINATURA_REAUTH_TICKET_CONSUMIDO")) {
    return new PublicHttpError(
      409,
      "REAUTH_TICKET_CONSUMED",
      "Esta confirmação de senha já foi utilizada.",
    );
  }
  if (
    internal.includes("ASSINATURA_REAUTH_TICKET_NAO_PERTENCE_A_SESSAO") ||
    internal.includes("ASSINATURA_REAUTH_DESAFIO_NAO_AUTORIZADO")
  ) {
    return new PublicHttpError(
      403,
      "ACCESS_DENIED",
      "Você não pode realizar esta assinatura.",
    );
  }
  if (internal.includes("ASSINATURA_REAUTH_TICKET_")) {
    return new PublicHttpError(
      400,
      "REAUTH_TICKET_INVALID",
      "A confirmação de senha é inválida.",
    );
  }
  if (
    internal.includes("IDEMPOTENCIA_PAYLOAD_DIVERGENTE") ||
    internal.includes("ASSINATURA_IDEMPOTENCIA_DIVERGENTE")
  ) {
    return new PublicHttpError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "A tentativa repetida não corresponde à operação original.",
    );
  }
  if (
    internal.includes("ASSINATURA_ORDEM_NAO_LIBERADA") ||
    internal.includes("ASSINATURA_REAUTH_ORDEM_INVALIDA") ||
    internal.includes("ASSINATURA_REAUTH_ORDEM_OU_ESTADO_INVALIDO")
  ) {
    return new PublicHttpError(
      409,
      "SIGNATURE_ORDER_BLOCKED",
      "A assinatura ainda não está liberada para este participante.",
    );
  }
  if (internal.includes("ASSINATURA_POLITICA_NAO_HABILITADA")) {
    return new PublicHttpError(
      409,
      "SIGNATURE_POLICY_DISABLED",
      "A política deste documento ainda não permite assinatura.",
    );
  }
  if (
    internal.includes("ASSINATURA_REAUTH_CONFIGURACAO_SEGURA_INDISPONIVEL") ||
    internal.includes("ASSINATURA_REAUTH_SECRET_INDISPONIVEL")
  ) {
    return new PublicHttpError(
      503,
      "SECURE_CONFIGURATION_UNAVAILABLE",
      "A confirmação segura está temporariamente indisponível.",
    );
  }
  if (
    internal.includes("42501") || internal.includes("P0002") ||
    internal.includes("ASSINATURA_REAUTH_SERVICE_ROLE_OBRIGATORIA") ||
    internal.includes("ASSINATURA_REAUTH_CONTEXTO_INVALIDO") ||
    internal.includes("ASSINATURA_REAUTH_PARTICIPANTE_INVALIDO") ||
    internal.includes("ASSINATURA_REAUTH_PARTICIPANTE_NAO_AUTORIZADO") ||
    internal.includes("ASSINATURA_REAUTH_ESCOPO_INVALIDO") ||
    internal.includes("ASSINATURA_REAUTH_USUARIO_INVALIDO")
  ) {
    return new PublicHttpError(
      403,
      "ACCESS_DENIED",
      "Você não pode realizar esta assinatura.",
    );
  }
  if (
    internal.includes("ASSINATURA_REAUTH_ARGUMENTO_INVALIDO") ||
    internal.includes("ASSINATURA_REAUTH_REQUEST_ID_OBRIGATORIO") ||
    internal.includes("ASSINATURA_REAUTH_EVIDENCIA_INVALIDA") ||
    internal.includes("ASSINATURA_REAUTH_CONSENTIMENTO_INVALIDO") ||
    internal.includes("ASSINATURA_REAUTH_ATTEMPT_OU_CONSENTIMENTO_INVALIDO") ||
    internal.includes("ASSINATURA_REAUTH_CONSUMO_INVALIDO")
  ) {
    return invalidRequest();
  }

  return new PublicHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O serviço de assinatura está temporariamente indisponível.",
  );
};

const readBodyBounded = async (request: Request, maximumBytes: number) => {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new PublicHttpError(
      413,
      "REQUEST_BODY_TOO_LARGE",
      "A solicitação ultrapassa o limite permitido.",
    );
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
      if (length > maximumBytes) {
        await reader.cancel("request-body-limit");
        throw new PublicHttpError(
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
  const bytes = await readBodyBounded(request, MAX_REQUEST_BYTES);
  try {
    return JSON.parse(new globalThis.TextDecoder().decode(bytes));
  } catch {
    throw invalidRequest();
  }
};

const bearerFromRequest = (request: Request) => {
  const value = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] || "";
};

export const sha256Text = async (value: string) => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new globalThis.TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

const evidenceHashesFromRequest = async (
  request: Request,
  requestId: string,
) => {
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get("user-agent")?.trim() || "";
  const validIp = clientIp !== "unknown" && clientIp.length <= 256 &&
    !hasControlCharacters(clientIp);
  const validUserAgent = !!userAgent && userAgent.length <= 1024 &&
    !hasControlCharacters(userAgent);
  return {
    ...(validIp
      ? {
        ipHash: await sha256Text(
          `assinatura-eletronica:v1|ip|${requestId}|${clientIp}`,
        ),
      }
      : {}),
    ...(validUserAgent
      ? {
        userAgentHash: await sha256Text(
          `assinatura-eletronica:v1|user-agent|${requestId}|${userAgent}`,
        ),
      }
      : {}),
  };
};

const responseHeaders = (request: Request) => ({
  ...buildCorsHeaders(request),
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
});

const jsonResponse = (request: Request, body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });

const errorResponse = (request: Request, error: unknown) => {
  const safe = publicErrorFromUnknown(error);
  const body: PublicErrorBody = {
    ok: false,
    error: {
      code: safe.code,
      message: safe.message,
      ...(safe.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: safe.retryAfterSeconds }),
    },
  };
  return jsonResponse(request, body, safe.status);
};

const truncatedIsoSecond = (date: Date) => {
  const value = date.getTime();
  if (!Number.isFinite(value)) {
    throw new PublicHttpError(
      503,
      "SERVICE_UNAVAILABLE",
      "O serviço de assinatura está temporariamente indisponível.",
    );
  }
  return new Date(Math.floor(value / 1000) * 1000).toISOString();
};

const validatePreflight = (
  value: ReauthenticationPreflight,
  expectedAttemptId: string,
): ReauthenticationPreflight => {
  if (
    !value || !UUID_PATTERN.test(value.attemptId) ||
    value.attemptId.toLowerCase() !== expectedAttemptId ||
    typeof value.email !== "string" || !value.email.trim() ||
    typeof value.passwordEnabled !== "boolean" ||
    !value.rateLimit || !Number.isInteger(value.rateLimit.remaining) ||
    typeof value.rateLimit.resetAt !== "string"
  ) {
    throw new PublicHttpError(
      503,
      "SERVICE_UNAVAILABLE",
      "O serviço de assinatura está temporariamente indisponível.",
    );
  }
  return {
    attemptId: value.attemptId.toLowerCase(),
    email: value.email.trim().toLowerCase(),
    passwordEnabled: value.passwordEnabled,
    rateLimit: {
      remaining: Math.max(0, value.rateLimit.remaining),
      resetAt: value.rateLimit.resetAt,
    },
  };
};

const prepareInput = (
  body: ReauthenticateRequest,
  identity: AuthenticatedIdentity,
  attemptId: string,
): PrepareReauthenticationInput => ({
  envelopeId: body.envelopeId,
  participantId: body.participantId,
  profile: body.profile,
  contextId: body.contextId,
  requestId: body.requestId,
  consent: body.consent,
  attemptId,
  userId: identity.userId,
  sessionId: identity.sessionId,
});

export const createReauthenticationHandler = (
  dependencies: ReauthenticationDependencies,
) =>
async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(request) });
  }
  if (request.method !== "POST") {
    return errorResponse(
      request,
      new PublicHttpError(
        405,
        "METHOD_NOT_ALLOWED",
        "Método não permitido.",
      ),
    );
  }

  try {
    const bearer = bearerFromRequest(request);
    if (!bearer) {
      throw new PublicHttpError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Autenticação obrigatória.",
      );
    }
    const identity = await dependencies.authenticate(bearer);
    const body = parseReauthenticationRequest(await parseJsonBody(request));

    if (body.action === "CONFIRM_SIGNATURE") {
      const data = await dependencies.confirmSignature({
        ...body,
        userId: identity.userId,
        sessionId: identity.sessionId,
      });
      return jsonResponse(request, {
        ok: true,
        action: body.action,
        requestId: body.requestId,
        data,
      }, 200);
    }

    // IP e user-agent são evidências auxiliares: quando o gateway os fornece,
    // somente digests vinculados ao ato/requestId seguem para o banco.
    const evidenceHashes = await evidenceHashesFromRequest(
      request,
      body.requestId,
    );
    const attemptId = String(
      (dependencies.newAttemptId || (() => globalThis.crypto.randomUUID()))(),
    ).trim().toLowerCase();
    if (!UUID_PATTERN.test(attemptId)) {
      throw new PublicHttpError(
        503,
        "SERVICE_UNAVAILABLE",
        "O serviço de assinatura está temporariamente indisponível.",
      );
    }
    const input = prepareInput(body, identity, attemptId);
    const preflight = validatePreflight(
      await dependencies.prepareReauthentication(input),
      attemptId,
    );
    if (!preflight.passwordEnabled) {
      throw new PublicHttpError(
        409,
        "PASSWORD_REAUTH_UNAVAILABLE",
        "Esta conta ainda não possui senha. Cadastre ou recupere uma senha antes de assinar.",
      );
    }

    const secondary = await dependencies.verifyPassword(
      preflight.email,
      body.password,
    );
    if (!secondary?.accessToken) {
      throw new AuthenticationServiceError();
    }

    // A sessão secundária precisa ser revogada mesmo se o Auth retornar um UID
    // inesperado. Nenhum ticket pode ser emitido quando a revogação falha.
    await dependencies.revokeSecondarySession(secondary.accessToken);
    if (!secondary.userId || secondary.userId !== identity.userId) {
      throw new PublicHttpError(
        401,
        "SESSION_INVALID",
        "Sua sessão não é mais válida. Entre novamente.",
      );
    }

    // O mesmo preflight/attemptId não incrementa o limitador, mas revalida a
    // sessão original depois que a sessão isolada foi criada e revogada. Uma
    // nova invocação HTTP sempre recebe outro attemptId no servidor.
    const refreshedPreflight = validatePreflight(
      await dependencies.prepareReauthentication(input),
      attemptId,
    );
    if (
      !refreshedPreflight.passwordEnabled ||
      refreshedPreflight.email !== preflight.email
    ) {
      throw new PublicHttpError(
        503,
        "SERVICE_UNAVAILABLE",
        "O serviço de assinatura está temporariamente indisponível.",
      );
    }

    const authenticatedAt = truncatedIsoSecond(
      (dependencies.now || (() => new Date()))(),
    );
    const data = await dependencies.registerReauthentication({
      ...input,
      reauthenticatedAt: authenticatedAt,
      evidence: {
        provider: "SUPABASE_PASSWORD",
        authenticatedAt,
        ...evidenceHashes,
        consent: body.consent,
      },
    });
    if (
      data.envelopeId !== body.envelopeId ||
      data.participantId !== body.participantId ||
      data.profile !== body.profile || data.contextId !== body.contextId
    ) {
      throw new PublicHttpError(
        503,
        "SERVICE_UNAVAILABLE",
        "O serviço de assinatura está temporariamente indisponível.",
      );
    }

    return jsonResponse(request, {
      ok: true,
      action: body.action,
      requestId: body.requestId,
      data,
    }, 200);
  } catch (error) {
    return errorResponse(request, error);
  }
};
