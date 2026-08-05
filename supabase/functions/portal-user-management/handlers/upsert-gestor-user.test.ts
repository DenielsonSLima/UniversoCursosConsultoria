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
  deleteAuthError?: { message: string } | null;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const authUsers = options.authUsers || [];
  const insertedUsers: Array<Record<string, unknown>> = [];
  const createdAuthPayloads: Array<Record<string, unknown>> = [];
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
        createUser: async (payload: Record<string, unknown>) => {
          createdAuthPayloads.push(payload);
          return {
            data: {
              user: {
                id: "auth-created",
                email: payload.email,
              },
            },
            error: null,
          };
        },
        deleteUser: async (authUserId: string) => {
          deletedAuthUserIds.push(authUserId);
          return { data: null, error: options.deleteAuthError || null };
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
    createdAuthPayloads,
    deletedAuthUserIds,
    counts: () => ({
      listUsersCalls,
      partnerLinkQueries,
      systemUserLinkQueries,
    }),
  };
};

Deno.test("rejeita senha fora da política antes de consultar ou criar no Auth", async () => {
  const fixture = makeFixture();
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Aa1234",
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /8 caracteres/i);
  assert.match(body.error, /maiúscula/i);
  assert.deepEqual(fixture.counts(), {
    listUsersCalls: 0,
    partnerLinkQueries: 0,
    systemUserLinkQueries: 0,
  });
  assert.equal(fixture.createdAuthPayloads.length, 0);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("valida nome antes de criar uma identidade que ficaria órfã", async () => {
  const fixture = makeFixture();
  const response = await handleUpsertGestorUser(
    fixture.context,
    { ...baseUser, nome: "  " },
    "Senha123",
  );

  assert.equal(response.status, 400);
  assert.equal(fixture.createdAuthPayloads.length, 0);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("cria Auth e usuário interno com vínculo canônico explícito", async () => {
  const fixture = makeFixture();
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.message, /usuário cadastrado/i);
  assert.equal(fixture.createdAuthPayloads.length, 1);
  assert.equal(fixture.createdAuthPayloads[0].password, "Senha123");
  assert.equal(fixture.insertedUsers.length, 1);
  assert.equal(fixture.insertedUsers[0].auth_user_id, "auth-created");
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
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.message, /senha atual foi preservada/i);
  assert.equal(fixture.createdAuthPayloads.length, 0);
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
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
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
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /já existe um usuário interno/i);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("recusa identidade Auth órfã porque a senha informada não seria aplicada", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-orphan", email: baseUser.email }],
  });
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /identidade de acesso/i);
  assert.match(body.error, /regularize/i);
  assert.equal(fixture.createdAuthPayloads.length, 0);
  assert.equal(fixture.insertedUsers.length, 0);
});

Deno.test("remove Auth recém-criado se o cadastro interno colidir", async () => {
  const fixture = makeFixture({
    saveUserError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
  });
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /já existe um usuário interno/i);
  assert.match(body.error, /CPF/i);
  assert.deepEqual(fixture.deletedAuthUserIds, ["auth-created"]);
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
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );

  assert.equal(response.status, 409);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("informa estado parcial quando a reversão do Auth recém-criado falha", async () => {
  const fixture = makeFixture({
    saveUserError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
    deleteAuthError: { message: "auth delete unavailable" },
  });
  const response = await handleUpsertGestorUser(
    fixture.context,
    baseUser,
    "Senha123",
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /não pôde ser revertida/i);
  assert.match(body.error, /regularize/i);
  assert.deepEqual(fixture.deletedAuthUserIds, ["auth-created"]);
});
