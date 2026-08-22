import assert from "node:assert/strict";
import {
  handleIssueStudentTemporaryPassword,
  TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY,
} from "./issue-student-temporary-password.ts";
import {
  GESTOR_AUTH_USER_ID,
  makeFixture,
  partner,
} from "./issue-student-temporary-password.test-fixture.ts";

import "./issue-student-temporary-password.test-cases.ts";

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
