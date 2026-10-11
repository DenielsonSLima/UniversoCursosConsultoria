import type { HandlerContext, Partner } from "../types.ts";
import { STUDENT_INVITE_CAS_RPC } from "./student-invite-state.ts";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

export const basePartner: Partner = {
  id: "22222222-2222-4222-8222-222222222222",
  tipo: "Aluno",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  cpf_cnpj: "52998224725",
};

type AdminFixtureOptions = {
  rpcUnavailable?: boolean;
  inviteError?: string;
  authUsersAfterInvite?: any[];
  bindingResult?: Record<string, unknown> | null;
  currentPartner?: Record<string, unknown> | null;
};

export const makeAdmin = (
  authUsers: any[] = [],
  identityConflicts: {
    parceiros?: any[];
    usuarios_sistema?: any[];
    responsaveis_legais?: any[];
  } = {},
  invitedAuthUser?: Record<string, unknown> | null,
  fixtureOptions: AdminFixtureOptions = {},
) => {
  const updates: Array<Record<string, unknown>> = [];
  const inviteRedirects: string[] = [];
  const inviteMetadata: Array<Record<string, unknown> | undefined> = [];
  let inviteCalls = 0;
  let createCalls = 0;
  let generateLinkCalls = 0;
  let listUsersCalls = 0;
  const admin = {
    rpc: async (name: string, args: Record<string, any>) => {
      if (name === STUDENT_INVITE_CAS_RPC) {
        const patch = args.p_patch;
        if (!Object.keys(patch).length) {
          return {
            data: { id: args.p_partner_id, ...args.p_expected_snapshot },
            error: null,
          };
        }
        updates.push(patch);
        if (fixtureOptions.bindingResult === null && "auth_user_id" in patch) {
          return {
            data: null,
            error: { code: "40001", message: "CAS recusado" },
          };
        }
        return {
          data: {
            id: args.p_partner_id,
            ...args.p_expected_snapshot,
            ...patch,
          },
          error: null,
        };
      }
      return name === "portal_identidade_listar_responsaveis_vinculados"
        ? { data: identityConflicts.responsaveis_legais || [], error: null }
        : fixtureOptions.rpcUnavailable
        ? { data: null, error: { message: "detalhe interno" } }
        : { data: "a".repeat(64), error: null };
    },
    from: (
      table: "parceiros" | "usuarios_sistema" | "responsaveis_legais",
    ) => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        const query: any = {
          eq: () => query,
          is: () => query,
          select: () => query,
          maybeSingle: async () => ({
            data: fixtureOptions.bindingResult === undefined ||
                !("auth_user_id" in patch)
              ? { id: basePartner.id, ...patch }
              : fixtureOptions.bindingResult,
            error: null,
          }),
        };
        return query;
      },
      select: () => {
        const query: any = {
          eq: () => query,
          neq: () => query,
          limit: async () => ({
            data: identityConflicts[table] || [],
            error: null,
          }),
          maybeSingle: async () => ({
            data: fixtureOptions.currentPartner || null,
            error: null,
          }),
        };
        return query;
      },
    }),
    auth: {
      admin: {
        listUsers: async () => {
          listUsersCalls += 1;
          return {
            data: {
              users: listUsersCalls > 1 && fixtureOptions.authUsersAfterInvite
                ? fixtureOptions.authUsersAfterInvite
                : authUsers,
            },
            error: null,
          };
        },
        getUserById: async (id: string) => ({
          data: { user: authUsers.find((user) => user.id === id) || null },
          error: null,
        }),
        inviteUserByEmail: async (
          _email: string,
          options: { redirectTo?: string; data?: Record<string, unknown> },
        ) => {
          inviteCalls += 1;
          if (options.redirectTo) inviteRedirects.push(options.redirectTo);
          inviteMetadata.push(options.data);
          if (fixtureOptions.inviteError) {
            return {
              data: { user: null },
              error: { message: fixtureOptions.inviteError },
            };
          }
          return {
            data: {
              user: invitedAuthUser === undefined
                ? {
                  id: "auth-1",
                  email: "aluno@example.com",
                  user_metadata: options.data,
                }
                : invitedAuthUser,
            },
            error: null,
          };
        },
        createUser: async () => {
          createCalls += 1;
          return { data: { user: null }, error: new Error("unexpected") };
        },
        generateLink: async () => {
          generateLinkCalls += 1;
          return {
            data: {
              user: { id: authUsers[0]?.id || "auth-1" },
              properties: { action_link: "https://example.test/link" },
            },
            error: null,
          };
        },
      },
    },
  };

  return {
    admin,
    updates,
    inviteRedirects,
    inviteMetadata,
    counts: () => ({ inviteCalls, createCalls, generateLinkCalls }),
  };
};

export const contextFor = (admin: any): HandlerContext => ({
  admin,
  gestor: {
    id: "gestor-1",
    auth_user_id: "11111111-1111-4111-8111-111111111111",
  },
  gestorEmail: "gestor@example.com",
  json: responder,
});

export const options = {
  redirectTo: "https://universocc.com.br/login",
  supabaseUrl: "https://project.supabase.co",
  publicApiKey: { apiKey: "anon-key", message: null },
};
