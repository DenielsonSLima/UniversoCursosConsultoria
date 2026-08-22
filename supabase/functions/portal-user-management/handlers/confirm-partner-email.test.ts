import assert from "node:assert/strict";
import { handleConfirmPartnerEmail } from "./confirm-partner-email.ts";
import type { HandlerContext, Partner } from "../types.ts";

const GESTOR_AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";

const makeFixture = (options: { auditFailureAt?: number | null } = {}) => {
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  let auditCount = 0;
  const authUser = {
    id: "auth-1",
    email: "aluno@example.com",
    app_metadata: { provider: "email" },
    user_metadata: { partner_id: "partner-1" },
  };
  const admin = {
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: authUser }, error: null }),
      },
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "portal_identidade_termos_versao_vigente") {
        return { data: "2026-08-05", error: null };
      }
      if (name === "portal_validar_email_aluno_por_gestor") {
        return { data: true, error: null };
      }
      return { data: null, error: { message: `RPC inesperada: ${name}` } };
    },
    from: (table: string) => {
      if (table === "sistema_eventos") {
        return {
          insert: async (row: Record<string, unknown>) => {
            auditCount += 1;
            audits.push(row);
            if (options.auditFailureAt === auditCount) {
              return { error: { message: "auditoria indisponível" } };
            }
            return { error: null };
          },
        };
      }
      const query: any = {
        eq: () => query,
        neq: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      return { select: () => query };
    },
  };

  const context: HandlerContext = {
    admin,
    gestor: {
      id: "gestor-1",
      nome: "Gestor de teste",
      auth_user_id: GESTOR_AUTH_USER_ID,
    },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
  };
  return { context, rpcCalls, audits };
};

const partner: Partner = {
  id: "partner-1",
  tipo: "Aluno",
  nome: "Aluno Teste",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  auth_user_id: "auth-1",
  acesso_status: "convite_enviado",
  troca_senha_obrigatoria: true,
};

Deno.test("gestor registra validação administrativa do e-mail sem confirmar o Auth isoladamente", async () => {
  const fixture = makeFixture();

  const response = await handleConfirmPartnerEmail(
    fixture.context,
    partner,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.emailConfirmed, false);
  assert.equal(body.emailValidatedByManager, true);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_termos_versao_vigente",
      "portal_validar_email_aluno_por_gestor",
    ],
  );
  assert.deepEqual(fixture.rpcCalls[1].args, {
    p_partner_id: "partner-1",
    p_actor_auth_user_id: GESTOR_AUTH_USER_ID,
  });
  assert.equal(fixture.audits.length, 1);
  assert.deepEqual(fixture.audits[0].detalhes, {
    confirmationMethod: "manager_validated_contact",
  });
});

Deno.test("relata confirmação do aluno apenas por email_confirmed_at", async () => {
  const fixture = makeFixture();
  fixture.context.admin.auth.admin.getUserById = async () => ({
    data: {
      user: {
        id: "auth-1",
        email: "aluno@example.com",
        confirmed_at: "2026-08-21T12:00:00.000Z",
        app_metadata: {},
        user_metadata: { partner_id: "partner-1" },
      },
    },
    error: null,
  });

  const response = await handleConfirmPartnerEmail(
    fixture.context,
    partner,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.emailConfirmed, false);
});

Deno.test("recusa validação manual sem declaração explícita do gestor", async () => {
  const fixture = makeFixture();

  const response = await handleConfirmPartnerEmail(
    fixture.context,
    partner,
    false,
  );

  assert.equal(response.status, 422);
  assert.equal(fixture.rpcCalls.length, 0);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("não valida quando a identidade Auth diverge do e-mail canônico", async () => {
  const fixture = makeFixture();
  fixture.context.admin.auth.admin.getUserById = async () => ({
    data: {
      user: {
        id: "auth-1",
        email: "outro@example.com",
        app_metadata: {},
      },
    },
    error: null,
  });

  const response = await handleConfirmPartnerEmail(
    fixture.context,
    partner,
    true,
  );

  assert.equal(response.status, 409);
  assert.equal(fixture.rpcCalls.length, 0);
  assert.equal(fixture.audits.length, 0);
});

Deno.test("não valida antes da auditoria prévia e permite uma nova tentativa", async () => {
  const fixture = makeFixture({ auditFailureAt: 1 });

  const first = await handleConfirmPartnerEmail(fixture.context, partner, true);
  const second = await handleConfirmPartnerEmail(
    fixture.context,
    partner,
    true,
  );

  assert.equal(first.status, 500);
  assert.equal(second.status, 200);
  assert.equal(fixture.audits.length, 2);
  assert.equal(
    fixture.rpcCalls.filter((call) =>
      call.name === "portal_validar_email_aluno_por_gestor"
    ).length,
    1,
  );
});
