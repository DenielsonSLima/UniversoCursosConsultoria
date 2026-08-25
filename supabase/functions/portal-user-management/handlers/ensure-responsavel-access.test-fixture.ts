import { INVITE_RECONCILIATION_PROOF_RPC } from "./ensure-responsavel-access.ts";
import type { HandlerContext } from "../types.ts";

export const RESPONSAVEL_ID = "11111111-1111-4111-8111-111111111111";
export const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ACTOR_ID = "66666666-6666-4666-8666-666666666666";
export const AUTH_ID = "33333333-3333-4333-8333-333333333333";
export const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
export const OTHER_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
export const EMAIL = "responsavel@example.com";
export const CPF = "52998224725";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

type FixtureOptions = {
  actorAuthUserId?: string;
  prepared?: Record<string, unknown>;
  prepareError?: { code?: string; message: string } | null;
  bindingError?: { code?: string; message: string } | null;
  authUsers?: Array<Record<string, unknown>>;
  authUserById?: Record<string, unknown> | null;
  partners?: Array<Record<string, unknown>>;
  gestores?: Array<Record<string, unknown>>;
  responsaveis?: Array<Record<string, unknown>>;
  invitedAuthUser?: Record<string, unknown> | null;
  proofError?: { code?: string; message: string } | null;
  proofValue?: unknown;
};

type FixtureQueryResult = {
  data: Array<Record<string, unknown>>;
  error: null;
};

type FixtureQuery = {
  eq: () => FixtureQuery;
  limit: () => FixtureQueryResult;
};

const deterministicProof = async (args: Record<string, unknown>) => {
  const canonical = [
    "v1",
    String(args.p_original_actor_auth_user_id || ""),
    String(args.p_request_id || ""),
    String(args.p_responsavel_legal_id || ""),
    String(args.p_email || "").trim().toLowerCase(),
  ].join("\n");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const makeFixture = (options: FixtureOptions = {}) => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const invitePayloads: Array<Record<string, unknown>> = [];
  let authListCalls = 0;

  const prepared = options.prepared || {
    responsavelLegalId: RESPONSAVEL_ID,
    nome: "Responsável Teste",
    cpf: CPF,
    email: EMAIL,
    status: "ATIVO",
    authUserId: null,
    eligible: true,
    accessBlockReason: null,
  };

  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "responsavel_legal_acesso_preparar") {
        return options.prepareError
          ? { data: null, error: options.prepareError }
          : { data: prepared, error: null };
      }
      if (name === "responsavel_legal_acesso_vincular") {
        return options.bindingError
          ? { data: null, error: options.bindingError }
          : { data: { responsavelLegalId: RESPONSAVEL_ID }, error: null };
      }
      if (name === INVITE_RECONCILIATION_PROOF_RPC) {
        if (options.proofError) {
          return { data: null, error: options.proofError };
        }
        if (Object.hasOwn(options, "proofValue")) {
          return { data: options.proofValue, error: null };
        }
        return { data: await deterministicProof(args), error: null };
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    from: (table: string) => ({
      select: () => {
        const query: FixtureQuery = {
          eq: () => query,
          limit: () => ({
            data: table === "parceiros"
              ? options.partners || []
              : table === "usuarios_sistema"
              ? options.gestores || []
              : options.responsaveis || [],
            error: null,
          }),
        };
        return query;
      },
    }),
    auth: {
      admin: {
        listUsers: () => {
          authListCalls += 1;
          return { data: { users: options.authUsers || [] }, error: null };
        },
        getUserById: () => ({
          data: {
            user: options.authUserById === undefined
              ? { id: AUTH_ID, email: EMAIL }
              : options.authUserById,
          },
          error: null,
        }),
        inviteUserByEmail: (
          email: string,
          inviteOptions: Record<string, unknown>,
        ) => {
          const inviteData = inviteOptions.data as Record<string, unknown>;
          invitePayloads.push({ email, ...inviteOptions });
          return {
            data: {
              user: options.invitedAuthUser === undefined
                ? {
                  id: AUTH_ID,
                  email,
                  user_metadata: inviteData,
                }
                : options.invitedAuthUser,
            },
            error: null,
          };
        },
      },
    },
  };

  const context: HandlerContext = {
    admin,
    gestor: { auth_user_id: options.actorAuthUserId || ACTOR_ID },
    gestorEmail: "gestor@example.com",
    json: responder,
  };

  return {
    context,
    rpcCalls,
    invitePayloads,
    authListCalls: () => authListCalls,
  };
};
