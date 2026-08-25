import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import type { HandlerContext, Partner } from "../types.ts";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const basePartner: Partner = {
  id: "22222222-2222-4222-8222-222222222222",
  tipo: "Aluno",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  cpf_cnpj: "52998224725",
};

type AdminFixtureOptions = {
  rpcUnavailable?: boolean;
  inviteError?: string;
  authUsersAfterInvite?: any[];
  bindingResult?: Record<string, unknown> | null;
  currentPartner?: Record<string, unknown> | null;
};

const makeAdmin = (
  authUsers: any[] = [],
  identityConflicts: {
    parceiros?: any[];
    usuarios_sistema?: any[];
    responsaveis_legais?: any[];
  } = {},
  invitedAuthUser?: Record<string, unknown> | null,
  fixtureOptions: AdminFixtureOptions = {},
) => {
  const updates: Array<Record<string, unknown>> = [];
  const inviteRedirects: string[] = [];
  const inviteMetadata: Array<Record<string, unknown> | undefined> = [];
  let inviteCalls = 0;
  let createCalls = 0;
  let generateLinkCalls = 0;
  let listUsersCalls = 0;
  const admin = {
    rpc: async () =>
      fixtureOptions.rpcUnavailable
        ? { data: null, error: { message: "detalhe interno" } }
        : { data: "a".repeat(64), error: null },
    from: (
      table: "parceiros" | "usuarios_sistema" | "responsaveis_legais",
    ) => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        const query: any = {
          eq: () => query,
          is: () => query,
          select: () => query,
          maybeSingle: async () => ({
            data: fixtureOptions.bindingResult === undefined
              ? { id: basePartner.id, ...patch }
              : fixtureOptions.bindingResult,
            error: null,
          }),
        };
        return query;
      },
      select: () => {
        const query: any = {
          eq: () => query,
          neq: () => query,
          limit: async () => ({
            data: identityConflicts[table] || [],
            error: null,
          }),
          maybeSingle: async () => ({
            data: fixtureOptions.currentPartner || null,
            error: null,
          }),
        };
        return query;
      },
    }),
    auth: {
      admin: {
        listUsers: async () => {
          listUsersCalls += 1;
          return {
            data: {
              users: listUsersCalls > 1 && fixtureOptions.authUsersAfterInvite
                ? fixtureOptions.authUsersAfterInvite
                : authUsers,
            },
            error: null,
          };
        },
        getUserById: async (id: string) => ({
          data: { user: authUsers.find((user) => user.id === id) || null },
          error: null,
        }),
        inviteUserByEmail: async (
          _email: string,
          options: { redirectTo?: string; data?: Record<string, unknown> },
        ) => {
          inviteCalls += 1;
          if (options.redirectTo) inviteRedirects.push(options.redirectTo);
          inviteMetadata.push(options.data);
          if (fixtureOptions.inviteError) {
            return {
              data: { user: null },
              error: { message: fixtureOptions.inviteError },
            };
          }
          return {
            data: {
              user: invitedAuthUser === undefined
                ? {
                  id: "auth-1",
                  email: "aluno@example.com",
                  user_metadata: options.data,
                }
                : invitedAuthUser,
            },
            error: null,
          };
        },
        createUser: async () => {
          createCalls += 1;
          return { data: { user: null }, error: new Error("unexpected") };
        },
        generateLink: async () => {
          generateLinkCalls += 1;
          return {
            data: { properties: { action_link: "https://example.test/link" } },
            error: null,
          };
        },
      },
    },
  };

  return {
    admin,
    updates,
    inviteRedirects,
    inviteMetadata,
    counts: () => ({ inviteCalls, createCalls, generateLinkCalls }),
  };
};

const contextFor = (admin: any): HandlerContext => ({
  admin,
  gestor: {
    id: "gestor-1",
    auth_user_id: "11111111-1111-4111-8111-111111111111",
  },
  gestorEmail: "gestor@example.com",
  json: responder,
});

