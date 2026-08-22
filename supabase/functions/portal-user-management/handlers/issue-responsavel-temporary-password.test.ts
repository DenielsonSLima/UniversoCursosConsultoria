import assert from "node:assert/strict";
import {
  handleIssueResponsavelTemporaryPassword,
  RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY,
  RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY,
} from "./issue-responsavel-temporary-password.ts";
import type { HandlerContext } from "../types.ts";

const RESPONSAVEL_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "responsavel@example.com";

const basePrepared = {
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

const makeFixture = (options: {
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

Deno.test("emite senha CSPRNG com marcador exclusivo e sem auditar segredo", async () => {
  const fixture = makeFixture();
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.action, "issue-responsavel-temporary-password");
  assert.equal(/[A-Z]/.test(body.temporaryPassword), true);
  assert.equal(/[a-z]/.test(body.temporaryPassword), true);
  assert.equal(/\d/.test(body.temporaryPassword), true);
  assert.equal(/[!@#$%*_-]/.test(body.temporaryPassword), true);
  assert.ok(body.temporaryPassword.length >= 16);
  assert.equal(fixture.updates.length, 3);

  const markerMetadata = fixture.updates[0].payload
    .app_metadata as Record<string, unknown>;
  const issueId = fixture.rpcCalls[1].args.p_emissao_id;
  assert.equal(
    typeof markerMetadata[RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY],
    "string",
  );
  assert.equal(
    markerMetadata.universocc_temporary_password_issue_id,
    "99999999-9999-4999-8999-999999999999",
  );
  assert.equal(fixture.updates[1].payload.email_confirm, true);
  assert.equal(fixture.updates[1].payload.password, body.temporaryPassword);
  assert.equal(fixture.updates[1].payload.app_metadata, undefined);
  assert.equal(
    markerMetadata[
      RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY
    ],
    issueId,
  );
  assert.equal(
    (fixture.updates[2].payload.app_metadata as Record<string, unknown>)[
      RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY
    ],
    null,
  );
  assert.equal(
    (fixture.updates[2].payload.app_metadata as Record<string, unknown>)[
      RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY
    ],
    null,
  );
  assert.equal(
    JSON.stringify(fixture.audits).includes(body.temporaryPassword),
    false,
  );
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "responsavel_legal_acesso_preparar",
      "portal_reservar_emissao_senha_temporaria_responsavel",
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ],
  );
  assert.equal(fixture.rpcCalls[1].args.p_actor_auth_user_id, ACTOR_ID);
  assert.equal(fixture.rpcCalls[2].args.p_emissao_id, issueId);
  assert.equal(
    markerMetadata[RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY],
    issueId,
  );
  assert.deepEqual(fixture.verificationCalls, [{
    email: EMAIL,
    password: body.temporaryPassword,
    authUserId: AUTH_ID,
  }]);
  assert.ok(
    fixture.events.indexOf("stage-metadata") <
      fixture.events.indexOf("update-password"),
  );
  assert.ok(
    fixture.events.indexOf("update-password") <
      fixture.events.indexOf("verify-password"),
  );
  assert.ok(
    fixture.events.indexOf("verify-password") <
      fixture.events.indexOf(
        "rpc:portal_concluir_emissao_senha_temporaria_responsavel",
      ),
  );
});

Deno.test("recusa senha sem confirmação no Auth ou validação administrativa", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, emailValidatedByManager: false },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("aceita e-mail já confirmado no Auth sem validação administrativa", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, emailValidatedByManager: false },
    authUser: {
      id: AUTH_ID,
      email: EMAIL,
      email_confirmed_at: "2026-08-21T12:00:00.000Z",
      app_metadata: {},
    },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.updates[1].payload.email_confirm, true);
});

Deno.test("não trata confirmed_at como confirmação de e-mail do responsável", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, emailValidatedByManager: false },
    authUser: {
      id: AUTH_ID,
      email: EMAIL,
      confirmed_at: "2026-08-21T12:00:00.000Z",
      app_metadata: {},
    },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
});

Deno.test("recusa senha temporária quando a preparação não autoriza a identidade", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, temporaryPasswordAllowed: false },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, "RESPONSAVEL_SENHA_TEMPORARIA_NAO_PERMITIDA");
  assert.equal(fixture.updates.length, 0);
  assert.doesNotMatch(JSON.stringify(body), /PORTAL_EMISSAO/i);
});

Deno.test("mapeia bloqueio multiperfil da reserva sem vazar erro interno", async () => {
  const fixture = makeFixture({
    reservationError: {
      code: "55000",
      message:
        "PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_IDENTIDADE_MULTIPERFIL detalhe interno",
    },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, "RESPONSAVEL_SENHA_TEMPORARIA_NAO_PERMITIDA");
  assert.doesNotMatch(JSON.stringify(body), /PORTAL_EMISSAO|detalhe interno/i);
});

Deno.test("não toca no Auth quando auditoria obrigatória falha", async () => {
  const fixture = makeFixture({ auditFailureAt: 1 });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 0);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    ["responsavel_legal_acesso_preparar"],
  );
});

