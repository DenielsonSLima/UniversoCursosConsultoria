// deno-lint-ignore no-import-prefix -- Supabase Edge resolve dependências npm por specifier explícito.
import { createClient } from "npm:@supabase/supabase-js@2.106.1";
import {
  type AuthenticatedIdentity,
  AuthenticationServiceError,
  type ConfirmSignatureInput,
  InvalidPasswordError,
  type PrepareReauthenticationInput,
  PublicHttpError,
  REAUTH_TICKET_TTL_SECONDS,
  type ReauthenticationDependencies,
  type ReauthenticationPreflight,
  type ReauthenticationTicket,
  type RegisterReauthenticationInput,
  type SecondarySession,
  type SignatureConfirmation,
} from "./reauthentication.ts";

export const PREPARE_REAUTHENTICATION_RPC =
  "assinatura_eletronica_internal_preparar_reautenticacao";
export const REGISTER_REAUTHENTICATION_RPC =
  "assinatura_eletronica_internal_registrar_reautenticacao";
export const CONFIRM_SIGNATURE_RPC =
  "assinatura_eletronica_internal_consumir_ticket_reautenticacao";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcResult = { data: unknown; error: unknown };

type AdminClient = {
  auth: {
    getClaims: (
      bearer: string,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    getUser: (
      bearer: string,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    admin: {
      signOut: (
        accessToken: string,
        scope: "local",
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};

type PasswordClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type ClientFactory = (
  supabaseUrl: string,
  apiKey: string,
  options: Record<string, unknown>,
) => AdminClient | PasswordClient;

export type SupabaseRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  publicApiKey: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const unwrapRecord = (value: unknown) => {
  const unwrapped = Array.isArray(value) ? value[0] : value;
  return asRecord(unwrapped);
};

const requiredString = (
  source: Record<string, unknown> | null,
  key: string,
  maximumLength = 4096,
) => {
  const candidate = typeof source?.[key] === "string" ? source[key].trim() : "";
  if (!candidate || candidate.length > maximumLength) {
    throw unavailable();
  }
  return candidate;
};

const requiredUuid = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const candidate = requiredString(source, key, 36);
  if (!UUID_PATTERN.test(candidate)) throw unavailable();
  return candidate.toLowerCase();
};

const optionalUuid = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  if (source?.[key] === null || source?.[key] === undefined) return null;
  return requiredUuid(source, key);
};

const optionalString = (
  source: Record<string, unknown> | null,
  key: string,
  maximumLength = 128,
) => {
  if (source?.[key] === null || source?.[key] === undefined) return null;
  return requiredString(source, key, maximumLength);
};

const requiredInteger = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const candidate = Number(source?.[key]);
  if (!Number.isInteger(candidate) || candidate < 1) throw unavailable();
  return candidate;
};

const requiredIsoTimestamp = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const candidate = requiredString(source, key, 64);
  if (!Number.isFinite(Date.parse(candidate))) throw unavailable();
  return candidate;
};

const unavailable = () =>
  new PublicHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O serviço de assinatura está temporariamente indisponível.",
  );

const sessionInvalid = () =>
  new PublicHttpError(
    401,
    "SESSION_INVALID",
    "Sua sessão não é mais válida. Entre novamente.",
  );

export const authenticateBearer = async (
  admin: AdminClient,
  bearer: string,
): Promise<AuthenticatedIdentity> => {
  const { data: claimsData, error: claimsError } = await admin.auth.getClaims(
    bearer,
  );
  const claims = asRecord(asRecord(claimsData)?.claims);
  const userId = typeof claims?.sub === "string" ? claims.sub.trim() : "";
  const sessionId = typeof claims?.session_id === "string"
    ? claims.session_id.trim()
    : "";
  const role = typeof claims?.role === "string"
    ? claims.role.trim().toLowerCase()
    : "";
  if (
    claimsError || !UUID_PATTERN.test(userId) ||
    !UUID_PATTERN.test(sessionId) || role !== "authenticated" ||
    claims?.is_anonymous === true
  ) {
    throw sessionInvalid();
  }

  const { data: userData, error: userError } = await admin.auth.getUser(
    bearer,
  );
  const user = asRecord(asRecord(userData)?.user);
  if (
    userError || requiredIdentityId(user) !== userId.toLowerCase() ||
    user?.is_anonymous === true
  ) {
    throw sessionInvalid();
  }

  return {
    userId: userId.toLowerCase(),
    sessionId: sessionId.toLowerCase(),
  };
};

