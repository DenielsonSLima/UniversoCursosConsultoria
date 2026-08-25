import assert from "node:assert/strict";
import { handleEnsureProfessorAccess } from "./ensure-professor-access.ts";
import type { HandlerContext, Partner } from "../types.ts";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "professor@example.com";
const PROOF = "a".repeat(64);

const professor: Partner = {
  id: PARTNER_ID,
  tipo: "Professor",
  nome: "Professor Teste",
  status: "ATIVO",
  email: EMAIL,
  cpf_cnpj: "123.456.789-09",
};

const inviteMetadata = (proof = PROOF) => ({
  origem: "cadastro_professor",
  tipo: "Professor",
  partner_id: PARTNER_ID,
  invite_operation_version: "v1",
  invite_operation_actor: ACTOR_ID,
  invite_operation_nonce: REQUEST_ID,
  invite_operation_proof: proof,
});

const invitedAuthUser = (proof = PROOF) => ({
  id: "auth-invited",
  email: EMAIL,
  user_metadata: inviteMetadata(proof),
});

type FixtureOptions = {
  authUsersByCall: Array<Array<Record<string, unknown>>>;
  rpcUnavailable?: boolean;
  inviteError?: { message: string } | null;
  listUsersError?: { code?: string; message: string } | null;
  listUsersThrow?: Error;
  currentPartnerError?: { code?: string; message: string } | null;
};

type RowsResult = { data: never[]; error: null };
type RowsQuery = {
  eq: () => RowsQuery;
  limit: () => RowsResult;
};
type ConflictQuery = {
  eq: () => ConflictQuery;
  neq: () => ConflictQuery;
  limit: () => RowsResult;
};
type CurrentPartnerQuery = {
  eq: () => CurrentPartnerQuery;
  maybeSingle: () => {
    data: Record<string, unknown> | null;
    error: { code?: string; message: string } | null;
  };
};
type UpdateQuery = {
  eq: () => UpdateQuery;
  is: () => UpdateQuery;
  select: () => UpdateQuery;
  maybeSingle: () => {
    data: Record<string, unknown>;
    error: null;
  };
};

const makeFixture = (options: FixtureOptions) => {
  let listUsersCalls = 0;
  let inviteCalls = 0;
  const linkedPayloads: Array<Record<string, unknown>> = [];

  const emptyRows = () => ({ data: [], error: null });
  const admin = {
    rpc: () =>
      options.rpcUnavailable
        ? { data: null, error: { message: "RPC indisponível" } }
        : { data: PROOF, error: null },
    from: (table: string) => {
      if (table === "usuarios_sistema" || table === "responsaveis_legais") {
        return {
          select: () => {
            const query: RowsQuery = {
              eq: () => query,
              limit: emptyRows,
            };
            return query;
          },
        };
      }

      if (table !== "parceiros") {
        throw new Error(`Tabela inesperada: ${table}`);
      }
      return {
        select: (columns: string) => {
          if (columns.includes("status")) {
            const query: CurrentPartnerQuery = {
              eq: () => query,
              maybeSingle: () =>
                options.currentPartnerError
                  ? { data: null, error: options.currentPartnerError }
                  : {
                    data: {
                      id: PARTNER_ID,
                      tipo: "Professor",
                      status: "ATIVO",
                      email: EMAIL,
                      auth_user_id: null,
                      auth_login_email: null,
                    },
                    error: null,
                  },
            };
            return query;
          }
          const query: ConflictQuery = {
            eq: () => query,
            neq: () => query,
            limit: emptyRows,
          };
          return query;
        },
        update: (payload: Record<string, unknown>) => {
          linkedPayloads.push(payload);
          const query: UpdateQuery = {
            eq: () => query,
            is: () => query,
            select: () => query,
            maybeSingle: () => ({
              data: { id: PARTNER_ID, ...payload },
              error: null,
            }),
          };
          return query;
        },
      };
    },
    auth: {
      admin: {
        listUsers: () => {
          if (options.listUsersThrow) throw options.listUsersThrow;
          const users = options.authUsersByCall[listUsersCalls] || [];
          listUsersCalls += 1;
          return {
            data: { users },
            error: options.listUsersError || null,
          };
        },
        inviteUserByEmail: () => {
          inviteCalls += 1;
          return options.inviteError
            ? { data: { user: null }, error: options.inviteError }
            : {
              data: { user: invitedAuthUser() },
              error: null,
            };
        },
      },
    },
  };

  const context = {
    admin,
    gestor: {
      id: "gestor-session",
      auth_user_id: ACTOR_ID,
      context: "global",
      polo_ids: [],
      permissoes: {
        modules: ["parceiros"],
        financeiroTabs: [],
        allPolos: true,
        tabs: {},
      },
    },
    gestorEmail: "gestor@example.com",
    json: (payload: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
  } as HandlerContext;

  return {
    context,
    linkedPayloads,
    inviteCalls: () => inviteCalls,
    listUsersCalls: () => listUsersCalls,
  };
};

Deno.test("retry reconcilia convite HMAC válido sem enviar novo convite", async () => {
  const fixture = makeFixture({ authUsersByCall: [[invitedAuthUser()]] });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, false);
  assert.equal(body.institutionalAccessPending, true);
  assert.equal(body.userId, "auth-invited");
  assert.equal(fixture.inviteCalls(), 0);
  assert.equal(
    fixture.linkedPayloads[0].primeiro_acesso_institucional_operacao_id,
    REQUEST_ID,
  );
});

Deno.test("retry rejeita HMAC incompatível sem vincular ou convidar", async () => {
  const fixture = makeFixture({
    authUsersByCall: [[invitedAuthUser("b".repeat(64))]],
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /sem vínculo seguro/i);
  assert.equal(fixture.inviteCalls(), 0);
  assert.deepEqual(fixture.linkedPayloads, []);
});

Deno.test("retry falha fechado quando RPC de prova está indisponível", async () => {
  const fixture = makeFixture({
    authUsersByCall: [[invitedAuthUser()]],
    rpcUnavailable: true,
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /validar a prova segura/i);
  assert.equal(fixture.inviteCalls(), 0);
  assert.deepEqual(fixture.linkedPayloads, []);
});

Deno.test("erro de invite reconcilia Auth reconsultado com HMAC válido", async () => {
  const fixture = makeFixture({
    authUsersByCall: [[], [invitedAuthUser()]],
    inviteError: { message: "resposta do convite perdida" },
  });
  const response = await handleEnsureProfessorAccess(
    fixture.context,
    professor,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.inviteSent, false);
  assert.equal(body.institutionalAccessPending, true);
  assert.equal(fixture.inviteCalls(), 1);
  assert.equal(fixture.listUsersCalls(), 2);
  assert.equal(
    fixture.linkedPayloads[0].primeiro_acesso_institucional_operacao_id,
    REQUEST_ID,
  );
});

Deno.test("não expõe detalhes hostis de Auth, Error ou PostgREST", async () => {
  const rawFailure = "db-host.internal token=segredo-operacional";
  const fixtures = [
    makeFixture({
      authUsersByCall: [],
      listUsersThrow: new Error(rawFailure),
    }),
    makeFixture({
      authUsersByCall: [[invitedAuthUser()]],
      currentPartnerError: { code: "XX000", message: rawFailure },
    }),
    makeFixture({
      authUsersByCall: [[], []],
      inviteError: { message: rawFailure },
    }),
  ];

  for (const fixture of fixtures) {
    const response = await handleEnsureProfessorAccess(
      fixture.context,
      professor,
    );
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(body), /db-host|segredo-operacional/);
  }
});