Deno.test("cancela emissão quando o marcador Auth não é confirmado", async () => {
  const fixture = makeFixture({ markerUpdateError: true });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(
    fixture.updates.some((update) =>
      typeof update.payload.password === "string"
    ),
    false,
  );
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "responsavel_legal_acesso_preparar",
      "portal_reservar_emissao_senha_temporaria_responsavel",
      "portal_cancelar_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ],
  );
});

Deno.test("não troca a senha quando o nonce do responsável não é confirmado", async () => {
  const fixture = makeFixture({ omitStagedNonce: true });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(
    fixture.updates.some((update) =>
      typeof update.payload.password === "string"
    ),
    false,
  );
  assert.equal(fixture.verificationCalls.length, 0);
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name ===
        "portal_cancelar_emissao_senha_temporaria_responsavel"
    ),
    true,
  );
});

Deno.test("conclui e limpa sem entregar quando login do responsável falha", async () => {
  const fixture = makeFixture({
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.verificationCalls.length, 1);
  assert.deepEqual(
    fixture.rpcCalls.slice(-2).map((call) => call.name),
    [
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ],
  );
  const cleanupMetadata = fixture.updates.at(-1)?.payload
    .app_metadata as Record<string, unknown>;
  assert.equal(
    cleanupMetadata[RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY],
    null,
  );
  assert.equal(
    cleanupMetadata[RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY],
    null,
  );
});

Deno.test("não entrega senha se a sessão do responsável não encerrar", async () => {
  const fixture = makeFixture({
    verification: { verified: true, sessionClosed: false },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name ===
        "portal_cancelar_emissao_senha_temporaria_responsavel"
    ),
    false,
  );
  assert.equal(
    fixture.rpcCalls.at(-2)?.name,
    "portal_concluir_emissao_senha_temporaria_responsavel",
  );
});

Deno.test("cancela rejeição conhecida cuja senha do responsável não autentica", async () => {
  const fixture = makeFixture({
    passwordUpdateError: true,
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.deepEqual(
    fixture.rpcCalls.slice(-2).map((call) => call.name),
    [
      "portal_cancelar_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ],
  );
});

Deno.test("preserva reserva do responsável após transporte ambíguo não observado", async () => {
  const fixture = makeFixture({
    passwordUpdateThrows: true,
    completion: false,
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.match(body.error, /permanece ambíguo|preservados/i);
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name ===
        "portal_cancelar_emissao_senha_temporaria_responsavel"
    ),
    false,
  );
  assert.equal(
    fixture.rpcCalls.at(-1)?.name,
    "portal_concluir_emissao_senha_temporaria_responsavel",
  );
});

Deno.test("reconcilia escrita ambígua do responsável sem entregar senha", async () => {
  const fixture = makeFixture({
    passwordUpdateThrows: true,
    completion: true,
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.match(body.error, /encerrada com segurança/i);
  assert.deepEqual(
    fixture.rpcCalls.slice(-2).map((call) => call.name),
    [
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ],
  );
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name ===
        "portal_cancelar_emissao_senha_temporaria_responsavel"
    ),
    false,
  );
});

Deno.test("não inicia emissão do responsável sem verificador efêmero", async () => {
  const fixture = makeFixture({ verifierAvailable: false });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );

  assert.equal(response.status, 500);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    ["responsavel_legal_acesso_preparar"],
  );
  assert.equal(fixture.updates.length, 0);
});

Deno.test("não entrega segredo sem conclusão canônica da emissão", async () => {
  const fixture = makeFixture({ completion: false });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 2);
});

Deno.test("reconcilia emissão pendente antes de criar uma nova", async () => {
  const pendingIssueId = "55555555-5555-4555-8555-555555555555";
  const fixture = makeFixture({
    prepared: {
      ...basePrepared,
      temporaryPasswordPending: true,
      temporaryPasswordIssueId: pendingIssueId,
      temporaryPasswordIssueStartedAt: "2026-08-21T12:00:00.000Z",
    },
    authUser: {
      id: AUTH_ID,
      email: EMAIL,
      app_metadata: {
        [RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY]: pendingIssueId,
        [RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]:
          pendingIssueId,
      },
    },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.audits.length, 2);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "responsavel_legal_acesso_preparar",
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
      "portal_reservar_emissao_senha_temporaria_responsavel",
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ],
  );
});

Deno.test("não reabre primeiro acesso já concluído", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, firstAccessPending: false },
  });
  const response = await handleIssueResponsavelTemporaryPassword(
    fixture.context,
    RESPONSAVEL_ID,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
});
