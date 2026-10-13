import assert from "node:assert/strict";
import { handleAsaasReceivableSyncAction } from "./receivable-sync.action.ts";
import type { GestorAutorizado } from "./authz.ts";
import type { AsaasApiContext } from "./request-context.ts";

const polo = "00000000-0000-4000-8000-000000000001";
const title = "00000000-0000-4000-8000-000000000002";
const actor = (tab: string): GestorAutorizado => ({
  id: "00000000-0000-4000-8000-000000000003", email: "synthetic@example.com",
  perfil: "financeiro", status: "ATIVO", context: null, isGlobal: false,
  poloId: polo, poloIds: [polo], modules: ["financeiro"], financeiroTabs: [tab], tabs: {},
  communicationSector: "", communicationPoloId: null, canViewAllCommunication: false,
  canViewAllCommunicationPolos: false,
});
const run = (gestor: GestorAutorizado, row: Record<string, unknown>) => {
  const calls: string[] = [];
  const chain = {
    select: (fields: string) => {
      assert.match(fields, /outros_creditos_plano_id/);
      calls.push("read"); return chain;
    },
    eq: () => chain,
    single: async () => ({ data: row, error: null }),
  };
  const context = {
    body: { receivableId: title }, gestor,
    admin: { from: (table: string) => { assert.equal(table, "contas_receber"); return chain; } },
    getGatewayRuntimeForReceivableMovement: async () => { calls.push("credentials"); return {}; },
    syncReceivable: async (_runtime: unknown, id: string) => { assert.equal(id, title); calls.push("bank"); return row; },
  } as unknown as AsaasApiContext;
  return { calls, result: () => handleAsaasReceivableSyncAction("sync-receivable", context,
    body => Response.json(body)) };
};

Deno.test("emissão do carnê exige a aba antes de carregar credenciais ou chamar o banco", async () => {
  for (const tab of ["resumo", "receber"]) {
    const request = run(actor(tab), { id: title, polo_id: polo, outros_creditos_plano_id: title });
    await assert.rejects(request.result, /aba outros-creditos nao autorizado/i);
    assert.deepEqual(request.calls, ["read"]);
  }
});

Deno.test("carnê autorizado usa a rota existente uma única vez e com escopo de polo", async () => {
  const request = run(actor("outros-creditos"), { id: title, polo_id: polo, outros_creditos_plano_id: title });
  const response = await request.result();
  assert.equal(response?.status, 200);
  assert.equal((await response!.json()).success, true);
  assert.deepEqual(request.calls, ["read", "credentials", "bank"]);
  const outside = run(actor("outros-creditos"), { id: title, polo_id: title, outros_creditos_plano_id: title });
  await assert.rejects(outside.result, /polo/i);
  assert.deepEqual(outside.calls, ["read"]);
});

Deno.test("perfil sem escrita é bloqueado no plano e recebível acadêmico preserva seu contrato", async () => {
  const restricted = run({ ...actor("outros-creditos"), perfil: "professor" },
    { id: title, polo_id: polo, outros_creditos_plano_id: title });
  await assert.rejects(restricted.result, /sem permissao/i);
  assert.deepEqual(restricted.calls, ["read"]);
  const academic = run(actor("receber"), { id: title, polo_id: polo, outros_creditos_plano_id: null });
  assert.equal((await academic.result())?.status, 200);
  assert.deepEqual(academic.calls, ["read", "credentials", "bank"]);
});
