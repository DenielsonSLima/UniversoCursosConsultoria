import assert from "node:assert/strict";
import { handleConfirmResponsavelEmail } from "./confirm-responsavel-email.ts";
import type { HandlerContext } from "../types.ts";

const RESPONSAVEL_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "responsavel@example.com";

const basePrepared = {
  responsavelLegalId: RESPONSAVEL_ID,
  nome: "Responsável Teste",
  cpf: "52998224725",
  email: EMAIL,
  status: "ATIVO",
  authUserId: AUTH_ID,
  eligible: true,
  accessBlockReason: null,
  firstAccessPending: true,
};

const makeFixture = (options: {
  prepared?: Record<string, unknown>;
  prepareError?: { code?: string; message: string };
  authUser?: Record<string, unknown> | null;
  auditError?: boolean;
  validationError?: { code?: string; message: string };
} = {}) => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "responsavel_legal_acesso_preparar") {
        return options.prepareError
          ? { data: null, error: options.prepareError }
          : { data: options.prepared || basePrepared, error: null };
      }
      if (name === "portal_validar_email_responsavel_por_gestor") {
        return { data: true, error: options.validationError || null };
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: options.authUser === undefined
              ? { id: AUTH_ID, email: EMAIL }
              : options.authUser,
          },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      assert.equal(table, "sistema_eventos");
      return {
        insert: async (row: Record<string, unknown>) => {
          audits.push(row);
          return {
            error: options.auditError
              ? { message: "auditoria indisponível" }
              : null,
          };
        },
      };
    },
  };
  const context: HandlerContext = {
    admin,
    gestor: { id: "gestor-1", nome: "Gestor", auth_user_id: ACTOR_ID },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  };
  return { context, rpcCalls, audits };
};

Deno.test("confirma e-mail do responsável após revalidar identidade e auditar", async () => {
  const fixture = makeFixture();
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    action: "confirm-responsavel-email",
    userId: AUTH_ID,
    emailConfirmed: false,
    emailValidatedByManager: true,
    message:
      "E-mail validado pelo gestor. Agora você pode gerar uma senha temporária.",
  });
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "responsavel_legal_acesso_preparar",
      "portal_validar_email_responsavel_por_gestor",
    ],
  );
  assert.equal(
    fixture.rpcCalls[1].args.p_responsavel_legal_id,
    RESPONSAVEL_ID,
  );
  assert.equal(fixture.rpcCalls[1].args.p_actor_auth_user_id, ACTOR_ID);
  assert.equal(fixture.audits.length, 1);
  assert.equal(fixture.audits[0].entidade, "responsaveis_legais");
});

Deno.test("relata confirmação apenas por email_confirmed_at", async () => {
  const fixture = makeFixture({
    authUser: {
      id: AUTH_ID,
      email: EMAIL,
      confirmed_at: "2026-08-21T12:00:00.000Z",
    },
  });
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.emailConfirmed, false);
});

Deno.test("exige confirmação explícita antes de consultar cadastro ou Auth", async () => {
  const fixture = makeFixture();
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    false,
  );

  assert.equal(response.status, 422);
  assert.equal(fixture.rpcCalls.length, 0);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("mantém confirmação segregada para gestor global ou matriz", async () => {
  const fixture = makeFixture({
    prepareError: {
      code: "42501",
      message: "GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO",
    },
  });
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "RESPONSAVEL_ACESSO_NAO_AUTORIZADO");
  assert.doesNotMatch(JSON.stringify(body), /GESTOR_GLOBAL_OU_MATRIZ/i);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("não valida no banco quando a auditoria obrigatória falha", async () => {
  const fixture = makeFixture({ auditError: true });
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    true,
  );

  assert.equal(response.status, 500);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    ["responsavel_legal_acesso_preparar"],
  );
});

Deno.test("falha fechada quando e-mail do Auth diverge do cadastro canônico", async () => {
  const fixture = makeFixture({
    authUser: { id: AUTH_ID, email: "outra-pessoa@example.com" },
  });
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /não corresponde/i);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("não permite reabrir primeiro acesso já concluído", async () => {
  const fixture = makeFixture({
    prepared: { ...basePrepared, firstAccessPending: false },
  });
  const response = await handleConfirmResponsavelEmail(
    fixture.context,
    RESPONSAVEL_ID,
    true,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.audits.length, 0);
});
