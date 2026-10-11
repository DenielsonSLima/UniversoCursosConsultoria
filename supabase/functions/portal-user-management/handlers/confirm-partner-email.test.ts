import assert from "node:assert/strict";
import { handleConfirmPartnerEmail } from "./confirm-partner-email.ts";
import type { HandlerContext, Partner } from "../types.ts";

const GESTOR_AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";

const makeFixture = (options: {
  auditFailureAt?: number | null;
  rpcError?: { code: string; message: string };
  currentPartner?: Partial<Partner>;
  skipAuthConfirmation?: boolean;
  readbackFailure?: boolean;
} = {}) => {
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  let auditCount = 0;
  const authUser = {
    id: "auth-1",
    email: "aluno@example.com",
    email_confirmed_at: null as string | null,
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
      if (name === "portal_identidade_listar_responsaveis_vinculados") {
        assert.deepEqual(args, { p_auth_user_id: "auth-1" });
        return { data: [], error: null };
      }
      if (name === "portal_identidade_termos_versao_vigente") {
        return { data: "2026-08-05", error: null };
      }
      if (name === "portal_validar_email_aluno_por_gestor") {
        if (options.rpcError) return { data: null, error: options.rpcError };
        if (!options.skipAuthConfirmation) {
          authUser.email_confirmed_at = "2026-10-10T19:00:00.000Z";
        }
        return { data: true, error: null };
      }
      return { data: null, error: { message: `RPC inesperada: ${name}` } };
    },
    from: (table: string) => {
      assert.notEqual(table, "responsaveis_legais", "Tabela privada exige RPC");
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
        maybeSingle: async () => ({
          data: options.readbackFailure ? null : {
            ...partner,
            acesso_status: "ativo",
            troca_senha_obrigatoria: false,
            senha_atualizada_em: "2026-10-10T18:00:00.000Z",
            ...options.currentPartner,
          },
          error: null,
        }),
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
  return { context, rpcCalls, audits, authUser };
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

Deno.test("gestor confirma o e-mail por RPC com snapshot e relê a credencial preservada", async () => {
  const fixture = makeFixture();

  const response = await handleConfirmPartnerEmail(
    fixture.context,
    partner,
    true,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.emailConfirmed, true);
  assert.equal(body.emailValidatedByManager, true);
  assert.equal(body.studentAccessPending, false);
  assert.match(body.message, /senha já criada.*preservada/);
  assert.deepEqual(
    fixture.rpcCalls.map((call) => call.name),
    [
      "portal_identidade_listar_responsaveis_vinculados",
      "portal_validar_email_aluno_por_gestor",
    ],
  );
  assert.deepEqual(fixture.rpcCalls[1].args, {
    p_partner_id: "partner-1",
    p_actor_auth_user_id: GESTOR_AUTH_USER_ID,
    p_expected_auth_user_id: "auth-1",
    p_expected_email: "aluno@example.com",
  });
  assert.equal(fixture.audits.length, 1);
  assert.deepEqual(fixture.audits[0].detalhes, {
    confirmationMethod: "manager_validated_contact",
  });
});

Deno.test("não declara sucesso só com confirmed_at quando a RPC não confirmou o e-mail", async () => {
  const fixture = makeFixture({ skipAuthConfirmation: true });
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

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
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

Deno.test("confirma e-mail de aluno que já criou senha sem exigir termos ou primeiro acesso", async () => {
  const fixture = makeFixture();
  const response = await handleConfirmPartnerEmail(fixture.context, {
    ...partner,
    acesso_status: "ativo",
    troca_senha_obrigatoria: false,
    aceitou_termos_uso: true,
    termos_uso_versao: "versão-anterior",
    email_validado_gestor_em: "2026-08-21T12:00:00.000Z",
    senha_atualizada_em: "2026-08-21T12:00:00.000Z",
  }, true);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).emailConfirmed, true);
});

Deno.test("confirma somente e-mail e conserva criação de senha pendente", async () => {
  const fixture = makeFixture({ currentPartner: {
    acesso_status: "pendente", troca_senha_obrigatoria: true, senha_atualizada_em: null,
  } });
  const response = await handleConfirmPartnerEmail(fixture.context, partner, true);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.emailConfirmed, true);
  assert.equal(body.studentAccessPending, true);
  assert.match(body.message, /deverá criar sua senha/);
});

Deno.test("conflito ou bloqueio de emissão não retorna confirmação otimista", async () => {
  for (const code of ["40001", "55P03", "55000", "42501"]) {
    const fixture = makeFixture({ rpcError: { code, message: "conflito controlado" } });
    const response = await handleConfirmPartnerEmail(fixture.context, partner, true);
    assert.equal(response.status, code === "42501" ? 403 : 409);
    assert.equal(fixture.authUser.email_confirmed_at, null);
    assert.equal((await response.json()).success, false);
  }
});

Deno.test("falha de releitura ou identidade alterada impede declarar sucesso", async () => {
  for (const options of [
    { readbackFailure: true },
    { currentPartner: { email: "outro@example.com" } },
  ]) {
    const fixture = makeFixture(options);
    const response = await handleConfirmPartnerEmail(fixture.context, partner, true);
    assert.equal(response.status, options.readbackFailure ? 500 : 409);
    assert.equal((await response.json()).success, false);
  }
});
