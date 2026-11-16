import assert from "node:assert/strict";
import { saveBankingRuntimeConfiguration } from "./runtime.ts";
import { handlePaymentGatewayApi } from "./index.ts";

const ISSUER = "11111111-1111-4111-8111-111111111111";
const CREDENTIAL = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const fixtures = () => ({
  payment_gateway_runtime_config: [{ id: true, enabled: true, active_environment: "production" }],
  payment_gateway_issuer_config: [{ id: 1, issuer_polo_id: ISSUER, active: true, applies_to_all_polos: true }],
  polos: [{ id: ISSUER, company_id: "company-fixture", nome: "Matriz", cnpj: "fixture", cidade: "Cidade", estado: "SE", status: "ativo", is_matriz: true }],
  payment_gateway_routes: [{ modalidade: "TECNICO", provider_code: "banese_card", payment_method: "BOLETO", environment: "production", credential_id: CREDENTIAL, enabled: true }],
  payment_gateway_credentials: [{ id: CREDENTIAL, provider_code: "banese_card", environment: "production", client_id_configured: true, client_secret_configured: true, metadata: {} }],
  usuarios_sistema: [{ id: ACTOR, email: "gestor@example.invalid", perfil: "gestor", status: "ativo", polo_ids: [], permissoes: { modules: ["configuracoes"], allPolos: true } }],
  payment_gateway_providers: [{ code: "banese_card", active: true }],
});

const mockAdmin = (rows: Record<string, any[]> = fixtures()) => {
  const writes: Array<{ table: string; payload: any }> = [];
  const reads: string[] = [];
  const admin = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = [];
      let payload: any;
      const result = (single = false) => {
        if (payload) {
          assert.ok(["payment_gateway_runtime_config", "payment_gateway_routes"].includes(table));
          writes.push({ table, payload });
          rows[table] = [{ ...rows[table]?.[0], ...payload }];
        } else reads.push(table);
        const data = (rows[table] || []).filter((row) => filters.every((filter) => filter(row)));
        return { data: single ? data[0] || null : data, error: null };
      };
      const query: any = {
        select: () => query,
        order: () => query,
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
        ilike: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
        upsert: (value: unknown) => { payload = value; return query; },
        maybeSingle: async () => result(true),
        single: async () => result(true),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
    auth: { getUser: async () => ({ data: { user: { id: ACTOR, email: "gestor@example.invalid" } }, error: null }) },
    rpc(name: string) {
      if (name === "payment_gateway_get_secret") return Promise.resolve({ data: null, error: null });
      assert.equal(name, "portal_identidade_institucional_acesso_liberado");
      return Promise.resolve({ data: true, error: null });
    },
  };
  return { admin, rows, writes, reads };
};

Deno.test("desligar produção preserva ambiente mesmo sem emissor ou rota prontos", async () => {
  const mock = mockAdmin({ payment_gateway_runtime_config: [] });
  const result = await saveBankingRuntimeConfiguration(mock.admin, {
    enabled: false, activeEnvironment: "production",
  }, ACTOR);
  assert.deepEqual(result, { enabled: false, activeEnvironment: "production" });
  assert.deepEqual(mock.reads, []);
  assert.equal(mock.writes[0].payload.active_environment, "production");
  assert.equal(mock.writes[0].payload.updated_by, ACTOR);
});

Deno.test("religar produção usa matriz e rota homologada sem modificar rota, emissor ou credencial", async () => {
  const mock = mockAdmin();
  const before = globalThis.structuredClone(mock.rows);
  const result = await saveBankingRuntimeConfiguration(mock.admin, {
    enabled: true, activeEnvironment: "production",
  }, ACTOR);
  assert.deepEqual(result, { enabled: true, activeEnvironment: "production" });
  assert.equal(mock.writes.length, 1);
  for (const table of ["payment_gateway_routes", "payment_gateway_credentials", "payment_gateway_issuer_config", "polos"]) {
    assert.deepEqual(mock.rows[table], before[table]);
  }
});

Deno.test("troca explícita para sandbox exige sua própria rota EAD e credencial", async () => {
  const mock = mockAdmin();
  await assert.rejects(() => saveBankingRuntimeConfiguration(mock.admin, {
    enabled: true, activeEnvironment: "sandbox",
  }, ACTOR), /rota.*ambiente/i);
  assert.equal(mock.writes.length, 0);
  mock.rows.payment_gateway_routes.push({ ...mock.rows.payment_gateway_routes[0], modalidade: "EAD", environment: "sandbox", credential_id: "sandbox-fixture" });
  mock.rows.payment_gateway_credentials.push({ ...mock.rows.payment_gateway_credentials[0], id: "sandbox-fixture", environment: "sandbox" });
  const result = await saveBankingRuntimeConfiguration(mock.admin, {
    enabled: true, activeEnvironment: "sandbox",
  }, ACTOR);
  assert.deepEqual(result, { enabled: true, activeEnvironment: "sandbox" });
});

