import assert from "node:assert/strict";
import { handleEnsureResponsavelAccess } from "./ensure-responsavel-access.ts";
import {
  AUTH_ID,
  CPF,
  EMAIL,
  makeFixture,
  REQUEST_ID,
  RESPONSAVEL_ID,
} from "./ensure-responsavel-access.test-fixture.ts";

const matchingPartner = (id: string) => ({
  id,
  cpf_cnpj: CPF,
  email: EMAIL,
  auth_login_email: EMAIL,
});

Deno.test("Responsável rejeita se um de dois Parceiros do UID divergir", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [
      matchingPartner("aluno"),
      {
        ...matchingPartner("professor"),
        auth_login_email: "outra-pessoa@example.com",
      },
    ],
  });

  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, "RESPONSAVEL_IDENTIDADE_DIVERGENTE");
  assert.equal(fixture.rpcCalls.length, 1);
  assert.equal(fixture.invitePayloads.length, 0);
});

Deno.test("Responsável aceita identidade com Aluno, Professor e Gestor coerentes", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [matchingPartner("aluno"), matchingPartner("professor")],
    gestores: [{ id: "gestor", cpf: CPF, email: EMAIL }],
  });

  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(body.inviteSent, false);
  assert.equal(fixture.rpcCalls[1].name, "responsavel_legal_acesso_vincular");
  assert.equal(fixture.invitePayloads.length, 0);
});

Deno.test("Responsável não reutiliza UID já ligado a outro Responsável", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [matchingPartner("aluno")],
    responsaveis: [{
      id: "responsavel-existente",
      cpf_normalizado: CPF,
      email: EMAIL,
    }],
  });

  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, "RESPONSAVEL_IDENTIDADE_DIVERGENTE");
  assert.equal(fixture.rpcCalls.length, 1);
  assert.equal(fixture.invitePayloads.length, 0);
});

Deno.test("Responsável trata divergência canônica concorrente como conflito", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [matchingPartner("aluno")],
    bindingError: {
      code: "23514",
      message: "PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE",
    },
  });

  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, "RESPONSAVEL_ACESSO_CONFLITO");
  assert.doesNotMatch(JSON.stringify(body), /PORTAL_IDENTIDADE/);
  assert.equal(fixture.invitePayloads.length, 0);
});
