import assert from "node:assert/strict";
import {
  generateStudentTemporaryPassword,
  handleIssueStudentTemporaryPassword,
  TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY,
} from "./issue-student-temporary-password.ts";
import type { HandlerContext, Partner } from "../types.ts";

const GESTOR_AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";

const partner: Partner = {
  id: "partner-1",
  tipo: "Aluno",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  auth_user_id: "auth-1",
  acesso_status: "convite_enviado",
  troca_senha_obrigatoria: true,
};

const makeFixture = (options: {
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

Deno.test("gera senha forte e conclui a reserva persistida sem auditar o segredo", async () => {
  const fixture = makeFixture();
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(typeof body.temporaryPassword, "string");
  assert.equal(/[A-Z]/.test(body.temporaryPassword), true);
  assert.equal(/[a-z]/.test(body.temporaryPassword), true);
  assert.equal(/\d/.test(body.temporaryPassword), true);
  assert.equal(/[!@#$%*_-]/.test(body.temporaryPassword), true);
  assert.ok(body.temporaryPassword.length >= 16);
  assert.equal(fixture.updates.length, 3);
  const markerUpdate = fixture.updates[0].payload;
  const update = fixture.updates[1].payload;
  const reservation = fixture.rpcCalls[1].args || {};
  assert.equal(update.email_confirm, true);
  assert.equal(update.password, body.temporaryPassword);
  assert.equal(update.app_metadata, undefined);
  assert.equal(
    (markerUpdate.app_metadata as Record<string, unknown>).provider,
    "email",
  );
  assert.equal(fixture.audits.length, 1);
  assert.equal(
    JSON.stringify(fixture.audits).includes(body.temporaryPassword),
    false,
  );
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_reservar_emissao_senha_temporaria",
      "portal_concluir_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
  assert.equal(reservation.p_partner_id, "partner-1");
  assert.equal(reservation.p_actor_auth_user_id, GESTOR_AUTH_USER_ID);
  assert.equal(typeof reservation.p_emissao_id, "string");
  assert.equal(
    fixture.rpcCalls[2].args?.p_emissao_id,
    reservation.p_emissao_id,
  );
  assert.equal(
    (markerUpdate.app_metadata as Record<string, unknown>)
      .universocc_temporary_password_issue_id,
    reservation.p_emissao_id,
  );
  assert.equal(
    (markerUpdate.app_metadata as Record<string, unknown>)[
      TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY
    ],
    reservation.p_emissao_id,
  );
  assert.deepEqual(fixture.verificationCalls, [{
    email: "aluno@example.com",
    password: body.temporaryPassword,
    authUserId: "auth-1",
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
        "rpc:portal_concluir_emissao_senha_temporaria",
      ),
  );
  assert.equal(
    (fixture.updates[2].payload.app_metadata as Record<string, unknown>)
      .universocc_temporary_password_issue_id,
    null,
  );
  assert.equal(
    (fixture.updates[2].payload.app_metadata as Record<string, unknown>)[
      TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY
    ],
    null,
  );
});

Deno.test("aceita validação administrativa quando o Auth ainda não confirmou o e-mail", async () => {
  const fixture = makeFixture({
    authUser: {
      id: "auth-1",
      email: "aluno@example.com",
      app_metadata: {},
      user_metadata: { partner_id: "partner-1" },
    },
  });

  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    {
      ...partner,
      email_validado_gestor_em: "2026-08-21T12:00:00.000Z",
    },
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.updates.length, 3);
  assert.equal(fixture.updates[1].payload.email_confirm, true);
});

Deno.test("não trata confirmed_at como confirmação de e-mail do aluno", async () => {
  const fixture = makeFixture({
    authUser: {
      id: "auth-1",
      email: "aluno@example.com",
      confirmed_at: "2026-08-21T12:00:00.000Z",
      app_metadata: {},
      user_metadata: { partner_id: "partner-1" },
    },
  });

  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
});

Deno.test("recusa senha temporária sem e-mail confirmado ou validado pelo gestor", async () => {
  const fixture = makeFixture({
    authUser: {
      id: "auth-1",
      email: "aluno@example.com",
      app_metadata: {},
      user_metadata: { partner_id: "partner-1" },
    },
  });

  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("recusa rebaixar acesso concluído somente depois dos termos vigentes", async () => {
  const fixture = makeFixture();
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    {
      ...partner,
      acesso_status: "ativo",
      troca_senha_obrigatoria: false,
      aceitou_termos_uso: true,
      termos_uso_versao: "2026-08-05",
    },
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
});

Deno.test("permite assistência quando a senha mudou mas os termos ainda não foram aceitos", async () => {
  const fixture = makeFixture();
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    {
      ...partner,
      acesso_status: "ativo",
      troca_senha_obrigatoria: false,
      aceitou_termos_uso: false,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.updates.length, 3);
});

Deno.test("recusa identidade vinculada a outro parceiro", async () => {
  const fixture = makeFixture({ identityConflict: "partner-other" });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("não toca no Auth quando a auditoria prévia obrigatória falha", async () => {
  const fixture = makeFixture({ auditFailureAt: 1 });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 0);
});

Deno.test("não troca a senha antes de confirmar o marcador técnico da emissão", async () => {
  const fixture = makeFixture({ markerUpdateError: "marcador recusado" });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 1);
  assert.equal(
    fixture.updates.some((update) =>
      typeof update.payload.password === "string"
    ),
    false,
  );
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_reservar_emissao_senha_temporaria",
      "portal_cancelar_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
});

Deno.test("não troca a senha quando o nonce stageado não é confirmado", async () => {
  const fixture = makeFixture({ omitStagedNonce: true });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
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
      call.name === "portal_cancelar_emissao_senha_temporaria"
    ),
    true,
  );
});

Deno.test("conclui e limpa sem entregar quando resposta confirmou mas login falhou", async () => {
  const fixture = makeFixture({
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.verificationCalls.length, 1);
  assert.deepEqual(
    fixture.rpcCalls.slice(-2).map((call) => call.name),
    [
      "portal_concluir_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
  const cleanupMetadata = fixture.updates.at(-1)?.payload
    .app_metadata as Record<string, unknown>;
  assert.equal(cleanupMetadata.universocc_temporary_password_issue_id, null);
  assert.equal(
    cleanupMetadata[TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY],
    null,
  );
});

Deno.test("não entrega senha quando a sessão efêmera não pode ser encerrada", async () => {
  const fixture = makeFixture({
    verification: { verified: true, sessionClosed: false },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name === "portal_cancelar_emissao_senha_temporaria"
    ),
    false,
  );
  assert.equal(
    fixture.rpcCalls.at(-2)?.name,
    "portal_concluir_emissao_senha_temporaria",
  );
});

Deno.test("não inicia emissão sem verificador efêmero configurado", async () => {
  const fixture = makeFixture({ verifierAvailable: false });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );

  assert.equal(response.status, 500);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    ["portal_identidade_termos_versao_vigente"],
  );
  assert.equal(fixture.updates.length, 0);
});

Deno.test("não entrega segredo sem concluir o estado canônico", async () => {
  const fixture = makeFixture({ completion: false });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 2);
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name === "portal_cancelar_emissao_senha_temporaria"
    ),
    false,
  );
});

Deno.test("não entrega segredo enquanto a limpeza da emissão não estiver confirmada", async () => {
  const fixture = makeFixture({ cleanup: false });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 3);
  assert.equal(
    fixture.rpcCalls.at(-1)?.name,
    "portal_confirmar_limpeza_emissao_senha_temporaria",
  );
});

Deno.test("cancela somente a rejeição conhecida cuja senha não autentica", async () => {
  const fixture = makeFixture({
    updateError: "senha recusada",
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.equal(fixture.updates.length, 3);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_reservar_emissao_senha_temporaria",
      "portal_cancelar_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
});

Deno.test("mantém a reserva quando o transporte da senha falha de forma ambígua", async () => {
  const fixture = makeFixture({
    updateThrows: true,
    completion: false,
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /permanece ambíguo|preservados/i);
  assert.equal(fixture.updates.length, 1);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_reservar_emissao_senha_temporaria",
      "portal_concluir_emissao_senha_temporaria",
    ],
  );
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name === "portal_cancelar_emissao_senha_temporaria"
    ),
    false,
  );
});

