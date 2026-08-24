import assert from "node:assert/strict";
import {
  handleEnsureResponsavelAccess,
  INVITE_RECONCILIATION_PROOF_RPC,
} from "./ensure-responsavel-access.ts";
import {
  ACTOR_ID,
  AUTH_ID,
  CPF,
  EMAIL,
  makeFixture,
  OTHER_REQUEST_ID,
  REQUEST_ID,
  RESPONSAVEL_ID,
} from "./ensure-responsavel-access.test-fixture.ts";

Deno.test("não consulta o banco sem identificador válido", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    "invalido",
    REQUEST_ID,
  );
  assert.equal(response.status, 400);
  assert.equal(fixture.rpcCalls.length, 0);
});

Deno.test("exige requestId estável antes de consultar o banco", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /requestId UUID estável é obrigatório/i);
  assert.equal(fixture.rpcCalls.length, 0);
});

Deno.test("mantém o acesso bloqueado quando o banco declara o cadastro inelegível", async () => {
  const fixture = makeFixture({
    prepared: {
      responsavelLegalId: RESPONSAVEL_ID,
      nome: "Responsável Incompleto",
      cpf: null,
      email: null,
      status: "PENDENTE",
      authUserId: null,
      eligible: false,
      accessBlockReason: "VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO",
    },
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinkState, "not_eligible");
  assert.equal(
    body.message,
    "Confirme ao menos um vínculo vigente antes de criar o acesso.",
  );
  assert.equal(fixture.authListCalls(), 0);
  assert.equal(fixture.rpcCalls.length, 1);
});

Deno.test("não expõe motivo interno desconhecido de inelegibilidade", async () => {
  const fixture = makeFixture({
    prepared: {
      responsavelLegalId: RESPONSAVEL_ID,
      nome: "Responsável Incompleto",
      cpf: null,
      email: null,
      status: "PENDENTE",
      authUserId: null,
      eligible: false,
      accessBlockReason: "internal-table-name: segredo",
    },
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.doesNotMatch(JSON.stringify(body), /internal-table-name|segredo/);
});

Deno.test("adiciona perfil de responsável à conta do aluno quando CPF e e-mail coincidem", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [{
      id: "aluno-1",
      cpf_cnpj: "529.982.247-25",
      email: EMAIL,
      auth_login_email: EMAIL,
    }],
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
  assert.equal(fixture.invitePayloads.length, 0);
  assert.deepEqual(fixture.rpcCalls[1], {
    name: "responsavel_legal_acesso_vincular",
    args: {
      p_responsavel_legal_id: RESPONSAVEL_ID,
      p_auth_user_id: AUTH_ID,
      p_actor_auth_user_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
    },
  });
});

Deno.test("auth_login_email divergente prevalece sobre e-mail secundário", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [{
      id: "aluno-1",
      cpf_cnpj: CPF,
      email: EMAIL,
      auth_login_email: "outra-identidade@example.com",
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

Deno.test("usa e-mail secundário apenas quando auth_login_email está vazio", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [{
      id: "aluno-1",
      cpf_cnpj: CPF,
      email: EMAIL,
      auth_login_email: "",
    }],
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(fixture.rpcCalls[1].name, "responsavel_legal_acesso_vincular");
});

Deno.test("não toma posse de conta existente quando apenas o e-mail coincide", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: AUTH_ID, email: EMAIL }],
    partners: [{
      id: "aluno-1",
      cpf_cnpj: "11111111111",
      email: EMAIL,
      auth_login_email: EMAIL,
    }],
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /CPF e cadastro vinculado/i);
  assert.equal(fixture.rpcCalls.length, 1);
  assert.equal(fixture.invitePayloads.length, 0);
});

Deno.test("envia convite novo com nonce e vincula pela RPC interna", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.inviteSent, true);
  assert.equal(body.profileLinked, true);
  assert.equal(fixture.invitePayloads.length, 1);
  const invite = fixture.invitePayloads[0];
  const inviteData = invite.data as Record<string, unknown>;
  assert.equal(invite.email, EMAIL);
  assert.equal(
    invite.redirectTo,
    "https://universocc.com.br/recuperar-senha",
  );
  assert.equal(inviteData.origem, "cadastro_responsavel_legal");
  assert.equal(inviteData.responsavel_legal_id, RESPONSAVEL_ID);
  assert.equal(inviteData.invite_operation_version, "v1");
  assert.equal(inviteData.invite_operation_actor, ACTOR_ID);
  assert.equal(inviteData.invite_operation_nonce, REQUEST_ID);
  assert.match(String(inviteData.invite_operation_proof), /^[0-9a-f]{64}$/);
  assert.deepEqual(fixture.rpcCalls[1], {
    name: INVITE_RECONCILIATION_PROOF_RPC,
    args: {
      p_current_actor_auth_user_id: ACTOR_ID,
      p_original_actor_auth_user_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_responsavel_legal_id: RESPONSAVEL_ID,
      p_email: EMAIL,
    },
  });
  assert.equal(
    fixture.rpcCalls.at(-1)?.name,
    "responsavel_legal_acesso_vincular",
  );
});

Deno.test("falha fechada quando a RPC Vault da prova está indisponível", async () => {
  const fixture = makeFixture({
    proofError: { code: "XX000", message: "vault indisponível" },
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.code, "RESPONSAVEL_CONVITE_CONFIGURACAO_AUSENTE");
  assert.doesNotMatch(JSON.stringify(body), /vault/i);
  assert.equal(fixture.invitePayloads.length, 0);
  assert.equal(fixture.rpcCalls.length, 2);
  assert.equal(fixture.rpcCalls[1].name, INVITE_RECONCILIATION_PROOF_RPC);
});

Deno.test("falha fechada quando a RPC Vault retorna prova inválida", async () => {
  const fixture = makeFixture({ proofValue: "prova-invalida" });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.code, "RESPONSAVEL_CONVITE_CONFIGURACAO_AUSENTE");
  assert.equal(fixture.invitePayloads.length, 0);
  assert.equal(fixture.rpcCalls.length, 2);
});

