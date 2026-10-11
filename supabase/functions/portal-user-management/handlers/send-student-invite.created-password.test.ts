import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import type { HandlerContext, Partner } from "../types.ts";
import { STUDENT_INVITE_CAS_RPC } from "./student-invite-state.ts";

const basePartner: Partner = {
  id: "22222222-2222-4222-8222-222222222222",
  tipo: "Aluno",
  nome: "Pessoa sintética",
  status: "Ativo",
  auth_user_id: "33333333-3333-4333-8333-333333333333",
  email: "aluno@example.com",
  auth_login_email: "aluno@example.com",
  cpf_cnpj: "52998224725",
  acesso_status: "pendente",
  troca_senha_obrigatoria: true,
  aceitou_termos_uso: false,
  senha_atualizada_em: "2026-10-10T18:00:01.000Z",
};

Deno.test("reenvio preserva senha própria ainda com e-mail ou termos pendentes", async () => {
  for (const temporaryPending of [false, true]) {
    const updates: Record<string, unknown>[] = [];
    let recoveryCalls = 0;
    const query: any = {
      eq: () => query,
      neq: () => query,
      limit: async () => ({ data: [], error: null }),
    };
    const context: HandlerContext = {
      gestor: {
        id: "gestor-sintético",
        auth_user_id: "11111111-1111-4111-8111-111111111111",
      },
      gestorEmail: "gestor@example.com",
      json: (payload, status = 200) =>
        new Response(JSON.stringify(payload), { status }),
      admin: {
        rpc: async (name: string, args: any) => {
          if (name !== STUDENT_INVITE_CAS_RPC) return { data: [], error: null };
          if (Object.keys(args.p_patch).length) updates.push(args.p_patch);
          return {
            data: {
              id: args.p_partner_id,
              ...args.p_expected_snapshot,
              ...args.p_patch,
            },
            error: null,
          };
        },
        from: () => ({
          select: () => query,
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            const update: any = {
              eq: () => update,
              is: () => update,
              select: () => update,
              maybeSingle: async () => ({
                data: { ...basePartner, ...patch },
                error: null,
              }),
            };
            return update;
          },
        }),
        auth: {
          admin: {
            getUserById: async () => ({
              data: {
                user: {
                  id: basePartner.auth_user_id,
                  email: basePartner.email,
                },
              },
              error: null,
            }),
            generateLink: async () => {
              recoveryCalls += 1;
              return {
                data: {
                  user: { id: basePartner.auth_user_id },
                  properties: {
                    action_link: "https://example.test/recovery",
                  },
                },
                error: null,
              };
            },
          },
        },
      },
    };
    const response = await handleSendStudentInvite(context, {
      ...basePartner,
      senha_temporaria_pendente: temporaryPending,
      senha_temporaria_emitida_em: temporaryPending
        ? "2026-10-10T18:00:00.000Z"
        : null,
    }, {
      supabaseUrl: "https://example.test",
      redirectTo: "/recuperar-senha",
      publicApiKey: { apiKey: null, message: "Sem envio no teste isolado." },
    });
    assert.equal(response.status, 200);
    assert.equal(recoveryCalls, 1);
    assert.equal(
      (await response.json()).recoveryLink,
      "https://example.test/recovery",
    );
    for (const patch of updates) {
      for (
        const field of [
          "troca_senha_obrigatoria",
          "acesso_status",
          "senha_atualizada_em",
          "acesso_ativado_em",
          "aceitou_termos_uso",
          "termos_uso_versao",
        ]
      ) assert.equal(field in patch, false, `${field} não pode ser rebaixado.`);
    }
  }
});

