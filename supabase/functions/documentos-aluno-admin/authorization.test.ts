import type { GestorAutorizado } from "../_shared/authz.ts";
import { gestorCanManageAluno } from "./authorization.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Esperado ${String(expected)}, recebido ${String(actual)}.`,
    );
  }
};

const gestor = (
  overrides: Partial<GestorAutorizado> = {},
): GestorAutorizado => ({
  id: "gestor-1",
  email: "gestor@universocc.com.br",
  perfil: "Gestor",
  status: "Ativo",
  context: null,
  isGlobal: false,
  poloId: "polo-a",
  poloIds: ["polo-a"],
  modules: ["parceiros"],
  financeiroTabs: [],
  tabs: {},
  communicationSector: "todos",
  communicationPoloId: null,
  canViewAllCommunication: false,
  ...overrides,
});

Deno.test("gestor global pode processar documento de qualquer polo", () => {
  assertEquals(
    gestorCanManageAluno(gestor({ isGlobal: true, poloIds: [] }), {
      polo_id: "polo-z",
    }),
    true,
  );
});

Deno.test("gestor escopado acessa polo principal ou adicional do aluno", () => {
  assertEquals(
    gestorCanManageAluno(gestor(), {
      polo_id: "polo-b",
      polo_ids: ["polo-a", "polo-b"],
    }),
    true,
  );
});

Deno.test("gestor escopado nao acessa aluno de outro polo", () => {
  assertEquals(
    gestorCanManageAluno(gestor(), {
      polo_id: "polo-z",
      polo_ids: ["polo-y"],
    }),
    false,
  );
});
