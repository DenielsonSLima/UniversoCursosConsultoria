import { TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY } from "./issue-student-temporary-password.ts";
import type { HandlerContext, Partner } from "../types.ts";

export const GESTOR_AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";

export const partner: Partner = {
  id: "partner-1",
  tipo: "Aluno",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  auth_user_id: "auth-1",
  acesso_status: "convite_enviado",
  troca_senha_obrigatoria: true,
};

export const makeFixture = (options: {
  authUser?: any;
  auditFailureAt?: number | null;
  identityConflict?: string | null;
  reservation?: boolean;
  reservationError?: { code?: string; message: string };
  completion?: boolean;
  cleanup?: boolean;
  markerUpdateError?: string | null;
  markerUpdateThrows?: boolean;
  updateError?: string | null;
  updateThrows?: boolean;
  omitStagedNonce?: boolean;
  verification?: { verified: boolean; sessionClosed: boolean };
  verificationThrows?: boolean;
  verifierAvailable?: boolean;
} = {}) => {
  const authUser = options.authUser ?? {
    id: "auth-1",
    email: "aluno@example.com",
    email_confirmed_at: "2026-08-21T12:00:00.000Z",
    app_metadata: { provider: "email", roles: ["authenticated"] },
    user_metadata: { partner_id: "partner-1" },
  };
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const verificationCalls: Array<{
    email: string;
    password: string;
    authUserId: string;
  }> = [];
  const events: string[] = [];
  let auditCount = 0;
  const admin = {
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: authUser }, error: null }),
        updateUserById: async (
          id: string,
          payload: Record<string, unknown>,
        ) => {
          const issueMarker = (payload.app_metadata as Record<string, unknown>)
            ?.universocc_temporary_password_issue_id;
          const isMarkerSetup = typeof issueMarker === "string";
          const isPasswordUpdate = typeof payload.password === "string";
          if (
            (isMarkerSetup && options.markerUpdateThrows) ||
            (isPasswordUpdate && options.updateThrows)
          ) {
            throw new Error("falha de transporte");
          }
          updates.push({ id, payload });
          const updateError = isMarkerSetup
            ? options.markerUpdateError
            : isPasswordUpdate
            ? options.updateError
            : null;
          if (!updateError && payload.app_metadata) {
            authUser.app_metadata = {
              ...(authUser.app_metadata || {}),
              ...(payload.app_metadata as Record<string, unknown>),
            };
            if (isMarkerSetup && options.omitStagedNonce) {
              delete authUser.app_metadata[
                TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY
              ];
            }
          }
          events.push(
            isMarkerSetup
              ? "stage-metadata"
              : isPasswordUpdate
              ? "update-password"
              : "cleanup-metadata",
          );
          return {
            data: { user: authUser },
            error: updateError ? { message: updateError } : null,
          };
        },
      },
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      events.push(`rpc:${name}`);
      if (name === "portal_identidade_termos_versao_vigente") {
        return { data: "2026-08-05", error: null };
      }
      if (name === "portal_reservar_emissao_senha_temporaria") {
        return {
          data: options.reservation ?? true,
          error: options.reservationError || null,
        };
      }
      if (name === "portal_concluir_emissao_senha_temporaria") {
        return { data: options.completion ?? true, error: null };
      }
      if (name === "portal_cancelar_emissao_senha_temporaria") {
        return { data: true, error: null };
      }
      if (name === "portal_confirmar_limpeza_emissao_senha_temporaria") {
        return { data: options.cleanup ?? true, error: null };
      }
      return { data: null, error: { message: `RPC inesperada: ${name}` } };
    },
    from: (table: string) => {
      if (table === "sistema_eventos") {
        return {
          insert: async (row: Record<string, unknown>) => {
            auditCount += 1;
            audits.push(row);
            return {
              error: options.auditFailureAt === auditCount
                ? { message: "indisponível" }
                : null,
            };
          },
        };
      }
      const query: any = {
        eq: () => query,
        neq: () => query,
        limit: async () => ({
          data: options.identityConflict && table === "parceiros"
            ? [{ id: "partner-other" }]
            : [],
          error: null,
        }),
      };
      return { select: () => query };
    },
  };
  const context: HandlerContext = {
    admin,
    gestor: {
      id: "gestor-1",
      nome: "Gestor de teste",
      auth_user_id: GESTOR_AUTH_USER_ID,
    },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
    ...(options.verifierAvailable === false ? {} : {
      verifyTemporaryPassword: async (
        email: string,
        password: string,
        authUserId: string,
      ) => {
        events.push("verify-password");
        verificationCalls.push({ email, password, authUserId });
        if (options.verificationThrows) {
          throw new Error("verificação interrompida");
        }
        return options.verification || {
          verified: true,
          sessionClosed: true,
        };
      },
    }),
  };
  return { context, updates, audits, rpcCalls, verificationCalls, events };
};
