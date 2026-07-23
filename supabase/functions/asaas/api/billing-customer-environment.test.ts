import assert from "node:assert/strict";
import { createAsaasBillingService } from "./billing.service.ts";

const partner = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Aluno Teste",
  cpf_cnpj: "52998224725",
  email: "aluno@example.com",
  telefone: "82999999999",
  asaas_customer_id: "cus_legacy",
};

const runtime = {
  apiKey: "test-key",
  environment: "sandbox" as const,
  baseUrl: "https://api-sandbox.asaas.com/v3",
  config: {},
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const createAdmin = (
  mappingId: string | null,
  mappingWrites: Array<Record<string, unknown>>,
) => ({
  from(table: string) {
    if (table === "payment_gateway_customers") {
      const readQuery = {
        select: () => readQuery,
        eq: () => readQuery,
        maybeSingle: () => ({
          data: mappingId ? { remote_customer_id: mappingId } : null,
          error: null,
        }),
      };
      return {
        ...readQuery,
        upsert: (values: Record<string, unknown>) => {
          mappingWrites.push(values);
          return { error: null };
        },
      };
    }
    if (table === "parceiros") {
      return {
        update: () => ({
          eq: () => ({ error: null }),
        }),
      };
    }
    throw new Error(`Tabela inesperada no teste: ${table}`);
  },
});

Deno.test("ensureCustomer usa primeiro o cliente mapeado no ambiente", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const mappingWrites: Array<Record<string, unknown>> = [];
  try {
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      assert.match(url, /\/customers\/cus_sandbox$/);
      return Promise.resolve(jsonResponse({
        id: "cus_sandbox",
        cpfCnpj: partner.cpf_cnpj,
      }));
    }) as typeof fetch;

    const service = createAsaasBillingService(
      createAdmin("cus_sandbox", mappingWrites),
      () => false,
    );
    const customerId = await service.ensureCustomer(runtime, { ...partner });

    assert.equal(customerId, "cus_sandbox");
    assert.equal(requests.length, 2);
    assert.equal(requests.some((url) => url.includes("cus_legacy")), false);
    assert.equal(mappingWrites[0].environment, "sandbox");
    assert.equal(mappingWrites[0].remote_customer_id, "cus_sandbox");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ensureCustomer rejeita id legado ausente no ambiente e recupera por CPF", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const mappingWrites: Array<Record<string, unknown>> = [];
  try {
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/customers/cus_legacy")) {
        return Promise.resolve(jsonResponse({ message: "not found" }, 404));
      }
      if (url.includes("/customers?cpfCnpj=52998224725")) {
        return Promise.resolve(jsonResponse({
          data: [{ id: "cus_sandbox", cpfCnpj: partner.cpf_cnpj }],
        }));
      }
      if (url.endsWith("/customers/cus_sandbox")) {
        return Promise.resolve(jsonResponse({
          id: "cus_sandbox",
          cpfCnpj: partner.cpf_cnpj,
        }));
      }
      throw new Error(`URL inesperada no teste: ${url}`);
    }) as typeof fetch;

    const service = createAsaasBillingService(
      createAdmin(null, mappingWrites),
      () => false,
    );
    const customerId = await service.ensureCustomer(runtime, { ...partner });

    assert.equal(customerId, "cus_sandbox");
    assert.equal(requests.some((url) => url.endsWith("cus_legacy")), true);
    assert.equal(
      requests.some((url) => url.includes("cpfCnpj=52998224725")),
      true,
    );
    assert.equal(mappingWrites[0].remote_customer_id, "cus_sandbox");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
