/// <reference lib="deno.ns" />

import assert from "node:assert/strict";
import { handleLinkProfessorAuthIdentity } from "./link-professor-auth-identity.ts";
import type { HandlerContext, Partner } from "../types.ts";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

type FixtureOptions = {
  global?: boolean;
  configurationAccess?: boolean;
  authUser?: Record<string, unknown> | null;
  systemUser?: Record<string, unknown> | null;
  otherPartners?: Array<Record<string, unknown>>;
  linkedPartner?: Record<string, unknown> | null;
  linkError?: { code?: string; message: string } | null;
};

const professorEmail = "professor@example.com";

const makeFixture = (options: FixtureOptions = {}) => {
  const linkedPayloads: Array<Record<string, unknown>> = [];
  let getAuthUserCalls = 0;
  const authUser = options.authUser === undefined
    ? { id: "auth-gestor", email: professorEmail }
    : options.authUser;

  const admin = {
    from: (table: string) => {
      if (table === "usuarios_sistema") {
        const query: any = {
          ilike: () => query,
          limit: async () => ({
            data: options.systemUser
              ? [{ email: professorEmail, ...options.systemUser }]
              : [],
            error: null,
          }),
        };
        return { select: () => query };
      }

      if (table === "parceiros") {
        return {
          select: () => {
            const query: any = {
              eq: () => query,
              neq: () => query,
              limit: async () => ({
                data: options.otherPartners || [],
                error: null,
              }),
            };
            return query;
          },
          update: (payload: Record<string, unknown>) => {
            linkedPayloads.push(payload);
            const query: any = {
              eq: () => query,
              is: () => query,
              select: () => ({
                maybeSingle: async () =>
                  options.linkError
                    ? { data: null, error: options.linkError }
                    : {
                      data: options.linkedPartner === undefined
                        ? { id: "professor-1", ...payload }
                        : options.linkedPartner,
                      error: null,
                    },
              }),
            };
            return query;
          },
        };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => {
          getAuthUserCalls += 1;
          return { data: { user: authUser }, error: null };
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
        modules: options.configurationAccess === false
          ? ["parceiros"]
          : ["parceiros", "configuracoes"],
        financeiroTabs: [],
        allPolos: options.global === false ? false : true,
        tabs: {},
      },
    },
    gestorEmail: "gestor-session@example.com",
    json: responder,
  };

  return {
    context,
    linkedPayloads,
    getAuthUserCalls: () => getAuthUserCalls,
  };
};

const professor: Partner = {
  id: "professor-1",
  tipo: "Professor",
  nome: "Professor Teste",
  email: professorEmail,
  cpf_cnpj: "123.456.789-09",
};

Deno.test("vincula professor ao Auth do gestor somente quando e-mail e CPF coincidem", async () => {
  const fixture = makeFixture({
    authUser: { id: "auth-gestor", email: professor.email },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    },
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.userId, "auth-gestor");
  assert.equal(body.profileLinked, true);
  assert.equal(body.profileLinkState, "linked");
  assert.deepEqual(fixture.linkedPayloads, [{
    auth_user_id: "auth-gestor",
    auth_login_email: professorEmail,
  }]);
});

Deno.test("não vincula quando o CPF do professor diverge do gestor", async () => {
  const fixture = makeFixture({
    authUser: { id: "auth-gestor", email: professor.email },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "98765432100",
    },
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /CPF do professor não confere/i);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não vincula quando o e-mail do Auth diverge do professor", async () => {
  const fixture = makeFixture({
    authUser: { id: "auth-gestor", email: "outro-email@example.com" },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    },
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /e-mail do professor não confere/i);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não cria vínculo quando o operador não é gestor global com Configurações", async () => {
  const fixture = makeFixture({
    global: false,
    authUser: { id: "auth-gestor", email: professor.email },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    },
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.profileLinked, false);
  assert.equal(
    body.profileLinkState,
    "requires_global_configuration_access",
  );
  assert.equal(fixture.getAuthUserCalls(), 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não cria vínculo quando gestor global não possui Configurações", async () => {
  const fixture = makeFixture({
    configurationAccess: false,
    authUser: { id: "auth-gestor", email: professor.email },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    },
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.profileLinked, false);
  assert.equal(
    body.profileLinkState,
    "requires_global_configuration_access",
  );
  assert.equal(fixture.getAuthUserCalls(), 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não consulta o Auth quando não existe Gestor com o mesmo e-mail", async () => {
  const fixture = makeFixture();

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.profileLinked, false);
  assert.equal(body.profileLinkState, "no_matching_gestor");
  assert.equal(fixture.getAuthUserCalls(), 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não reaproveita Auth que já pertence a outro parceiro", async () => {
  const fixture = makeFixture({
    authUser: { id: "auth-gestor", email: professor.email },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    },
    otherPartners: [{ id: "outro-parceiro" }],
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /outro parceiro/i);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("recusa ação para perfil que não seja Professor antes de consultar o Auth", async () => {
  const fixture = makeFixture({
    authUser: { id: "auth-gestor", email: professor.email },
  });

  const response = await handleLinkProfessorAuthIdentity(fixture.context, {
    ...professor,
    tipo: "Aluno",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /somente perfis de Professor/i);
  assert.equal(fixture.getAuthUserCalls(), 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("recusa concorrência quando a atualização condicional não encontra o professor", async () => {
  const fixture = makeFixture({
    authUser: { id: "auth-gestor", email: professor.email },
    systemUser: {
      id: "gestor-1",
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    },
    linkedPartner: null,
  });

  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error, /mudou durante a operação/i);
  assert.deepEqual(fixture.linkedPayloads, [{
    auth_user_id: "auth-gestor",
    auth_login_email: professorEmail,
  }]);
});
