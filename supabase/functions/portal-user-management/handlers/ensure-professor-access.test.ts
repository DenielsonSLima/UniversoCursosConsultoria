import assert from "node:assert/strict";
import { handleEnsureProfessorAccess } from "./ensure-professor-access.ts";
import type { HandlerContext, Partner } from "../types.ts";

const responder = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const professorEmail = "professor@example.com";
const gestorAuthUserId = "11111111-1111-4111-8111-111111111111";
const professor: Partner = {
  id: "22222222-2222-4222-8222-222222222222",
  tipo: "Professor",
  nome: "Professor Teste",
  status: "ATIVO",
  email: professorEmail,
  cpf_cnpj: "123.456.789-09",
};

type FixtureOptions = {
  authUsers?: Array<Record<string, unknown>>;
  authUserById?: Record<string, unknown> | null;
  systemAuthConflicts?: Array<Record<string, unknown>>;
  responsavelConflicts?: Array<Record<string, unknown>>;
  partnerConflicts?: Array<Record<string, unknown>>;
  partnerConflictsAfterBinding?: Array<Record<string, unknown>>;
  currentPartner?: Record<string, unknown> | null;
  bindingResult?: Record<string, unknown> | null;
  bindingError?: { code?: string; message: string } | null;
  deleteAuthError?: { message: string } | null;
  invitedAuthUser?: Record<string, unknown> | null;
};

type RowsResult = {
  data: Array<Record<string, unknown>>;
  error: null;
};

type CurrentPartnerResult = {
  data: Record<string, unknown> | null;
  error: null;
};

type CurrentPartnerQuery = {
  eq: () => CurrentPartnerQuery;
  maybeSingle: () => CurrentPartnerResult;
};

type PartnerConflictQuery = {
  eq: () => PartnerConflictQuery;
  neq: () => PartnerConflictQuery;
  limit: () => RowsResult;
};

type PartnerUpdateResult = {
  data: Record<string, unknown> | null;
  error: { code?: string; message: string } | null;
};

type PartnerUpdateQuery = {
  eq: () => PartnerUpdateQuery;
  is: () => PartnerUpdateQuery;
  select: () => PartnerUpdateQuery;
  maybeSingle: () => PartnerUpdateResult;
};

