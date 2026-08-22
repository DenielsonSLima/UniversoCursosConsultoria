import assert from "node:assert/strict";
import { handleListResponsavelAccessStatuses } from "./list-responsavel-access-statuses.ts";
import type { HandlerContext } from "../types.ts";

const RESPONSAVEL_A = "11111111-1111-4111-8111-111111111111";
const RESPONSAVEL_B = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const AUTH_A = "44444444-4444-4444-8444-444444444444";

const makeFixture = (options: {
  prepared?: Record<string, Record<string, unknown>>;
  prepareErrorFor?: string;
  authUsers?: Array<Record<string, unknown>>;
} = {}) => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let authListCalls = 0;
  const defaultPrepared: Record<string, Record<string, unknown>> = {
    [RESPONSAVEL_A]: {
      responsavelLegalId: RESPONSAVEL_A,
      nome: "Responsável A",
      cpf: "52998224725",
      email: "a@example.com",
      status: "ATIVO",
      authUserId: AUTH_A,
      eligible: true,
      accessBlockReason: null,
      emailValidatedByManager: true,
      temporaryPasswordPending: true,
      temporaryPasswordAllowed: true,
      requiresPasswordChange: true,
      termsAccepted: false,
      currentTermsVersion: "2026-08-21",
      firstAccessPending: true,
    },
    [RESPONSAVEL_B]: {
      responsavelLegalId: RESPONSAVEL_B,
      nome: "Responsável B",
      cpf: "12345678909",
      email: null,
      status: "ATIVO",
      authUserId: null,
      eligible: false,
      accessBlockReason: "EMAIL_OBRIGATORIO",
      emailValidatedByManager: false,
      temporaryPasswordPending: false,
      temporaryPasswordAllowed: false,
      requiresPasswordChange: true,
      termsAccepted: false,
      currentTermsVersion: "2026-08-21",
      firstAccessPending: true,
    },
  };
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      assert.equal(name, "responsavel_legal_acesso_preparar");
      const id = String(args.p_responsavel_legal_id);
      if (options.prepareErrorFor === id) {
        return {
          data: null,
          error: { code: "42501", message: "fora do escopo interno" },
        };
      }
      return {
        data: (options.prepared || defaultPrepared)[id],
        error: null,
      };
    },
    auth: {
      admin: {
        listUsers: async () => {
          authListCalls += 1;
          return {
            data: {
              users: options.authUsers || [{
                id: AUTH_A,
                email: "a@example.com",
                email_confirmed_at: "2026-08-21T12:00:00.000Z",
              }],
            },
            error: null,
          };
        },
      },
    },
  };
  const context: HandlerContext = {
    admin,
    gestor: { auth_user_id: ACTOR_ID },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  };
  return { context, rpcCalls, authListCalls: () => authListCalls };
};

Deno.test("lista estados completos do primeiro acesso do responsável", async () => {
  const fixture = makeFixture();
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A, RESPONSAVEL_B],
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.action, "list-responsavel-access-statuses");
  assert.deepEqual(body.statuses, [
    {
      responsavelLegalId: RESPONSAVEL_A,
      status: "confirmed",
      authUserExists: true,
      emailConfirmed: true,
      emailValidatedByManager: true,
      temporaryPasswordPending: true,
      temporaryPasswordAllowed: true,
      requiresPasswordChange: true,
      termsAccepted: false,
      currentTermsVersion: "2026-08-21",
      firstAccessPending: true,
    },
    {
      responsavelLegalId: RESPONSAVEL_B,
      status: "no_email",
      authUserExists: false,
      emailConfirmed: false,
      emailValidatedByManager: false,
      temporaryPasswordPending: false,
      temporaryPasswordAllowed: false,
      requiresPasswordChange: true,
      termsAccepted: false,
      currentTermsVersion: "2026-08-21",
      firstAccessPending: true,
    },
  ]);
  assert.equal(fixture.rpcCalls.length, 2);
  assert.equal(
    fixture.rpcCalls.every((call) =>
      call.args.p_actor_auth_user_id === ACTOR_ID
    ),
    true,
  );
});