Deno.test("recuperação só libera link da identidade verificada e não persiste resposta inválida", async () => {
  const cases = [
    {
      user: { id: "44444444-4444-4444-8444-444444444444" },
      link: "https://example.test/foreign-secret",
      status: 409,
    },
    {
      user: null,
      link: "https://example.test/missing-identity-secret",
      status: 409,
    },
    { user: { id: basePartner.auth_user_id }, link: null, status: 500 },
    { user: { id: basePartner.auth_user_id }, link: "   ", status: 500 },
  ];
  for (const testCase of cases) {
    const updates: Record<string, unknown>[] = [];
    let writesBeforeRecovery = -1;
    const query: any = {
      eq: () => query,
      neq: () => query,
      limit: async () => ({ data: [], error: null }),
    };
    const context: HandlerContext = {
      gestor: {
        id: "gestor-sintético",
        auth_user_id: "11111111-1111-4111-8111-111111111111",
      },
      gestorEmail: "gestor@example.com",
      json: (payload, status = 200) =>
        new Response(JSON.stringify(payload), { status }),
      admin: {
        rpc: async (name: string, args: any) => {
          if (name !== STUDENT_INVITE_CAS_RPC) return { data: [], error: null };
          if (Object.keys(args.p_patch).length) updates.push(args.p_patch);
          return {
            data: {
              id: args.p_partner_id,
              ...args.p_expected_snapshot,
              ...args.p_patch,
            },
            error: null,
          };
        },
        from: () => ({
          select: () => query,
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            const update: any = {
              eq: () => update,
              is: () => update,
              select: () => update,
              maybeSingle: async () => ({
                data: { ...basePartner, ...patch },
                error: null,
              }),
            };
            return update;
          },
        }),
        auth: {
          admin: {
            getUserById: async () => ({
              data: {
                user: {
                  id: basePartner.auth_user_id,
                  email: basePartner.email,
                },
              },
              error: null,
            }),
            generateLink: async () => {
              writesBeforeRecovery = updates.length;
              return {
                data: {
                  user: testCase.user,
                  properties: { action_link: testCase.link },
                },
                error: null,
              };
            },
          },
        },
      },
    };
    const response = await handleSendStudentInvite(context, basePartner, {
      supabaseUrl: "https://example.test",
      redirectTo: "/recuperar-senha",
      publicApiKey: { apiKey: null, message: "Sem envio no teste isolado." },
    });
    const body = await response.json();
    assert.equal(response.status, testCase.status);
    assert.equal(body.success, false);
    assert.equal(body.recoveryLink, null);
    assert.equal(body.inviteSent, false);
    assert.equal(body.recoveryEmailSent, false);
    assert.equal("userId" in body, false);
    assert.doesNotMatch(
      JSON.stringify(body),
      /foreign-secret|missing-identity-secret|44444444/,
    );
    assert.equal(
      updates.length,
      writesBeforeRecovery,
      "Não pode gravar estado pendente após resposta inválida.",
    );
    for (const patch of updates) {
      for (
        const field of [
          "troca_senha_obrigatoria",
          "senha_atualizada_em",
          "aceitou_termos_uso",
          "termos_uso_versao",
        ]
      ) {
        assert.equal(field in patch, false, `${field} precisa ser preservado.`);
      }
    }
  }
});

Deno.test("senha própria com Auth pendente não promove a credencial multipapel", async () => {
  const updates: Record<string, unknown>[] = [];
  const context: HandlerContext = {
    gestor: {
      id: "gestor-sintético",
      auth_user_id: "11111111-1111-4111-8111-111111111111",
    },
    gestorEmail: "gestor@example.com",
    json: (payload, status = 200) =>
      new Response(JSON.stringify(payload), { status }),
    admin: {
      rpc: async (name: string) => {
        assert.equal(name, "portal_identidade_listar_responsaveis_vinculados");
        return { data: [], error: null };
      },
      from: (table: string) => {
        const query: any = {
          eq: () => query,
          neq: () => query,
          limit: async () => ({
            data: table === "parceiros"
              ? [{
                id: "44444444-4444-4444-8444-444444444444",
                tipo: "Professor",
                cpf_cnpj: basePartner.cpf_cnpj,
                email: basePartner.email,
                auth_login_email: basePartner.auth_login_email,
              }]
              : [],
            error: null,
          }),
        };
        return {
          select: () => query,
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
      auth: {
        admin: {
          getUserById: async () => ({
            data: {
              user: {
                id: basePartner.auth_user_id,
                email: basePartner.email,
                email_confirmed_at: null,
              },
            },
            error: null,
          }),
        },
      },
    },
  };
  const response = await handleSendStudentInvite(context, basePartner, {
    supabaseUrl: "https://example.test",
    redirectTo: "/recuperar-senha",
    publicApiKey: { apiKey: null, message: "Sem envio no teste isolado." },
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Confirme o e-mail/);
  assert.deepEqual(updates, []);
});
