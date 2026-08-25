/// <reference lib="deno.ns" />

import assert from "node:assert/strict";
import { handleLinkProfessorAuthIdentity } from "./link-professor-auth-identity.ts";
import type { HandlerContext, Partner } from "../types.ts";

const EMAIL = "pessoa@example.com";
const CPF = "52998224725";
const AUTH_ID = "11111111-1111-4111-8111-111111111111";

const professor: Partner = {
  id: "professor-1",
  tipo: "Professor",
  nome: "Pessoa Teste",
  status: "ATIVO",
  email: EMAIL,
  cpf_cnpj: CPF,
};

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), { status });

type FixtureOptions = {
  global?: boolean;
  configurationAccess?: boolean;
  authUsers?: Array<Record<string, unknown>>;
  authUserById?: Record<string, unknown> | null;
  rows?: Record<string, Array<Record<string, unknown>>>;
  linkedPartner?: Record<string, unknown> | null;
  linkError?: { code?: string; message: string } | null;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const linkedPayloads: Array<Record<string, unknown>> = [];
  let listUsersCalls = 0;
  let getUserCalls = 0;
  let inviteCalls = 0;
  let recoveryCalls = 0;
  let passwordCalls = 0;
  const authUser = { id: AUTH_ID, email: EMAIL };
  const rows = options.rows || {
    usuarios_sistema: [{ id: "gestor-1", cpf: CPF, email: EMAIL }],
  };

  const admin = {
    from: (table: string) => ({
      select: () => {
        const query: any = {
          eq: () => query,
          neq: () => query,
          limit: async () => ({ data: rows[table] || [], error: null }),
        };
        return query;
      },
      update: (payload: Record<string, unknown>) => {
        linkedPayloads.push(payload);
        const query: any = {
          eq: () => query,
          is: () => query,
          select: () => query,
          maybeSingle: async () =>
            options.linkError ? { data: null, error: options.linkError } : {
              data: options.linkedPartner === undefined
                ? { id: professor.id, ...payload }
                : options.linkedPartner,
              error: null,
            },
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
              users: options.authUsers === undefined
                ? [authUser]
                : options.authUsers,
            },
            error: null,
          };
        },
        getUserById: async () => {
          getUserCalls += 1;
          return {
            data: {
              user: options.authUserById === undefined
                ? authUser
                : options.authUserById,
            },
            error: null,
          };
        },
        inviteUserByEmail: async () => {
          inviteCalls += 1;
          throw new Error("convite não permitido no vínculo");
        },
        generateLink: async () => {
          recoveryCalls += 1;
          throw new Error("recovery não permitido no vínculo");
        },
        updateUserById: async () => {
          passwordCalls += 1;
          throw new Error("senha não pode ser alterada no vínculo");
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
    counts: () => ({
      listUsersCalls,
      getUserCalls,
      inviteCalls,
      recoveryCalls,
      passwordCalls,
    }),
  };
};

const expectSafeLink = async (
  rows: Record<string, Array<Record<string, unknown>>>,
) => {
  const fixture = makeFixture({ rows });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.profileLinked, true);
  assert.equal(body.userId, AUTH_ID);
  assert.equal(body.institutionalAccessPending, false);
  assert.match(body.message, /senha atual foi preservada/i);
  assert.deepEqual(fixture.linkedPayloads, [{
    auth_user_id: AUTH_ID,
    auth_login_email: EMAIL,
    acesso_institucional_origem: "IDENTIDADE_EXISTENTE",
    primeiro_acesso_institucional_pendente: false,
    primeiro_acesso_institucional_operacao_id: null,
  }]);
  assert.deepEqual(fixture.counts(), {
    listUsersCalls: 1,
    getUserCalls: 0,
    inviteCalls: 0,
    recoveryCalls: 0,
    passwordCalls: 0,
  });
};

Deno.test("vincula Professor ao Auth de Gestor com CPF e e-mail canônicos", async () => {
  await expectSafeLink({
    usuarios_sistema: [{ id: "gestor-1", cpf: CPF, email: EMAIL }],
  });
});

Deno.test("vincula Professor ao Auth de Aluno com papel oposto", async () => {
  await expectSafeLink({
    parceiros: [{
      id: "aluno-1",
      tipo: "Aluno",
      cpf_cnpj: CPF,
      email: "contato-aluno@example.com",
      auth_login_email: EMAIL,
    }],
  });
});

Deno.test("vincula Professor ao Auth de Responsável compatível", async () => {
  await expectSafeLink({
    responsaveis_legais: [{
      id: "responsavel-1",
      cpf_normalizado: CPF,
      email: EMAIL,
    }],
  });
});

Deno.test("mantém Professor pendente quando a senha existente ainda não foi concluída", async () => {
  const fixture = makeFixture({
    rows: {
      parceiros: [{
        id: "aluno-1",
        tipo: "Aluno",
        cpf_cnpj: CPF,
        email: EMAIL,
      }],
    },
    linkedPartner: {
      id: professor.id,
      auth_user_id: AUTH_ID,
      primeiro_acesso_institucional_pendente: true,
    },
  });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, true);
  assert.equal(body.institutionalAccessPending, true);
  assert.match(body.message, /permanece pendente/i);
  assert.deepEqual(fixture.counts(), {
    listUsersCalls: 1,
    getUserCalls: 0,
    inviteCalls: 0,
    recoveryCalls: 0,
    passwordCalls: 0,
  });
});