Deno.test("não usa e-mail como fallback quando auth_user_id canônico sumiu", async () => {
  const fixture = makeFixture({
    authUsers: [{
      id: "55555555-5555-4555-8555-555555555555",
      email: "a@example.com",
      email_confirmed_at: "2026-08-21T12:00:00.000Z",
    }],
  });
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A],
  );
  const body = await response.json();

  assert.equal(body.statuses[0].status, "no_auth_user");
  assert.equal(body.statuses[0].authUserExists, false);
});

Deno.test("não trata confirmed_at como confirmação de e-mail do responsável", async () => {
  const fixture = makeFixture({
    authUsers: [{
      id: AUTH_A,
      email: "a@example.com",
      confirmed_at: "2026-08-21T12:00:00.000Z",
    }],
  });
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A],
  );
  const body = await response.json();

  assert.equal(body.statuses[0].status, "pending");
  assert.equal(body.statuses[0].emailConfirmed, false);
});

Deno.test("omite indicadores que a RPC ainda não conseguiu calcular", async () => {
  const fixture = makeFixture({
    prepared: {
      [RESPONSAVEL_A]: {
        responsavelLegalId: RESPONSAVEL_A,
        nome: "Responsável A",
        cpf: "52998224725",
        email: "a@example.com",
        status: "ATIVO",
        authUserId: AUTH_A,
        eligible: true,
        accessBlockReason: null,
      },
    },
  });
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A],
  );
  const body = await response.json();

  const status = body.statuses[0];
  assert.equal(status.status, "confirmed");
  assert.equal("emailValidatedByManager" in status, false);
  assert.equal("temporaryPasswordPending" in status, false);
  assert.equal("temporaryPasswordAllowed" in status, false);
  assert.equal("requiresPasswordChange" in status, false);
  assert.equal("termsAccepted" in status, false);
  assert.equal("currentTermsVersion" in status, false);
  assert.equal("firstAccessPending" in status, false);
});

Deno.test("preserva primeiro acesso pendente por termos após senha normal criada", async () => {
  const fixture = makeFixture({
    prepared: {
      [RESPONSAVEL_A]: {
        responsavelLegalId: RESPONSAVEL_A,
        nome: "Responsável A",
        cpf: "52998224725",
        email: "a@example.com",
        status: "ATIVO",
        authUserId: AUTH_A,
        eligible: true,
        accessBlockReason: null,
        emailValidatedByManager: false,
        temporaryPasswordPending: false,
        requiresPasswordChange: false,
        termsAccepted: false,
        currentTermsVersion: "2026-08-21",
        firstAccessPending: true,
      },
    },
  });
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A],
  );
  const body = await response.json();

  assert.equal(body.statuses[0].requiresPasswordChange, false);
  assert.equal(body.statuses[0].termsAccepted, false);
  assert.equal(body.statuses[0].firstAccessPending, true);
});

Deno.test("rejeita lote acima de 500 antes de consultar o banco", async () => {
  const fixture = makeFixture();
  const ids = Array.from(
    { length: 501 },
    (_, index) =>
      `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
  );
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    ids,
  );

  assert.equal(response.status, 400);
  assert.equal(fixture.rpcCalls.length, 0);
  assert.equal(fixture.authListCalls(), 0);
});

Deno.test("rejeita identificador inválido sem consulta parcial", async () => {
  const fixture = makeFixture();
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A, "invalido"],
  );

  assert.equal(response.status, 400);
  assert.equal(fixture.rpcCalls.length, 0);
});

Deno.test("falha o lote inteiro quando um responsável está fora do escopo", async () => {
  const fixture = makeFixture({ prepareErrorFor: RESPONSAVEL_B });
  const response = await handleListResponsavelAccessStatuses(
    fixture.context,
    [RESPONSAVEL_A, RESPONSAVEL_B],
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.doesNotMatch(JSON.stringify(body), /fora do escopo interno/i);
  assert.equal(fixture.authListCalls(), 0);
});