const options = {
  redirectTo: "https://universocc.com.br/login",
  supabaseUrl: "https://project.supabase.co",
  publicApiKey: { apiKey: "anon-key", message: null },
};

const signedStudentInvite = (proof = "a".repeat(64)) => ({
  id: "auth-reconciled",
  email: basePartner.email,
  user_metadata: {
    origem: "cadastro_gestor",
    tipo: "Aluno",
    partner_id: basePartner.id,
    invite_operation_version: "v1",
    invite_operation_actor: "11111111-1111-4111-8111-111111111111",
    invite_operation_nonce: "33333333-3333-4333-8333-333333333333",
    invite_operation_proof: proof,
  },
});

Deno.test("convite novo vincula auth_user_id e não aceita termos pelo aluno", async () => {
  const fixture = makeAdmin();
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    basePartner,
    options,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, true);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 1,
    createCalls: 0,
    generateLinkCalls: 0,
  });
  assert.deepEqual(fixture.inviteRedirects, [
    "https://universocc.com.br/login",
  ]);
  assert.equal(fixture.inviteMetadata[0]?.invite_operation_version, "v1");
  assert.equal(
    fixture.inviteMetadata[0]?.invite_operation_proof,
    "a".repeat(64),
  );
  assert.ok(fixture.updates.some((patch) =>
    patch.auth_user_id === "auth-1" &&
    patch.acesso_status === "convite_enviado" &&
    typeof patch.convite_enviado_em === "string"
  ));
  assert.equal(
    fixture.updates.some((patch) => "aceitou_termos_uso" in patch),
    false,
  );
});

Deno.test("não adota identidade sintética órfã em retry", async () => {
  const syntheticUser = {
    id: "auth-synthetic",
    email: "matricula@acesso.universocc.invalid",
    user_metadata: { partner_id: "partner-1" },
  };
  const fixture = makeAdmin([syntheticUser]);
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    {
      ...basePartner,
      email: null,
      auth_login_email: syntheticUser.email,
    },
    options,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error, /nenhum perfil canônico/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 0,
  });
  assert.equal(
    fixture.updates.some((patch) => patch.auth_user_id === "auth-synthetic"),
    false,
  );
});

Deno.test("não usa user_metadata para adotar identidade sem perfil canônico", async () => {
  const fixture = makeAdmin([{
    id: "auth-foreign",
    email: "aluno@example.com",
    user_metadata: { partner_id: "partner-foreign" },
  }]);
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    basePartner,
    options,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error, /nenhum perfil canônico/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 0,
  });
});

Deno.test("nunca confirma no backend um e-mail real sem canal de entrega", async () => {
  const fixture = makeAdmin();
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    {
      ...basePartner,
      email: "contato@example.com",
      auth_login_email: "acesso-real@example.com",
    },
    options,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.error, /deve coincidir/i);
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 0,
  });
});

Deno.test("impede vínculo de Auth pertencente a usuário interno", async () => {
  const fixture = makeAdmin(
    [{
      id: "auth-internal",
      email: "aluno@example.com",
      user_metadata: {},
    }],
    { usuarios_sistema: [{ id: "gestor-1" }] },
  );
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    basePartner,
    options,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error, /usuário interno/i);
  assert.equal(
    fixture.updates.some((patch) => patch.auth_user_id === "auth-internal"),
    false,
  );
});

Deno.test("reenvio de aluno ativo gera recuperação sem rebaixar acesso", async () => {
  const activeUser = {
    id: "auth-active",
    email: "aluno@example.com",
    email_confirmed_at: "2026-08-03T12:00:00.000Z",
    user_metadata: { partner_id: "partner-1" },
  };
  const fixture = makeAdmin([activeUser]);
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    {
      ...basePartner,
      auth_user_id: activeUser.id,
      acesso_status: "ativo",
      acesso_ativado_em: "2026-08-03T12:00:00.000Z",
      senha_atualizada_em: "2026-08-03T12:00:00.000Z",
      troca_senha_obrigatoria: false,
    },
    {
      ...options,
      publicApiKey: { apiKey: null, message: "E-mail indisponível." },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.message, /já estava ativo/i);
  assert.equal(body.recoveryLink, "https://example.test/link");
  assert.equal(
    fixture.updates.some((patch) =>
      "acesso_status" in patch ||
      "acesso_ativado_em" in patch ||
      "troca_senha_obrigatoria" in patch
    ),
    false,
  );
});

