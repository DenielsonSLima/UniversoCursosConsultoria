import assert from "node:assert/strict";
import {
  RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY,
  RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY,
} from "./issue-responsavel-temporary-password.ts";
import type { HandlerContext } from "../types.ts";

export const RESPONSAVEL_ID = "11111111-1111-4111-8111-111111111111";
export const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
export const AUTH_ID = "33333333-3333-4333-8333-333333333333";
export const EMAIL = "responsavel@example.com";

export const basePrepared = {
  responsavelLegalId: RESPONSAVEL_ID,
  nome: "Responsável Teste",
  cpf: "52998224725",
  email: EMAIL,
  status: "ATIVO",
  authUserId: AUTH_ID,
  eligible: true,
  accessBlockReason: null,
  emailValidatedByManager: true,
  temporaryPasswordPending: false,
  temporaryPasswordAllowed: true,
  temporaryPasswordIssueId: null,
  temporaryPasswordIssueStartedAt: null,
  temporaryPasswordRevokedIssueIds: [],
  requiresPasswordChange: true,
  termsAccepted: false,
  currentTermsVersion: "2026-08-21",
  firstAccessPending: true,
};

export const makeFixture = (options: {
  prepared?: Record<string, unknown>;
  authUser?: Record<string, any>;
  auditFailureAt?: number;
  reservation?: boolean;
  completion?: boolean;
  cleanup?: boolean;
  markerUpdateError?: boolean;
  passwordUpdateError?: boolean;
  passwordUpdateThrows?: boolean;
  reservationError?: { code?: string; message: string };
  omitStagedNonce?: boolean;
  verification?: { verified: boolean; sessionClosed: boolean };
  verificationThrows?: boolean;
  verifierAvailable?: boolean;
} = {}) => {
  const authUser = options.authUser || {
    id: AUTH_ID,
    email: EMAIL,
    app_metadata: {
      provider: "email",
      universocc_temporary_password_issue_id:
        "99999999-9999-4999-8999-999999999999",
    },
  };
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const verificationCalls: Array<{
    email: string;
    password: string;
    authUserId: string;
  }> = [];
  const events: string[] = [];
  let auditCount = 0;
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      events.push(`rpc:${name}`);
      if (name === "responsavel_legal_acesso_preparar") {
        return { data: options.prepared || basePrepared, error: null };
      }
      if (name === "portal_reservar_emissao_senha_temporaria_responsavel") {
        return {
          data: options.reservation ?? true,
          error: options.reservationError || null,
        };
      }
      if (name === "portal_concluir_emissao_senha_temporaria_responsavel") {
        return { data: options.completion ?? true, error: null };
      }
      if (name === "portal_cancelar_emissao_senha_temporaria_responsavel") {
        return { data: true, error: null };
      }
      if (
        name ===
          "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel"
      ) {
        return { data: options.cleanup ?? true, error: null };
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: authUser }, error: null }),
        updateUserById: async (
          id: string,
          payload: Record<string, unknown>,
        ) => {
          updates.push({ id, payload });
          const markerValue = (payload.app_metadata as Record<string, unknown>)
            ?.[RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY];
          const isMarkerSetup = typeof markerValue === "string";
          const isPasswordUpdate = typeof payload.password === "string";
          if (isPasswordUpdate && options.passwordUpdateThrows) {
            throw new Error("transporte interrompido");
          }
          if (
            (isMarkerSetup && options.markerUpdateError) ||
            (isPasswordUpdate && options.passwordUpdateError)
          ) {
            return { data: { user: authUser }, error: { message: "recusado" } };
          }
          if (payload.app_metadata) {
            authUser.app_metadata = {
              ...(authUser.app_metadata || {}),
              ...(payload.app_metadata as Record<string, unknown>),
            };
            if (isMarkerSetup && options.omitStagedNonce) {
              delete authUser.app_metadata[
                RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY
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
          return { data: { user: authUser }, error: null };
        },
      },
    },
    from: (table: string) => {
      assert.equal(table, "sistema_eventos");
      return {
        insert: async (row: Record<string, unknown>) => {
          auditCount += 1;
          audits.push(row);
          return {
            error: options.auditFailureAt === auditCount
              ? { message: "auditoria indisponível" }
              : null,
          };
        },
      };
    },
  };
  const context: HandlerContext = {
    admin,
    gestor: { id: "gestor-1", nome: "Gestor", auth_user_id: ACTOR_ID },
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
  return {
    context,
    rpcCalls,
    updates,
    audits,
    verificationCalls,
    events,
  };
};