const requiredIdentityId = (user: Record<string, unknown> | null) => {
  const id = typeof user?.id === "string" ? user.id.trim().toLowerCase() : "";
  return UUID_PATTERN.test(id) ? id : "";
};

export const normalizePreflight = (
  value: unknown,
): ReauthenticationPreflight => {
  const source = unwrapRecord(value);
  const rateLimit = asRecord(source?.rateLimit);
  const email = requiredString(source, "email", 320).toLowerCase();
  if (
    source?.passwordEnabled !== true && source?.passwordEnabled !== false
  ) {
    throw unavailable();
  }
  const remaining = Number(rateLimit?.remaining);
  const resetAt = requiredIsoTimestamp(rateLimit, "resetAt");
  if (!Number.isInteger(remaining) || remaining < 0 || remaining > 5) {
    throw unavailable();
  }
  return {
    attemptId: requiredUuid(source, "attemptId"),
    email,
    passwordEnabled: source.passwordEnabled,
    rateLimit: { remaining, resetAt },
  };
};

export const normalizeTicket = (value: unknown): ReauthenticationTicket => {
  const source = unwrapRecord(value);
  const issuedAt = requiredIsoTimestamp(source, "issuedAt");
  const expiresAt = requiredIsoTimestamp(source, "expiresAt");
  const lifetime = Date.parse(expiresAt) - Date.parse(issuedAt);
  if (
    lifetime <= 0 || lifetime > REAUTH_TICKET_TTL_SECONDS * 1000
  ) throw unavailable();
  const ticket = requiredString(source, "ticket", 4096);
  if (ticket.length < 32) throw unavailable();
  return {
    ticket,
    challengeId: requiredUuid(source, "challengeId"),
    envelopeId: requiredUuid(source, "envelopeId"),
    participantId: requiredUuid(source, "participantId"),
    participantRole: requiredString(source, "participantRole", 64),
    participantOrder: requiredInteger(source, "participantOrder"),
    profile: requiredString(source, "profile", 32),
    contextId: requiredUuid(source, "contextId"),
    issuedAt,
    expiresAt,
  };
};

export const normalizeConfirmation = (
  value: unknown,
): SignatureConfirmation => {
  const source = unwrapRecord(value);
  if (typeof source?.requiresFinalization !== "boolean") {
    throw unavailable();
  }
  const nextParticipantId = optionalUuid(source, "nextParticipantId");
  const nextParticipantRole = optionalString(source, "nextParticipantRole", 64);
  if (
    (nextParticipantId === null) !== (nextParticipantRole === null) ||
    (source.requiresFinalization && nextParticipantId !== null)
  ) {
    throw unavailable();
  }
  return {
    envelopeId: requiredUuid(source, "envelopeId"),
    envelopeStatus: requiredString(source, "envelopeStatus", 64),
    participantId: requiredUuid(source, "participantId"),
    participantRole: requiredString(source, "participantRole", 64),
    participantOrder: requiredInteger(source, "participantOrder"),
    participantStatus: requiredString(source, "participantStatus", 64),
    signedAt: requiredIsoTimestamp(source, "signedAt"),
    nextParticipantId,
    nextParticipantRole,
    requiresFinalization: source.requiresFinalization,
  };
};

const callRpc = async (
  admin: AdminClient,
  name: string,
  args: Record<string, unknown>,
) => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

