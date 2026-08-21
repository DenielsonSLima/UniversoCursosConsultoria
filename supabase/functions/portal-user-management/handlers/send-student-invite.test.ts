import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import type { HandlerContext, Partner } from "../types.ts";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const basePartner: Partner = {
  id: "partner-1",
  tipo: "Aluno",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
};

const makeAdmin = (
  authUsers: any[] = [],
  identityConflicts: { parceiros?: any[]; usuarios_sistema?: any[] } = {},
) => {
  const updates: Array<Record<string, unknown>> = [];
  const inviteRedirects: string[] = [];
  let inviteCalls = 0;
  let createCalls = 0;
  let generateLinkCalls = 0;
  const admin = {
    from: (table: "parceiros" | "usuarios_sistema") => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
      select: () => {
        const query: any = {
          eq: () => query,
          neq: () => query,
          limit: async () => ({
            data: identityConflicts[table] || [],
            error: null,
          }),
        };
        return query;
      },
    }),
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: authUsers },
          error: null,
        }),
        getUserById: async (id: string) => ({
          data: { user: authUsers.find((user) => user.id === id) || null },
          error: null,
        }),
        inviteUserByEmail: async (
          _email: string,
          options: { redirectTo?: string },
        ) => {
          inviteCalls += 1;
          if (options.redirectTo) inviteRedirects.push(options.redirectTo);
          return {
            data: {
              user: {
                id: "auth-1",
                email: "aluno@example.com",
                user_metadata: { partner_id: "partner-1" },
              },
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
    counts: () => ({ inviteCalls, createCalls, generateLinkCalls }),
  };
};

const contextFor = (admin: any): HandlerContext => ({
  admin,
  gestor: { id: "gestor-1" },
  gestorEmail: "gestor@example.com",
  json: responder,
});

const options = {
  redirectTo: "https://universocc.com.br/login",
  supabaseUrl: "https://project.supabase.co",
  publicApiKey: { apiKey: "anon-key", message: null },
};

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
  assert.ok(fixture.updates.some((patch) =>
    patch.auth_user_id === "auth-1" &&
    patch.acesso_status === "processando"
  ));
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

Deno.test("retry de identidade sintética existente não cria usuário duplicado", async () => {
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

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.recoveryLink, "https://example.test/link");
  assert.deepEqual(fixture.counts(), {
    inviteCalls: 0,
    createCalls: 0,
    generateLinkCalls: 1,
  });
  assert.ok(
    fixture.updates.some((patch) =>
      patch.auth_user_id === "auth-synthetic" &&
      patch.acesso_status === "pendente"
    ),
  );
});

Deno.test("não reaproveita identidade vinculada a outro parceiro", async () => {
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
  assert.match(body.error, /outro cadastro/i);
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