const makeFixture = (options: FixtureOptions = {}) => {
  const invitedAuthPayloads: Array<Record<string, unknown>> = [];
  const linkedPayloads: Array<Record<string, unknown>> = [];
  const deletedAuthUserIds: string[] = [];
  let listUsersCalls = 0;
  let getAuthUserCalls = 0;
  let partnerConflictQueries = 0;

  const admin = {
    rpc: () => ({ data: "a".repeat(64), error: null }),
    from: (table: string) => {
      if (table === "usuarios_sistema") {
        return {
          select: () => {
            const query: any = {
              eq: () => query,
              limit: () => ({
                data: options.systemAuthConflicts || [],
                error: null,
              }),
            };
            return query;
          },
        };
      }

      if (table === "parceiros") {
        return {
          select: (columns: string) => {
            if (columns.includes("status")) {
              const currentQuery: CurrentPartnerQuery = {
                eq: () => currentQuery,
                maybeSingle: () => ({
                  data: options.currentPartner === undefined
                    ? {
                      id: professor.id,
                      tipo: professor.tipo,
                      status: professor.status,
                      email: professor.email,
                      auth_user_id: null,
                      auth_login_email: null,
                    }
                    : options.currentPartner,
                  error: null,
                }),
              };
              return currentQuery;
            }

            const conflictQuery: PartnerConflictQuery = {
              eq: () => conflictQuery,
              neq: () => conflictQuery,
              limit: () => {
                partnerConflictQueries += 1;
                return {
                  data: partnerConflictQueries > 1
                    ? options.partnerConflictsAfterBinding ||
                      options.partnerConflicts || []
                    : options.partnerConflicts || [],
                  error: null,
                };
              },
            };
            return conflictQuery;
          },
          update: (payload: Record<string, unknown>) => {
            linkedPayloads.push(payload);
            const updateQuery: PartnerUpdateQuery = {
              eq: () => updateQuery,
              is: () => updateQuery,
              select: () => updateQuery,
              maybeSingle: () =>
                options.bindingError
                  ? { data: null, error: options.bindingError }
                  : {
                    data: options.bindingResult === undefined
                      ? { id: professor.id, ...payload }
                      : options.bindingResult,
                    error: null,
                  },
            };
            return updateQuery;
          },
        };
      }

      if (table === "responsaveis_legais") {
        return {
          select: () => {
            const query: any = {
              eq: () => query,
              limit: () => ({
                data: options.responsavelConflicts || [],
                error: null,
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
        listUsers: () => {
          listUsersCalls += 1;
          return { data: { users: options.authUsers || [] }, error: null };
        },
        inviteUserByEmail: (
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
        getUserById: () => {
          getAuthUserCalls += 1;
          return {
            data: {
              user: options.authUserById === undefined
                ? { id: "auth-existing", email: professorEmail }
                : options.authUserById,
            },
            error: null,
          };
        },
        deleteUser: (authUserId: string) => {
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
      auth_user_id: gestorAuthUserId,
      context: "global",
      polo_ids: [],
      permissoes: {
        modules: ["parceiros", "configuracoes"],
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
    invitedAuthPayloads,
    linkedPayloads,
    deletedAuthUserIds,
    listUsersCalls: () => listUsersCalls,
    getAuthUserCalls: () => getAuthUserCalls,
  };
};

Deno.test("envia convite novo e vincula o Auth ao professor de forma condicional", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, true);
  assert.equal(body.userId, "auth-invited");
  assert.equal(fixture.invitedAuthPayloads.length, 1);
  assert.equal(fixture.invitedAuthPayloads[0].email, professorEmail);
  const inviteData = fixture.invitedAuthPayloads[0].data as Record<
    string,
    unknown
  >;
  assert.deepEqual(inviteData, {
    nome: professor.nome,
    origem: "cadastro_professor",
    tipo: "Professor",
    partner_id: professor.id,
    invite_operation_version: "v1",
    invite_operation_actor: gestorAuthUserId,
    invite_operation_nonce: inviteData.invite_operation_nonce,
    invite_operation_proof: "a".repeat(64),
  });
  const invitationNonce = fixture.linkedPayloads[0]
    .primeiro_acesso_institucional_operacao_id;
  assert.equal(typeof invitationNonce, "string");
  assert.ok(String(invitationNonce).length >= 20);
  assert.equal(
    fixture.invitedAuthPayloads[0].redirectTo,
    "https://universocc.com.br/recuperar-senha",
  );
  assert.deepEqual(fixture.linkedPayloads, [{
    auth_user_id: "auth-invited",
    auth_login_email: professorEmail,
    acesso_institucional_origem: "CONVITE",
    primeiro_acesso_institucional_pendente: true,
    primeiro_acesso_institucional_operacao_id: invitationNonce,
  }]);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("não cria Auth para professor sem e-mail", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureProfessorAccess(fixture.context, {
    ...professor,
    email: null,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.profileLinkState, "not_eligible");
  assert.equal(fixture.listUsersCalls(), 0);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não cria Auth para professor inativo", async () => {
  const fixture = makeFixture();
  const response = await handleEnsureProfessorAccess(fixture.context, {
    ...professor,
    status: "INATIVO",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profileLinkState, "not_eligible");
  assert.match(body.message, /inativo/i);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
});

Deno.test("não toma posse de Auth existente sem vínculo seguro", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-orphan", email: professorEmail }],
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /sem vínculo seguro/i);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("não usa user_metadata como autorização do retorno do convite", async () => {
  const fixture = makeFixture({
    invitedAuthUser: {
      id: "auth-pendente-de-outro-fluxo",
      email: professorEmail,
      user_metadata: { origem: "outro_fluxo" },
    },
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.match(body.error, /não foi possível comprovar/i);
  assert.equal(fixture.linkedPayloads.length, 0);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("reaproveita somente o Auth institucional com e-mail e CPF coincidentes", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-gestor", email: professorEmail }],
    systemAuthConflicts: [{
      id: "gestor-1",
      email: professorEmail,
      auth_user_id: "auth-gestor",
      cpf: "12345678909",
    }],
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, undefined);
  assert.equal(body.userId, "auth-gestor");
  assert.equal(body.profileLinked, true);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.deepEqual(fixture.linkedPayloads, [{
    auth_user_id: "auth-gestor",
    auth_login_email: professorEmail,
    acesso_institucional_origem: "IDENTIDADE_EXISTENTE",
    primeiro_acesso_institucional_pendente: false,
    primeiro_acesso_institucional_operacao_id: null,
  }]);
});

Deno.test("recusa usuário institucional com CPF divergente sem enviar convite", async () => {
  const fixture = makeFixture({
    authUsers: [{ id: "auth-gestor", email: professorEmail }],
    systemAuthConflicts: [{
      id: "gestor-1",
      email: professorEmail,
      auth_user_id: "auth-gestor",
      cpf: "98765432100",
    }],
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /CPF do professor não confere/i);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
  assert.equal(fixture.linkedPayloads.length, 0);
});

Deno.test("preserva login já vinculado e bloqueia troca de e-mail por este fluxo", async () => {
  const fixture = makeFixture({
    authUserById: { id: "auth-existing", email: professorEmail },
  });
  const response = await handleEnsureProfessorAccess(fixture.context, {
    ...professor,
    auth_user_id: "auth-existing",
    auth_login_email: professorEmail,
    email: "novo-email@example.com",
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /não confere com a identidade/i);
  assert.equal(fixture.getAuthUserCalls(), 1);
  assert.equal(fixture.invitedAuthPayloads.length, 0);
});

Deno.test("preserva Auth convidado se o vínculo condicional falhar", async () => {
  const fixture = makeFixture({
    bindingError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /já pertence a outro parceiro/i);
  assert.match(body.error, /preservada para reconciliação segura/i);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("reverte o convite se e-mail ou status mudar antes do vínculo", async () => {
  const fixture = makeFixture({
    currentPartner: {
      id: professor.id,
      tipo: "Professor",
      status: "INATIVO",
      email: "outro-professor@example.com",
      auth_user_id: null,
      auth_login_email: null,
    },
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /cadastro do professor mudou/i);
  assert.deepEqual(fixture.linkedPayloads, []);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});

Deno.test("não remove Auth convidado se uma operação concorrente mudou sua titularidade", async () => {
  const fixture = makeFixture({
    bindingError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
    partnerConflictsAfterBinding: [{ id: "outro-professor" }],
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /outro parceiro/i);
  assert.deepEqual(fixture.deletedAuthUserIds, []);
});