Deno.test("recusa quando qualquer perfil do UID diverge", async () => {
  const fixture = makeFixture({
    rows: {
      usuarios_sistema: [{ id: "gestor-1", cpf: CPF, email: EMAIL }],
      responsaveis_legais: [{
        id: "responsavel-1",
        cpf_normalizado: "11111111111",
        email: EMAIL,
      }],
    },
  });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /responsável legal/i);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("recusa outro Professor mesmo com CPF e e-mail iguais", async () => {
  const fixture = makeFixture({
    rows: {
      parceiros: [{
        id: "professor-2",
        tipo: "Professor",
        cpf_cnpj: CPF,
        email: EMAIL,
      }],
    },
  });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /mesmo papel/i);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não adota Auth órfão localizado somente por e-mail", async () => {
  const fixture = makeFixture({ rows: {} });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinked, false);
  assert.equal(body.profileLinkState, "no_matching_gestor");
  assert.match(body.message, /não possui outro perfil canônico/i);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("exige gestor global com Configurações antes de consultar Auth", async () => {
  const fixture = makeFixture({ global: false });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinkState, "requires_global_configuration_access");
  assert.deepEqual(fixture.counts(), {
    listUsersCalls: 0,
    getUserCalls: 0,
    inviteCalls: 0,
    recoveryCalls: 0,
    passwordCalls: 0,
  });
});

Deno.test("vínculo já existente também é validado de forma fail-closed", async () => {
  const fixture = makeFixture({
    rows: {
      parceiros: [{
        id: "professor-2",
        tipo: "Professor",
        cpf_cnpj: CPF,
        email: EMAIL,
      }],
    },
  });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    { ...professor, auth_user_id: AUTH_ID, auth_login_email: EMAIL },
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /mesmo papel/i);
  assert.equal(fixture.counts().getUserCalls, 1);
});

Deno.test("recusa concorrência quando o update condicional não encontra perfil", async () => {
  const fixture = makeFixture({ linkedPartner: null });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /mudou durante a operação/i);
});

Deno.test("trata divergência canônica do trigger como conflito de identidade", async () => {
  const fixture = makeFixture({
    linkError: {
      code: "23514",
      message: "PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE",
    },
  });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.doesNotMatch(JSON.stringify(body), /PORTAL_IDENTIDADE/);
});

Deno.test("trata deadlock do vínculo como conflito transitório sanitizado", async () => {
  const fixture = makeFixture({
    linkError: {
      code: "40P01",
      message: "deadlock detected: PORTAL_IDENTIDADE_INTERNA",
    },
  });
  const response = await handleLinkProfessorAuthIdentity(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /mudou durante a operação|tente novamente/i);
  assert.doesNotMatch(JSON.stringify(body), /deadlock|PORTAL_IDENTIDADE/i);
});
