import assert from "node:assert/strict";
import { hasCreatedStudentPassword } from "./student-first-access-state.ts";
import { handleIssueStudentTemporaryPassword } from "./issue-student-temporary-password.ts";
import { makeFixture, partner } from "./issue-student-temporary-password.test-fixture.ts";

const ownPassword = {
  ...partner,
  senha_atualizada_em: "2026-10-10T18:00:00.000Z",
  troca_senha_obrigatoria: true,
  aceitou_termos_uso: false,
};

Deno.test("prova de senha própria independe de e-mail e termos pendentes", () => {
  assert.equal(hasCreatedStudentPassword(ownPassword), true);
  assert.equal(hasCreatedStudentPassword({ ...ownPassword, senha_atualizada_em: null }), false);
  assert.equal(hasCreatedStudentPassword({ ...ownPassword, senha_atualizada_em: "inválido" }), false);
  for (const field of [
    "senha_temporaria_emissao_id",
    "senha_temporaria_emissao_iniciada_em",
    "senha_temporaria_emissao_senha_alterada_em",
  ]) {
    assert.equal(hasCreatedStudentPassword({ ...ownPassword, [field]: "pendente" }), false);
  }
});

Deno.test("senha temporária só vira prova própria depois de uma alteração posterior", () => {
  const temporary = {
    ...ownPassword,
    senha_temporaria_pendente: true,
    senha_temporaria_emitida_em: "2026-10-10T18:00:00.000Z",
  };
  assert.equal(hasCreatedStudentPassword(temporary), false);
  assert.equal(hasCreatedStudentPassword({
    ...temporary, senha_atualizada_em: "2026-10-10T18:00:01.000Z",
  }), true);
});

Deno.test("handler não sobrescreve a senha criada antes da confirmação do e-mail", async () => {
  const fixture = makeFixture();
  const response = await handleIssueStudentTemporaryPassword(fixture.context, ownPassword);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ALUNO_SENHA_PROPRIA_JA_CRIADA");
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.audits.length, 0);
  assert.equal(fixture.rpcCalls.length, 0);
});

Deno.test("mudança concorrente da credencial é recusada pela reserva antes de enviar senha ao Auth", async () => {
  const fixture = makeFixture({ reservationError: {
    code: "55000", message: "PORTAL_ALUNO_SENHA_PROPRIA_JA_CRIADA",
  } });
  const response = await handleIssueStudentTemporaryPassword(fixture.context, partner);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ALUNO_SENHA_PROPRIA_JA_CRIADA");
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.verificationCalls.length, 0);
});
