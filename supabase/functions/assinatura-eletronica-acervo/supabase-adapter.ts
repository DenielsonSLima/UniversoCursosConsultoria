// deno-lint-ignore no-import-prefix -- Edge resolve dependências npm por specifier explícito.
import { createClient } from "npm:@supabase/supabase-js@2.106.1";
import {
  type ArchiveDependencies,
  ArchiveHttpError,
  type AuthenticatedArchiveIdentity,
  type CreateDownloadUrlRequest,
  normalizeResolvedArtifact,
} from "./acervo.ts";

export const RESOLVE_ARCHIVE_ARTIFACT_RPC =
  "assinatura_eletronica_internal_resolver_acervo";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcResult = { data: unknown; error: unknown };

type AuthFacade = {
  getClaims: (
    bearer: string,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  getUser: (
    bearer: string,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type RpcFacade = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};

type AdminClient = RpcFacade & {
  auth: AuthFacade;
  storage: {
    from: (bucketId: string) => {
      createSignedUrl: (
        storagePath: string,
        expiresIn: number,
        options: { download: string },
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

type ClientFactory = (
  supabaseUrl: string,
  apiKey: string,
  options: Record<string, unknown>,
) => AdminClient;

export type ArchiveRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const sessionInvalid = (options: { cause?: unknown } = {}) =>
  new ArchiveHttpError(
    401,
    "SESSION_INVALID",
    "Sua sessão não é mais válida. Entre novamente.",
    options,
  );

const secureConfigurationUnavailable = (options: { cause?: unknown } = {}) =>
  new ArchiveHttpError(
    503,
    "SECURE_CONFIGURATION_UNAVAILABLE",
    "O acesso seguro ao documento está temporariamente indisponível.",
    options,
  );

const requiredIdentityId = (value: unknown) => {
  const user = asRecord(value);
  const id = typeof user?.id === "string" ? user.id.trim().toLowerCase() : "";
  return UUID_PATTERN.test(id) ? id : "";
};

export const authenticateArchiveBearer = async (
  admin: Pick<AdminClient, "auth">,
  bearer: string,
): Promise<AuthenticatedArchiveIdentity> => {
  let claimsResult: { data: unknown; error: unknown };
  let userResult: { data: unknown; error: unknown };
  try {
    claimsResult = await admin.auth.getClaims(bearer);
    userResult = await admin.auth.getUser(bearer);
  } catch (cause) {
    throw sessionInvalid({ cause });
  }

  const claims = asRecord(asRecord(claimsResult.data)?.claims);
  const userId = typeof claims?.sub === "string"
    ? claims.sub.trim().toLowerCase()
    : "";
  const sessionId = typeof claims?.session_id === "string"
    ? claims.session_id.trim().toLowerCase()
    : "";
  const role = typeof claims?.role === "string"
    ? claims.role.trim().toLowerCase()
    : "";
  const user = asRecord(asRecord(userResult.data)?.user);
  if (
    claimsResult.error || userResult.error || !UUID_PATTERN.test(userId) ||
    !UUID_PATTERN.test(sessionId) || role !== "authenticated" ||
    claims?.is_anonymous === true || user?.is_anonymous === true ||
    requiredIdentityId(user) !== userId
  ) throw sessionInvalid();

  return { userId, sessionId };
};

const callRpc = async (
  client: RpcFacade,
  functionName: string,
  args: Record<string, unknown>,
) => {
  const { data, error } = await client.rpc(functionName, args);
  if (error) throw error;
  return data;
};

export const createSupabaseArchiveDependencies = (
  config: ArchiveRuntimeConfig,
  factory: ClientFactory = createClient as unknown as ClientFactory,
): ArchiveDependencies => {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw secureConfigurationUnavailable();
  }

  const admin = factory(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as AdminClient;

  return {
    authenticate: (bearer) => authenticateArchiveBearer(admin, bearer),

    resolveAuthorizedArtifact: async (
      identity: AuthenticatedArchiveIdentity,
      input: CreateDownloadUrlRequest,
    ) =>
      normalizeResolvedArtifact(
        await callRpc(admin, RESOLVE_ARCHIVE_ARTIFACT_RPC, {
          p_envelope_id: input.envelopeId,
          p_classe: input.artifactClass,
          p_perfil: input.profile,
          p_context_id: input.contextId,
          p_actor_auth_user_id: identity.userId,
          p_auth_session_id: identity.sessionId,
          p_request_id: input.requestId,
        }),
      ),

    createSignedDownload: async ({
      bucketId,
      storagePath,
      fileName,
      expiresIn,
    }) => {
      const { data, error } = await admin.storage.from(bucketId)
        .createSignedUrl(storagePath, expiresIn, { download: fileName });
      if (error) throw error;
      const signedUrl = asRecord(data)?.signedUrl;
      if (typeof signedUrl !== "string" || !signedUrl.trim()) {
        throw secureConfigurationUnavailable();
      }
      return signedUrl;
    },
  };
};
