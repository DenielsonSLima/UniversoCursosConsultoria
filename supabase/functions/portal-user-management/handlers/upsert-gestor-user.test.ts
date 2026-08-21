import assert from "node:assert/strict";
import { handleUpsertGestorUser } from "./upsert-gestor-user.ts";
import type { HandlerContext } from "../types.ts";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const baseUser = {
  nome: "Gestora Teste",
  email: "gestora@example.com",
  telefone: "79999999999",
  cpf: "12345678909",
  status: "Ativo",
  context: "global",
  polo_ids: [],
  permissoes: {
    modules: ["configuracoes"],
    financeiroTabs: [],
    allPolos: true,
    tabs: {},
  },
  setor_comunicacao: "todos",
  polo_comunicacao_id: null,
  pode_visualizar_todos_polos: true,
  pode_visualizar_todos_setores: true,
};

type FixtureOptions = {
  authUsers?: Array<Record<string, unknown>>;
  partnerLinks?: Array<Record<string, unknown>>;
  systemUserLinks?: Array<Record<string, unknown>>;
  saveUserError?: { code?: string; message: string } | null;
  invitedAuthUser?: Record<string, unknown> | null;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const authUsers = options.authUsers || [];
  const insertedUsers: Array<Record<string, unknown>> = [];
  const invitedAuthPayloads: Array<Record<string, unknown>> = [];
  const deletedAuthUserIds: string[] = [];
  let listUsersCalls = 0;
  let partnerLinkQueries = 0;
  let systemUserLinkQueries = 0;

  const identityQuery = (
    rows: Array<Record<string, unknown>>,
    onQuery: () => void,
  ) => {
    const query: any = {
      eq: () => query,
      limit: async () => {
        onQuery();
        return { data: rows, error: null };
      },
    };
    return query;
  };

  const admin = {
    from: (table: string) => {
      if (table === "parceiros") {
        return {
          select: () =>
            identityQuery(options.partnerLinks || [], () => {
              partnerLinkQueries += 1;
            }),
        };
      }

      if (table === "usuarios_sistema") {
        return {
          select: () =>
            identityQuery(options.systemUserLinks || [], () => {
              systemUserLinkQueries += 1;
            }),
          insert: (payload: Record<string, unknown>) => {
            insertedUsers.push(payload);
            return {
              select: () => ({
                single: async () =>
                  options.saveUserError
                    ? { data: null, error: options.saveUserError }
                    : {
                      data: { id: "gestor-created", ...payload },
                      error: null,
                    },
              }),
            };
          },
        };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    },
    auth: {
      admin: {
        listUsers: async () => {
          listUsersCalls += 1;
          return { data: { users: authUsers }, error: null };
        },
        inviteUserByEmail: async (
          email: string,
          inviteOptions: Record<string, unknown>,
        ) => {
          invitedAuthPayloads.push({ email, ...inviteOptions });
          return {
            data: {
              user: options.invitedAuthUser === undefined
                ? {
                  id: "auth-invited",
                  email,
                  user_metadata: inviteOptions.data,
                }
                : options.invitedAuthUser,
            },
            error: null,
          };
        },
        deleteUser: async (authUserId: string) => {
          deletedAuthUserIds.push(authUserId);
          return { data: null, error: null };
        },
      },
    },
  };

  const context: HandlerContext = {
    admin,
    gestor: {
      id: "gestor-session",
      context: "global",
      polo_ids: [],
      permissoes: {
        modules: ["configuracoes"],
        financeiroTabs: [],
        allPolos: true,
        tabs: {},
      },
    },
    gestorEmail: "gestor-session@example.com",
    json: responder,
  };

  return {
    context,
    insertedUsers,
    invitedAuthPayloads,
    deletedAuthUserIds,
    counts: () => ({
      listUsersCalls,
      partnerLinkQueries,
      systemUserLinkQueries,
    }),
  };
};

Deno.test("valida nome antes de enviar um convite de primeiro acesso", async () => {
  const fixture = makeFixture();
  const response = await handleUpsertGestorUser(
    fixture.context,
    { ...baseUser, nome: "  " },
  );

  assert.equal(response.status, 400);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("envia convite, sem senha no payload, e cria usuário interno com vínculo canônico", async () => {
  const fixture = makeFixture();
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, true);
  assert.match(body.message, /convite de primeiro acesso/i);
  assert.equal(fixture.invitedAuthPayloads.length, 1);
  assert.equal(fixture.invitedAuthPayloads[0].email, baseUser.email);
  const inviteData = fixture.invitedAuthPayloads[0].data as Record<
    string,
    unknown
  >;
  const { invite_operation_nonce: invitationNonce, ...inviteMetadata } =
    inviteData;
  assert.deepEqual(inviteMetadata, {
    nome: baseUser.nome,
    origem: "usuarios_sistema",
  });
  assert.equal(typeof invitationNonce, "string");
  assert.ok(String(invitationNonce).length >= 20);
  assert.equal(
    fixture.invitedAuthPayloads[0].redirectTo,
    "https://universocc.com.br/recuperar-senha",
  );
  assert.equal("password" in fixture.invitedAuthPayloads[0], false);
  assert.equal(fixture.insertedUsers.length, 1);
  assert.equal(fixture.insertedUsers[0].auth_user_id, "auth-invited");
  assert.equal(fixture.insertedUsers[0].telefone, "(79) 99999-9999");
});

Deno.test("reaproveita identidade de aluno quando e-mail e CPF conferem", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-existing", email: baseUser.email }],
    partnerLinks: [{
      id: "partner-existing",
      email: baseUser.email,
      cpf_cnpj: baseUser.cpf,
    }],
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, false);
  assert.match(body.message, /senha atual foi preservada/i);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.equal(fixture.insertedUsers.length, 1);
  assert.equal(fixture.insertedUsers[0].auth_user_id, "auth-existing");
  assert.equal(fixture.deletedAuthUserIds.length, 0);
  assert.deepEqual(fixture.counts(), {
    listUsersCalls: 1,
    partnerLinkQueries: 1,
    systemUserLinkQueries: 1,
  });
});

