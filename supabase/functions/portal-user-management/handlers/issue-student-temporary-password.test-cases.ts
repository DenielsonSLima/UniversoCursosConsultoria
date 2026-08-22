import assert from "node:assert/strict";
import {
  generateStudentTemporaryPassword,
  handleIssueStudentTemporaryPassword,
  TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY,
} from "./issue-student-temporary-password.ts";
import {
  makeFixture,
  partner,
} from "./issue-student-temporary-password.test-fixture.ts";

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