Deno.test("não vincula Auth devolvido pelo convite sem a prova da operação", async () => {
  const fixture = makeAdmin([], {}, {
    id: "auth-foreign",
    email: basePartner.email,
    user_metadata: { origem: "outro_fluxo" },
  });
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    basePartner,
    options,
  );

  assert.equal(response.status, 409);
  assert.equal(
    fixture.updates.some((patch) => "auth_user_id" in patch),
    false,
  );
});

Deno.test("conflito concorrente não cria vínculo oculto de Auth", async () => {
  const fixture = makeAdmin([], {
    parceiros: [{
      id: "professor-1",
      tipo: "Professor",
      cpf_cnpj: basePartner.cpf_cnpj,
      auth_login_email: basePartner.auth_login_email,
    }],
  });
  const response = await handleSendStudentInvite(
    contextFor(fixture.admin),
    basePartner,
    options,
  );

  assert.equal(response.status, 409);
  assert.equal(
    fixture.updates.some((patch) => "auth_user_id" in patch),
    false,
  );
});

Deno.test("reconcilia Auth de convite assinado sem reenviar convite", async () => {
  const markedAuth = signedStudentInvite();
  const fixtures = [
    makeAdmin([markedAuth]),
    makeAdmin([], {}, undefined, {
      inviteError: "identity already exists",
      authUsersAfterInvite: [markedAuth],
    }),
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const response = await handleSendStudentInvite(
      contextFor(fixture.admin),
      basePartner,
      options,
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.action, "reconcile-invite");
    assert.equal(body.inviteSent, false);
    assert.equal(fixture.counts().inviteCalls, index);
    assert.ok(
      fixture.updates.some((patch) =>
        patch.auth_user_id === markedAuth.id &&
        patch.acesso_status === "convite_enviado"
      ),
    );
  }
});

Deno.test("falha fechado para prova incompatível ou RPC indisponível", async () => {
  const cases = [
    { fixture: makeAdmin([signedStudentInvite("b".repeat(64))]), status: 409 },
    {
      fixture: makeAdmin([signedStudentInvite()], {}, undefined, {
        rpcUnavailable: true,
      }),
      status: 500,
    },
  ];

  for (const { fixture, status } of cases) {
    const response = await handleSendStudentInvite(
      contextFor(fixture.admin),
      basePartner,
      options,
    );
    assert.equal(response.status, status);
    assert.equal(
      fixture.updates.some((patch) => "auth_user_id" in patch),
      false,
    );
  }
});

Deno.test("CAS do primeiro vínculo só reconcilia corrida com o mesmo UID", async () => {
  const sameUid = makeAdmin([], {}, undefined, {
    bindingResult: null,
    currentPartner: {
      ...basePartner,
      auth_user_id: "auth-1",
      auth_login_email: basePartner.email,
    },
  });
  const sameResponse = await handleSendStudentInvite(
    contextFor(sameUid.admin),
    basePartner,
    options,
  );
  assert.equal(sameResponse.status, 200);

  const otherUid = makeAdmin([], {}, undefined, {
    bindingResult: null,
    currentPartner: {
      ...basePartner,
      auth_user_id: "auth-concurrent",
      auth_login_email: basePartner.email,
    },
  });
  const otherResponse = await handleSendStudentInvite(
    contextFor(otherUid.admin),
    basePartner,
    options,
  );
  assert.equal(otherResponse.status, 409);
  const firstBinding = otherUid.updates.findIndex((patch) =>
    "auth_user_id" in patch
  );
  assert.ok(firstBinding >= 0);
  assert.equal(
    otherUid.updates.slice(firstBinding + 1).some((patch) =>
      "auth_user_id" in patch
    ),
    false,
  );
});
