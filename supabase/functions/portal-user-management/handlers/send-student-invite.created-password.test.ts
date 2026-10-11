import assert from "node:assert/strict";
import { handleSendStudentInvite } from "./send-student-invite.ts";
import type { HandlerContext, Partner } from "../types.ts";

const basePartner: Partner = {
  id: "22222222-2222-4222-8222-222222222222",
  tipo: "Aluno", nome: "Pessoa sintética", status: "Ativo",
  auth_user_id: "33333333-3333-4333-8333-333333333333",
  email: "aluno@example.com", auth_login_email: "aluno@example.com",
  cpf_cnpj: "52998224725", acesso_status: "pendente",
  troca_senha_obrigatoria: true, aceitou_termos_uso: false,
  senha_atualizada_em: "2026-10-10T18:00:01.000Z",
};

Deno.test("reenvio preserva senha própria ainda com e-mail ou termos pendentes", async () => {
  for (const temporaryPending of [false, true]) {
    const updates: Record<string, unknown>[] = [];
    let recoveryCalls = 0;
    const query: any = {
      eq: () => query, neq: () => query,
      limit: async () => ({ data: [], error: null }),
    };
    const context: HandlerContext = {
      gestor: { id: "gestor-sintético" }, gestorEmail: "gestor@example.com",
      json: (payload, status = 200) => new Response(JSON.stringify(payload), { status }),
      admin: {
        rpc: async () => ({ data: [], error: null }),
        from: () => ({
          select: () => query,
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            const update: any = { eq: () => update, is: () => update,
              select: () => update, maybeSingle: async () => ({
                data: { ...basePartner, ...patch }, error: null,
              }) };
            return update;
          },
        }),
        auth: { admin: {
          getUserById: async () => ({ data: { user: {
            id: basePartner.auth_user_id, email: basePartner.email,
          } }, error: null }),
          generateLink: async () => {
            recoveryCalls += 1;
            return { data: { properties: {
              action_link: "https://example.test/recovery",
            } }, error: null };
          },
        } },
      },
    };
    const response = await handleSendStudentInvite(context, {
      ...basePartner,
      senha_temporaria_pendente: temporaryPending,
      senha_temporaria_emitida_em: temporaryPending
        ? "2026-10-10T18:00:00.000Z" : null,
    }, {
      supabaseUrl: "https://example.test", redirectTo: "/recuperar-senha",
      publicApiKey: { apiKey: null, message: "Sem envio no teste isolado." },
    });
    assert.equal(response.status, 200);
    assert.equal(recoveryCalls, 1);
    assert.equal((await response.json()).recoveryLink, "https://example.test/recovery");
    for (const patch of updates) {
      for (const field of [
        "troca_senha_obrigatoria", "acesso_status", "senha_atualizada_em",
        "acesso_ativado_em", "aceitou_termos_uso", "termos_uso_versao",
      ]) assert.equal(field in patch, false, `${field} não pode ser rebaixado.`);
    }
  }
});

Deno.test("senha própria com Auth pendente não promove a credencial multipapel", async () => {
  const updates: Record<string, unknown>[] = [];
  const context: HandlerContext = {
    gestor: { id: "gestor-sintético" }, gestorEmail: "gestor@example.com",
    json: (payload, status = 200) => new Response(JSON.stringify(payload), { status }),
    admin: {
      rpc: async (name: string) => {
        assert.equal(name, "portal_identidade_listar_responsaveis_vinculados");
        return { data: [], error: null };
      },
      from: (table: string) => {
        const query: any = {
          eq: () => query, neq: () => query,
          limit: async () => ({ data: table === "parceiros" ? [{
            id: "44444444-4444-4444-8444-444444444444", tipo: "Professor",
            cpf_cnpj: basePartner.cpf_cnpj, email: basePartner.email,
            auth_login_email: basePartner.auth_login_email,
          }] : [], error: null }),
        };
        return {
          select: () => query,
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
      auth: { admin: {
        getUserById: async () => ({ data: { user: {
          id: basePartner.auth_user_id, email: basePartner.email, email_confirmed_at: null,
        } }, error: null }),
      } },
    },
  };
  const response = await handleSendStudentInvite(context, basePartner, {
    supabaseUrl: "https://example.test", redirectTo: "/recuperar-senha",
    publicApiKey: { apiKey: null, message: "Sem envio no teste isolado." },
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Confirme o e-mail/);
  assert.deepEqual(updates, []);
});