for (const [name, change] of [
  ["matriz inativa", (data: any) => { data.polos[0].status = "inativo"; }],
  ["emissor sem alcance global", (data: any) => { data.payment_gateway_issuer_config[0].applies_to_all_polos = false; }],
  ["rota desativada", (data: any) => { data.payment_gateway_routes[0].enabled = false; }],
  ["rota livre ainda não homologada", (data: any) => { data.payment_gateway_routes[0].modalidade = "LIVRE"; }],
  ["credencial de outro ambiente", (data: any) => { data.payment_gateway_credentials[0].environment = "sandbox"; }],
  ["credencial sem segredo configurado", (data: any) => { data.payment_gateway_credentials[0].client_secret_configured = false; }],
] as const) {
  Deno.test(`ativação falha fechada: ${name}`, async () => {
    const data = fixtures();
    change(data);
    const mock = mockAdmin(data);
    await assert.rejects(() => saveBankingRuntimeConfiguration(mock.admin, {
      enabled: true, activeEnvironment: "production",
    }, ACTOR));
    assert.equal(mock.writes.length, 0);
  });
}

Deno.test("ambiente e interruptor inválidos nunca são normalizados silenciosamente", async () => {
  for (const body of [
    { enabled: false }, { enabled: true, activeEnvironment: "prod" },
    { enabled: "false", activeEnvironment: "production" },
  ]) {
    const mock = mockAdmin();
    await assert.rejects(() => saveBankingRuntimeConfiguration(mock.admin, body, ACTOR));
    assert.deepEqual(mock.reads, []);
    assert.deepEqual(mock.writes, []);
  }
});

const request = (body: unknown, authenticated = true) => new Request("https://example.invalid/api", {
  method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer fixture" } : {}) },
  body: JSON.stringify(body),
});
const invokeHandler = (mock: ReturnType<typeof mockAdmin>, body: unknown, authenticated = true) =>
  handlePaymentGatewayApi(request(body, authenticated), { admin: mock.admin, supabaseUrl: "https://example.invalid" });

Deno.test("overview extraído mantém configuração canônica e não realiza mutações", async () => {
  const mock = mockAdmin();
  const response = await invokeHandler(mock, { action: "get-overview" });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.activeEnvironment, "production");
  assert.equal(data.integrationEnabled, true);
  assert.equal(data.issuerConfig.issuer_polo_id, ISSUER);
  assert.equal(data.routes[0].modalidade, "TECNICO");
  assert.equal(data.credentials[0].id, CREDENTIAL);
  assert.deepEqual(mock.writes, []);
});

Deno.test("handler autenticado desliga e religa produção preservando ambiente", async () => {
  const mock = mockAdmin();
  for (const enabled of [false, true]) {
    const response = await invokeHandler(mock, { action: "save-runtime-config", enabled, activeEnvironment: "production" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, runtimeConfig: { enabled, activeEnvironment: "production" } });
  }
  assert.equal(mock.writes.length, 2);
  assert.ok(mock.writes.every((write) => write.table === "payment_gateway_runtime_config"));
});

Deno.test("handler impede alteração global por sessão ausente ou gestor sem alcance global", async () => {
  const mock = mockAdmin();
  const body = { action: "save-runtime-config", enabled: false, activeEnvironment: "production" };
  assert.equal((await invokeHandler(mock, body, false)).status, 401);
  mock.rows.usuarios_sistema[0].permissoes.allPolos = false;
  const denied = await invokeHandler(mock, body);
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /gestor global/i);
  assert.deepEqual(mock.writes, []);
});

Deno.test("handler permite religar somente Técnico BOLETO Banese produção", async () => {
  const mock = mockAdmin();
  const body = { action: "save-route", modalidade: "TECNICO", paymentMethod: "BOLETO", providerCode: "banese_card", environment: "production", credentialId: CREDENTIAL };
  for (const enabled of [false, true]) {
    const response = await invokeHandler(mock, { ...body, enabled });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).route.enabled, enabled);
  }
  const writes = mock.writes.length;
  for (const override of [
    { modalidade: "LIVRE" }, { modalidade: "ESPECIALIZACAO" },
    { environment: "sandbox" }, { paymentMethod: "PIX" },
    { paymentMethod: "CREDIT_CARD", providerCode: "mercado_pago" },
  ]) {
    const response = await invokeHandler(mock, { ...body, ...override, enabled: true });
    assert.equal(response.status, 400);
  }
  assert.equal(mock.writes.length, writes);
});