Deno.test("reconcilia escrita ambígua observada sem entregar a senha", async () => {
  const fixture = makeFixture({
    updateThrows: true,
    completion: true,
    verification: { verified: false, sessionClosed: true },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.temporaryPassword, undefined);
  assert.match(body.error, /encerrada com segurança/i);
  assert.deepEqual(
    fixture.rpcCalls.slice(-2).map((call) => call.name),
    [
      "portal_concluir_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name === "portal_cancelar_emissao_senha_temporaria"
    ),
    false,
  );
});

Deno.test("recusa emissão concorrente antes de alterar o Auth", async () => {
  const fixture = makeFixture({ reservation: false });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.updates.length, 0);
  assert.equal(
    fixture.rpcCalls.some((call) =>
      call.name === "portal_concluir_emissao_senha_temporaria"
    ),
    false,
  );
});

Deno.test("mapeia bloqueio multiperfil do aluno sem vazar erro interno", async () => {
  const fixture = makeFixture({
    reservationError: {
      code: "55000",
      message:
        "PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_IDENTIDADE_MULTIPERFIL detalhe SQL",
    },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, "ALUNO_SENHA_TEMPORARIA_NAO_PERMITIDA");
  assert.equal(fixture.updates.length, 0);
  assert.doesNotMatch(JSON.stringify(body), /PORTAL_EMISSAO|detalhe SQL/i);
});

Deno.test("sanitiza falha desconhecida ao reservar senha do aluno", async () => {
  const fixture = makeFixture({
    reservationError: { code: "XX000", message: "segredo SQL interno" },
  });
  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    partner,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(body), /segredo SQL interno/i);
});

