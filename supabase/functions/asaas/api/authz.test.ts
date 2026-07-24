import assert from "node:assert/strict";
import {
  type GestorAutorizado,
  requireOtherCreditsWriteAccess,
} from "./authz.ts";

const gestor = (
  overrides: Partial<GestorAutorizado> = {},
): GestorAutorizado => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "financeiro@example.com",
  perfil: "financeiro",
  status: "ATIVO",
  context: null,
  isGlobal: false,
  poloId: "22222222-2222-4222-8222-222222222222",
  poloIds: ["22222222-2222-4222-8222-222222222222"],
  modules: ["financeiro"],
  financeiroTabs: ["outros-creditos"],
  tabs: {},
  communicationSector: "",
  communicationPoloId: null,
  canViewAllCommunication: false,
  ...overrides,
});

Deno.test("Outros Creditos exige perfil financeiro e a aba explicita", () => {
  assert.doesNotThrow(() => requireOtherCreditsWriteAccess(gestor()));
  assert.throws(
    () => requireOtherCreditsWriteAccess(gestor({ financeiroTabs: [] })),
    /Acesso a aba outros-creditos nao autorizado/i,
  );
  assert.throws(
    () => requireOtherCreditsWriteAccess(gestor({ perfil: "secretaria" })),
    /sem permissao/i,
  );
});