Deno.test("erros internos do banco são sanitizados na resposta pública", async () => {
  const rawFailure = "db-host.internal token=segredo-operacional";
  const prepareFailure = makeFixture({
    prepareError: { code: "XX000", message: rawFailure },
  });
  const prepareResponse = await handleEnsureResponsavelAccess(
    prepareFailure.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const prepareBody = await prepareResponse.json();

  assert.equal(prepareResponse.status, 500);
  assert.equal(
    prepareBody.code,
    "RESPONSAVEL_ACESSO_PREPARACAO_FALHOU",
  );
  assert.doesNotMatch(
    JSON.stringify(prepareBody),
    /db-host|segredo-operacional/,
  );

  const bindingFailure = makeFixture({
    bindingError: { code: "XX000", message: rawFailure },
  });
  const bindingResponse = await handleEnsureResponsavelAccess(
    bindingFailure.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const bindingBody = await bindingResponse.json();

  assert.equal(bindingResponse.status, 500);
  assert.equal(bindingBody.code, "RESPONSAVEL_ACESSO_VINCULO_FALHOU");
  assert.doesNotMatch(
    JSON.stringify(bindingBody),
    /db-host|segredo-operacional/,
  );
});

Deno.test("não vincula convite reenviado sem nonce desta operação", async () => {
  const fixture = makeFixture({
    invitedAuthUser: {
      id: AUTH_ID,
      email: EMAIL,
      user_metadata: { origem: "outro_fluxo" },
    },
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /não foi possível comprovar/i);
  assert.equal(fixture.rpcCalls.length, 2);
});

Deno.test("vínculo existente exige o mesmo e-mail verificado", async () => {
  const fixture = makeFixture({
    prepared: {
      responsavelLegalId: RESPONSAVEL_ID,
      nome: "Responsável Teste",
      cpf: CPF,
      email: EMAIL,
      status: "ATIVO",
      authUserId: AUTH_ID,
      eligible: true,
      accessBlockReason: null,
    },
    authUserById: { id: AUTH_ID, email: "outra-pessoa@example.com" },
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /não corresponde/i);
  assert.equal(fixture.rpcCalls.length, 1);
});

Deno.test("preserva convite quando o vínculo transacional falha", async () => {
  const fixture = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  const response = await handleEnsureResponsavelAccess(
    fixture.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /preservada para reconciliação segura/i);
  assert.equal(fixture.invitePayloads.length, 1);
});

Deno.test("reconcilia o convite preservado no retry com o mesmo requestId", async () => {
  const failedAttempt = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  const failedResponse = await handleEnsureResponsavelAccess(
    failedAttempt.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  assert.equal(failedResponse.status, 409);
  const invitationMetadata = failedAttempt.invitePayloads[0]
    .data as Record<string, unknown>;

  const retry = makeFixture({
    authUsers: [{
      id: AUTH_ID,
      email: EMAIL,
      user_metadata: invitationMetadata,
    }],
  });
  const retryResponse = await handleEnsureResponsavelAccess(
    retry.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await retryResponse.json();

  assert.equal(retryResponse.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(body.inviteSent, false);
  assert.equal(retry.invitePayloads.length, 0);
  assert.equal(retry.rpcCalls.length, 3);
  assert.equal(retry.rpcCalls[1].name, INVITE_RECONCILIATION_PROOF_RPC);
  assert.equal(
    retry.rpcCalls[2].name,
    "responsavel_legal_acesso_vincular",
  );
  assert.equal(retry.rpcCalls[2].args.p_request_id, REQUEST_ID);
});

Deno.test("não reconcilia marcador adulterado pelo usuário", async () => {
  const failedAttempt = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  await handleEnsureResponsavelAccess(
    failedAttempt.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const invitationMetadata = {
    ...(failedAttempt.invitePayloads[0].data as Record<string, unknown>),
    invite_operation_proof: "0".repeat(64),
  };
  const retry = makeFixture({
    authUsers: [{
      id: AUTH_ID,
      email: EMAIL,
      user_metadata: invitationMetadata,
    }],
  });
  const response = await handleEnsureResponsavelAccess(
    retry.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /marcador seguro/i);
  assert.equal(retry.rpcCalls.length, 2);
  assert.equal(retry.invitePayloads.length, 0);
});

Deno.test("reconcilia convite preservado após reload com novo requestId", async () => {
  const failedAttempt = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  await handleEnsureResponsavelAccess(
    failedAttempt.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const invitationMetadata = failedAttempt.invitePayloads[0]
    .data as Record<string, unknown>;
  const retry = makeFixture({
    authUsers: [{
      id: AUTH_ID,
      email: EMAIL,
      user_metadata: invitationMetadata,
    }],
  });
  const response = await handleEnsureResponsavelAccess(
    retry.context,
    RESPONSAVEL_ID,
    OTHER_REQUEST_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(body.inviteSent, false);
  assert.equal(retry.rpcCalls.length, 3);
  assert.equal(retry.rpcCalls[1].name, INVITE_RECONCILIATION_PROOF_RPC);
  assert.equal(retry.rpcCalls[1].args.p_request_id, REQUEST_ID);
  assert.equal(retry.rpcCalls[2].args.p_request_id, OTHER_REQUEST_ID);
  assert.equal(retry.invitePayloads.length, 0);
});