Deno.test("reconcilia uma emissão confirmada no Auth antes de emitir outra", async () => {
  const pendingIssueId = "22222222-2222-4222-8222-222222222222";
  const fixture = makeFixture({
    authUser: {
      id: "auth-1",
      email: "aluno@example.com",
      email_confirmed_at: "2026-08-21T12:00:00.000Z",
      app_metadata: {
        provider: "email",
        universocc_temporary_password_issue_id: pendingIssueId,
        [TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]: pendingIssueId,
      },
      user_metadata: { partner_id: "partner-1" },
    },
  });

  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    {
      ...partner,
      senha_temporaria_pendente: true,
      senha_temporaria_emissao_id: pendingIssueId,
      senha_temporaria_emissao_iniciada_em: "2026-08-21T12:00:00.000Z",
      senha_atualizada_em: "2026-08-21T12:00:01.000Z",
    },
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.updates.length, 4);
  assert.equal(fixture.audits.length, 2);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_concluir_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
      "portal_reservar_emissao_senha_temporaria",
      "portal_concluir_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
  assert.equal(
    fixture.rpcCalls[1].args?.p_emissao_id,
    pendingIssueId,
  );
  assert.notEqual(
    (fixture.updates[0].payload.app_metadata as Record<string, unknown>)
      .universocc_temporary_password_issue_id,
    pendingIssueId,
  );
});

Deno.test("não libera uma reserva antiga sem confirmação para evitar senha tardia", async () => {
  const pendingIssueId = "44444444-4444-4444-8444-444444444444";
  const fixture = makeFixture({ completion: false });

  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    {
      ...partner,
      senha_temporaria_pendente: true,
      senha_temporaria_emissao_id: pendingIssueId,
      senha_temporaria_emissao_iniciada_em: "2026-08-21T12:00:00.000Z",
    },
  );

  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /emissão pendente/i);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.audits.length, 1);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_concluir_emissao_senha_temporaria",
    ],
  );
  assert.equal(fixture.rpcCalls[1].args?.p_emissao_id, pendingIssueId);
});

Deno.test("limpa uma emissão revogada antes de permitir uma nova senha", async () => {
  const revokedIssueId = "33333333-3333-4333-8333-333333333333";
  const fixture = makeFixture({
    authUser: {
      id: "auth-1",
      email: "aluno@example.com",
      email_confirmed_at: "2026-08-21T12:00:00.000Z",
      app_metadata: {
        provider: "email",
        universocc_temporary_password_issue_id: revokedIssueId,
        [TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY]: revokedIssueId,
      },
      user_metadata: { partner_id: "partner-1" },
    },
  });

  const response = await handleIssueStudentTemporaryPassword(
    fixture.context,
    {
      ...partner,
      senha_temporaria_pendente: true,
      senha_temporaria_emissao_id: revokedIssueId,
      senha_temporaria_emissao_iniciada_em: null,
      senha_temporaria_emissoes_revogadas: [revokedIssueId],
    },
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.updates.length, 4);
  assert.equal(fixture.audits.length, 2);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
      "portal_reservar_emissao_senha_temporaria",
      "portal_concluir_emissao_senha_temporaria",
      "portal_confirmar_limpeza_emissao_senha_temporaria",
    ],
  );
  assert.equal(
    (fixture.updates[0].payload.app_metadata as Record<string, unknown>)
      .universocc_temporary_password_issue_id,
    null,
  );
  assert.equal(typeof fixture.updates[2].payload.password, "string");
});

Deno.test("gerador sempre cumpre a política mínima sem usar dados do aluno", () => {
  const password = generateStudentTemporaryPassword();
  assert.equal(/[A-Z]/.test(password), true);
  assert.equal(/[a-z]/.test(password), true);
  assert.equal(/\d/.test(password), true);
  assert.equal(/[!@#$%*_-]/.test(password), true);
  assert.ok(password.length >= 16);
});

Deno.test("rota a emissão somente depois de carregar o parceiro autorizado", async () => {
  const indexSource = await Deno.readTextFile(
    new URL("../index.ts", import.meta.url),
  );
  const handlerSource = await Deno.readTextFile(
    new URL("./issue-student-temporary-password.ts", import.meta.url),
  );
  const partnerLoadIndex = indexSource.indexOf("await loadManagedPartner(");
  const temporaryPasswordRouteIndex = indexSource.indexOf(
    'action === "issue-student-temporary-password"',
  );

  assert.match(indexSource, /"issue-student-temporary-password"/);
  assert.match(
    indexSource,
    /action === "issue-student-temporary-password"[\s\S]*handleIssueStudentTemporaryPassword\(context, partner\)/,
  );
  assert.match(indexSource, /Cache-Control", "no-store, max-age=0"/);
  assert.match(handlerSource, /reconcilePendingTemporaryPasswordEmission/);
  assert.ok(partnerLoadIndex >= 0);
  assert.ok(temporaryPasswordRouteIndex > partnerLoadIndex);
});
