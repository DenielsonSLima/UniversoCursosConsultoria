import assert from "node:assert/strict";
import { executeManualSettlementAction } from "./manual-settlement.action.ts";
import type { GestorAutorizado } from "./authz.ts";

const actor: GestorAutorizado = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "financeiro@example.com",
  perfil: "financeiro",
  status: "ativo",
  context: null,
  isGlobal: true,
  poloId: null,
  poloIds: [],
  modules: ["financeiro"],
  financeiroTabs: ["receber"],
  tabs: { financeiro: ["receber"] },
  communicationSector: "",
  communicationPoloId: null,
  canViewAllCommunication: false,
};

Deno.test("ação manual-settlement delega contexto autenticado ao serviço", async () => {
  const admin = { marker: "admin" };
  const body = { receivableId: "receivable" };
  let received: any = null;
  const result = await executeManualSettlementAction({
    admin,
    actor,
    body,
    requirePoloAccess: () => {},
    getAsaasRuntime: async () => ({
      environment: "sandbox",
      baseUrl: "https://sandbox.example",
      apiKey: "test",
    }),
    syncFutureInstallments: async () => {},
  }, async (dependencies) => {
    received = dependencies;
    return { success: true, settlementId: "settlement" };
  });

  assert.equal(received.admin, admin);
  assert.equal(received.actor, actor);
  assert.equal(received.body, body);
  assert.deepEqual(result, { success: true, settlementId: "settlement" });
});

Deno.test("ação manual-settlement não aceita chamada sem gestor autenticado", async () => {
  await assert.rejects(
    () =>
      executeManualSettlementAction({
        admin: {},
        actor: null,
        body: {},
        requirePoloAccess: () => {},
        getAsaasRuntime: async () => ({
          environment: "sandbox",
          baseUrl: "https://sandbox.example",
          apiKey: "test",
        }),
        syncFutureInstallments: async () => {},
      }),
    /autenticação interna obrigatória/i,
  );
});