Deno.test("não promove parceiro quando o CPF não confere", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-existing", email: baseUser.email }],
    partnerLinks: [{
      id: "partner-existing",
      email: baseUser.email,
      cpf_cnpj: "98765432100",
    }],
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /CPF informado não confere/i);
  assert.equal(fixture.insertedUsers.length, 0);
  assert.equal(fixture.deletedAuthUserIds.length, 0);
});

Deno.test("não duplica usuário interno para identidade Auth já vinculada", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-existing", email: baseUser.email }],
    systemUserLinks: [{ id: "gestor-existing" }],
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /já existe um usuário interno/i);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("recusa identidade Auth órfã", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-orphan", email: baseUser.email }],
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /identidade de acesso/i);
  assert.match(body.error, /regularize/i);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("não vincula Auth não confirmado reenviado sem o nonce do convite", async () => {
  const fixture = makeFixture({
    invitedAuthUser: {
      id: "auth-pendente-de-outro-fluxo",
      email: baseUser.email,
      user_metadata: { origem: "outro_fluxo" },
    },
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /comprovar que o convite criou/i);
  assert.equal(fixture.insertedUsers.length, 0);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("preserva Auth convidado se o cadastro interno colidir", async () => {
  const fixture = makeFixture({
    saveUserError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /cadastro interno não foi concluído/i);
  assert.match(body.error, /preservada para reconciliação segura/i);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("nunca remove Auth de parceiro reutilizado se o cadastro interno colidir", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-existing", email: baseUser.email }],
    partnerLinks: [{
      id: "partner-existing",
      email: baseUser.email,
      cpf_cnpj: baseUser.cpf,
    }],
    saveUserError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);

  assert.equal(response.status, 409);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("preserva Auth convidado quando o cadastro interno falha", async () => {
  const fixture = makeFixture({
    saveUserError: {
      message: "database unavailable",
    },
  });
  const response = await handleUpsertGestorUser(fixture.context, baseUser);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /cadastro interno não foi concluído/i);
  assert.match(body.error, /preservada para reconciliação segura/i);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});