const prepareArgs = (input: PrepareReauthenticationInput) => ({
  p_envelope_id: input.envelopeId,
  p_participante_id: input.participantId,
  p_perfil: input.profile,
  p_context_id: input.contextId,
  p_actor_auth_user_id: input.userId,
  p_auth_session_id: input.sessionId,
  p_consent: input.consent,
  p_request_id: input.requestId,
  p_attempt_id: input.attemptId,
});

export const createSupabaseReauthenticationDependencies = (
  config: SupabaseRuntimeConfig,
  factory: ClientFactory = createClient as unknown as ClientFactory,
): ReauthenticationDependencies => {
  if (
    !config.supabaseUrl || !config.serviceRoleKey || !config.publicApiKey ||
    config.publicApiKey === config.serviceRoleKey
  ) {
    throw unavailable();
  }

  const admin = factory(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as AdminClient;

  return {
    authenticate: (bearer) => authenticateBearer(admin, bearer),

    prepareReauthentication: async (input) =>
      normalizePreflight(
        await callRpc(admin, PREPARE_REAUTHENTICATION_RPC, prepareArgs(input)),
      ),

    verifyPassword: async (email, password): Promise<SecondarySession> => {
      const isolated = factory(config.supabaseUrl, config.publicApiKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }) as PasswordClient;
      let result: { data: unknown; error: unknown };
      try {
        result = await isolated.auth.signInWithPassword({ email, password });
      } catch (cause) {
        throw new AuthenticationServiceError({ cause });
      }
      if (result.error) {
        const errorRecord = asRecord(result.error);
        const status = Number(errorRecord?.status);
        if (status === 429) {
          throw new PublicHttpError(
            429,
            "RATE_LIMITED",
            "Muitas tentativas. Aguarde antes de tentar novamente.",
            { retryAfterSeconds: 900 },
          );
        }
        if ([400, 401, 422].includes(status)) {
          throw new InvalidPasswordError({ cause: result.error });
        }
        throw new AuthenticationServiceError({ cause: result.error });
      }
      const data = asRecord(result.data);
      const user = asRecord(data?.user);
      const session = asRecord(data?.session);
      const userId = requiredIdentityId(user);
      const accessToken = typeof session?.access_token === "string"
        ? session.access_token.trim()
        : "";
      // Se houver token, ele precisa chegar ao orquestrador mesmo quando a
      // resposta do Auth estiver inconsistente. Assim a sessão secundária é
      // revogada antes da falha fechada por UID ausente/divergente.
      if (!accessToken) throw new AuthenticationServiceError();
      return { userId, accessToken };
    },

    revokeSecondarySession: async (accessToken) => {
      try {
        const { error } = await admin.auth.admin.signOut(accessToken, "local");
        if (error) throw error;
      } catch (cause) {
        throw new AuthenticationServiceError({ cause });
      }
    },

    registerReauthentication: async (
      input: RegisterReauthenticationInput,
    ) =>
      normalizeTicket(
        await callRpc(admin, REGISTER_REAUTHENTICATION_RPC, {
          p_envelope_id: input.envelopeId,
          p_participante_id: input.participantId,
          p_perfil: input.profile,
          p_context_id: input.contextId,
          p_actor_auth_user_id: input.userId,
          p_auth_session_id: input.sessionId,
          p_reautenticado_em: input.reauthenticatedAt,
          p_evidencia: input.evidence,
          p_request_id: input.requestId,
          p_attempt_id: input.attemptId,
        }),
      ),

    confirmSignature: async (input: ConfirmSignatureInput) =>
      normalizeConfirmation(
        await callRpc(admin, CONFIRM_SIGNATURE_RPC, {
          p_ticket: input.ticket,
          p_request_id: input.requestId,
          p_actor_auth_user_id: input.userId,
          p_auth_session_id: input.sessionId,
        }),
      ),
  };
};
