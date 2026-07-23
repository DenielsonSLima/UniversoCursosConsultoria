import assert from "node:assert/strict";
import {
  authorizationErrorHttpStatus,
  type GestorAutorizado,
  requireGestorAtivo,
  requireGlobalFinancialTabAccess,
} from "./authz.ts";

const request = new Request("https://example.test", {
  headers: { Authorization: "Bearer valid-token" },
});

const adminForUsuario = (usuario: Record<string, unknown>) => ({
  auth: {
    getUser: async () => ({
      data: { user: { email: "financeiro@example.com" } },
      error: null,
    }),
  },
  from: () => ({
    select: () => ({
      ilike: () => ({
        maybeSingle: async () => ({ data: usuario, error: null }),
      }),
    }),
  }),
});

Deno.test("mapeia negação do guard para HTTP 403", () => {
  assert.equal(
    authorizationErrorHttpStatus(
      "Acesso financeiro global nao autorizado para este perfil.",
    ),
    403,
  );
  assert.equal(authorizationErrorHttpStatus("Regra financeira invalida."), null);
});

const actor = (
  overrides: Partial<GestorAutorizado> = {},
): GestorAutorizado => ({
  id: "actor-id",
  email: "financeiro@example.com",
  perfil: "Financeiro",
  status: "Ativo",
  context: null,
  isGlobal: true,
  poloId: null,
  poloIds: [],
  modules: ["inicio", "financeiro"],
  financeiroTabs: ["resumo", "receber", "conciliacao-bancaria"],
  tabs: {},
  ...overrides,
});

Deno.test("autoriza Gestor e Financeiro globais com modulo e aba de conciliacao", () => {
  assert.equal(
    requireGlobalFinancialTabAccess(actor(), "conciliacao-bancaria"),
    undefined,
  );
  assert.equal(
    requireGlobalFinancialTabAccess(
      actor({ perfil: "Gestor" }),
      "conciliacao-bancaria",
    ),
    undefined,
  );
});

Deno.test("nega operacao bancaria ao Financeiro sem acesso global", () => {
  assert.throws(
    () => requireGlobalFinancialTabAccess(
      actor({ isGlobal: false, poloId: "polo-id", poloIds: ["polo-id"] }),
      "conciliacao-bancaria",
    ),
    /Acesso financeiro global obrigatorio/,
  );
});

Deno.test("nega operacao bancaria sem modulo ou aba de conciliacao", () => {
  assert.throws(
    () => requireGlobalFinancialTabAccess(
      actor({ modules: ["inicio", "caixa"] }),
      "conciliacao-bancaria",
    ),
    /Acesso ao modulo financeiro nao autorizado/,
  );
  assert.throws(
    () => requireGlobalFinancialTabAccess(
      actor({ financeiroTabs: ["resumo", "receber"] }),
      "conciliacao-bancaria",
    ),
    /Acesso a aba conciliacao-bancaria nao autorizado/,
  );
});

Deno.test("nega papel operacional mesmo com modulo, aba e escopo global", () => {
  assert.throws(
    () => requireGlobalFinancialTabAccess(
      actor({ perfil: "Operacional" }),
      "conciliacao-bancaria",
    ),
    /Acesso financeiro global nao autorizado/,
  );
});

Deno.test("herda escopo global do perfil quando permissoes nao sao personalizadas", async () => {
  const gestor = await requireGestorAtivo(
    request,
    adminForUsuario({
      id: "actor-id",
      email: "financeiro@example.com",
      perfil: "Financeiro",
      status: "Ativo",
      context: null,
      polo_ids: [],
      personalizar_permissoes: false,
      permissoes: {
        modules: ["inicio"],
        financeiroTabs: [],
        allPolos: false,
      },
      perfis_acesso: {
        permissoes: {
          modules: ["inicio", "financeiro"],
          financeiroTabs: ["resumo", "receber", "conciliacao-bancaria"],
          allPolos: true,
        },
        restricao_horario: null,
      },
      restricao_horario: null,
    }),
  );

  assert.equal(gestor.isGlobal, true);
  assert.equal(gestor.poloId, null);
  assert.deepEqual(gestor.poloIds, []);
  assert.doesNotThrow(() =>
    requireGlobalFinancialTabAccess(gestor, "conciliacao-bancaria")
  );
});

Deno.test("respeita escopo restrito quando permissoes sao personalizadas", async () => {
  const poloId = "1c9f27ce-5d88-4ee7-b6e7-779786331120";
  const gestor = await requireGestorAtivo(
    request,
    adminForUsuario({
      id: "actor-id",
      email: "financeiro@example.com",
      perfil: "Financeiro",
      status: "Ativo",
      context: null,
      polo_ids: [poloId],
      personalizar_permissoes: true,
      permissoes: {
        modules: ["inicio", "financeiro"],
        financeiroTabs: ["resumo", "receber", "conciliacao-bancaria"],
        allPolos: false,
      },
      perfis_acesso: {
        permissoes: {
          modules: ["inicio", "financeiro"],
          financeiroTabs: ["resumo", "receber", "conciliacao-bancaria"],
          allPolos: true,
        },
        restricao_horario: null,
      },
      restricao_horario: null,
    }),
  );

  assert.equal(gestor.isGlobal, false);
  assert.equal(gestor.poloId, poloId);
  assert.deepEqual(gestor.poloIds, [poloId]);
  assert.throws(
    () => requireGlobalFinancialTabAccess(gestor, "conciliacao-bancaria"),
    /Acesso financeiro global obrigatorio/,
  );
});
