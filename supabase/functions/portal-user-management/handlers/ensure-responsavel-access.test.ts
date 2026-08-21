import assert from "node:assert/strict";
import {
  handleEnsureResponsavelAccess,
  INVITE_RECONCILIATION_PROOF_RPC,
} from "./ensure-responsavel-access.ts";
import type { HandlerContext } from "../types.ts";

const RESPONSAVEL_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ACTOR_ID = "66666666-6666-4666-8666-666666666666";
const AUTH_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const EMAIL = "responsavel@example.com";
const CPF = "52998224725";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

type FixtureOptions = {
  actorAuthUserId?: string;
  prepared?: Record<string, unknown>;
  prepareError?: { code?: string; message: string } | null;
  bindingError?: { code?: string; message: string } | null;
  authUsers?: Array<Record<string, unknown>>;
  authUserById?: Record<string, unknown> | null;
  partners?: Array<Record<string, unknown>>;
  gestores?: Array<Record<string, unknown>>;
  invitedAuthUser?: Record<string, unknown> | null;
  proofError?: { code?: string; message: string } | null;
  proofValue?: unknown;
};

type FixtureQueryResult = {
  data: Array<Record<string, unknown>>;
  error: null;
};

type FixtureQuery = {
  eq: () => FixtureQuery;
  limit: () => FixtureQueryResult;
};

const deterministicProof = async (args: Record<string, unknown>) => {
  const canonical = [
    "v1",
    String(args.p_original_actor_auth_user_id || ""),
    String(args.p_request_id || ""),
    String(args.p_responsavel_legal_id || ""),
    String(args.p_email || "").trim().toLowerCase(),
  ].join("\n");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const makeFixture = (options: FixtureOptions = {}) => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const invitePayloads: Array<Record<string, unknown>> = [];
  let authListCalls = 0;

  const prepared = options.prepared || {
    responsavelLegalId: RESPONSAVEL_ID,
    nome: "Responsável Teste",
    cpf: CPF,
    email: EMAIL,
    status: "ATIVO",
    authUserId: null,
    eligible: true,
    accessBlockReason: null,
  };

  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "responsavel_legal_acesso_preparar") {
        return options.prepareError
          ? { data: null, error: options.prepareError }
          : { data: prepared, error: null };
      }
      if (name === "responsavel_legal_acesso_vincular") {
        return options.bindingError
          ? { data: null, error: options.bindingError }
          : { data: { responsavelLegalId: RESPONSAVEL_ID }, error: null };
      }
      if (name === INVITE_RECONCILIATION_PROOF_RPC) {
        if (options.proofError) {
          return { data: null, error: options.proofError };
        }
        if (Object.hasOwn(options, "proofValue")) {
          return { data: options.proofValue, error: null };
        }
        return { data: await deterministicProof(args), error: null };
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    from: (table: string) => ({
      select: () => {
        const query: FixtureQuery = {
          eq: () => query,
          limit: () => ({
            data: table === "parceiros"
              ? options.partners || []
              : options.gestores || [],
            error: null,
          }),
        };
        return query;
      },
    }),
    auth: {
      admin: {
        listUsers: () => {
          authListCalls += 1;
          return { data: { users: options.authUsers || [] }, error: null };
        },
        getUserById: () => ({
          data: {
            user: options.authUserById === undefined
              ? { id: AUTH_ID, email: EMAIL }
              : options.authUserById,
          },
          error: null,
        }),
        inviteUserByEmail: (
          email: string,
          inviteOptions: Record<string, unknown>,
        ) => {
          const inviteData = inviteOptions.data as Record<string, unknown>;
          invitePayloads.push({ email, ...inviteOptions });
          return {
            data: {
              user: options.invitedAuthUser === undefined
                ? {
                  id: AUTH_ID,
                  email,
                  user_metadata: inviteData,
                }
                : options.invitedAuthUser,
            },
            error: null,
          };
        },
      },
    },
  };

  const context: HandlerContext = {
    admin,
    gestor: { auth_user_id: options.actorAuthUserId || ACTOR_ID },
    gestorEmail: "gestor@example.com",
    json: responder,
  };

  return {
    context,
    rpcCalls,
    invitePayloads,
    authListCalls: () => authListCalls,
  };
};

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
  assert.equal(invite.redirectTo, "https://universocc.com.br/recuperar-senha");
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

Deno.test("permite que outro gestor autorizado reconcilie o convite assinado", async () => {
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
    actorAuthUserId: OTHER_ACTOR_ID,
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

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(body.inviteSent, false);
  assert.equal(retry.rpcCalls.length, 3);
  assert.equal(retry.rpcCalls[1].name, INVITE_RECONCILIATION_PROOF_RPC);
  assert.equal(
    retry.rpcCalls[1].args.p_current_actor_auth_user_id,
    OTHER_ACTOR_ID,
  );
  assert.equal(
    retry.rpcCalls[1].args.p_original_actor_auth_user_id,
    ACTOR_ID,
  );
  assert.equal(retry.rpcCalls[2].args.p_actor_auth_user_id, OTHER_ACTOR_ID);
  assert.equal(retry.invitePayloads.length, 0);
});

Deno.test("rejeita adulteração do ator original ou nonce assinado", async () => {
  const failedAttempt = makeFixture({
    bindingError: { code: "40001", message: "Estado alterado." },
  });
  await handleEnsureResponsavelAccess(
    failedAttempt.context,
    RESPONSAVEL_ID,
    REQUEST_ID,
  );
  const originalMetadata = failedAttempt.invitePayloads[0]
    .data as Record<string, unknown>;

  for (
    const alteredMetadata of [
      { ...originalMetadata, invite_operation_actor: OTHER_ACTOR_ID },
      { ...originalMetadata, invite_operation_nonce: OTHER_REQUEST_ID },
    ]
  ) {
    const retry = makeFixture({
      authUsers: [{
        id: AUTH_ID,
        email: EMAIL,
        user_metadata: alteredMetadata,
      }],
    });
    const response = await handleEnsureResponsavelAccess(
      retry.context,
      RESPONSAVEL_ID,
      OTHER_REQUEST_ID,
    );
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /marcador seguro/i);
    assert.equal(retry.rpcCalls.length, 2);
    assert.equal(retry.invitePayloads.length, 0);
  }
});
