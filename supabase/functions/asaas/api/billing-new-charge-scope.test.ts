import assert from "node:assert/strict";
import { createAsaasBillingService } from "./billing.service.ts";

const runtime = {
  apiKey: "test-key",
  environment: "sandbox" as const,
  baseUrl: "https://api-sandbox.asaas.com/v3",
  config: {},
};

const createAdmin = (receivable: Record<string, unknown>) => ({
  from(table: string) {
    if (table !== "contas_receber") {
      throw new Error(`Tabela inesperada no teste: ${table}`);
    }
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: receivable, error: null }),
    };
    return query;
  },
});

Deno.test("sync generico sem rota nao cria nova cobranca Asaas", async () => {
  const originalFetch = globalThis.fetch;
  let remoteCalls = 0;
  try {
    globalThis.fetch = (() => {
      remoteCalls += 1;
      throw new Error("Nao deveria chamar o Asaas");
    }) as typeof fetch;

    const service = createAsaasBillingService(
      createAdmin({
        id: "00000000-0000-4000-8000-000000000010",
        status: "PENDENTE",
        cliente_id: "00000000-0000-4000-8000-000000000011",
        matricula_id: null,
        turma_id: null,
        categoria: "MENSALIDADE",
        gateway_provider: "asaas",
        gateway_payment_method: "BOLETO",
        forma_pagamento: "BOLETO",
      }),
      () => false,
    );

    await assert.rejects(
      () => service.syncReceivable(runtime, "receivable-generic"),
      /nao possui modalidade e rota bancaria validas/i,
    );
    assert.equal(remoteCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sync genérico bloqueia cobrança nova de disciplina", async () => {
  const originalFetch = globalThis.fetch;
  let remoteCalls = 0;
  try {
    globalThis.fetch = (() => {
      remoteCalls += 1;
      throw new Error("Não deveria chamar gateway");
    }) as typeof fetch;

    const service = createAsaasBillingService(
      createAdmin({
        id: "00000000-0000-4000-8000-000000000012",
        status: "PENDENTE",
        cliente_id: "00000000-0000-4000-8000-000000000013",
        matricula_id: null,
        turma_id: "00000000-0000-4000-8000-000000000014",
        tipo_lancamento: "DEPENDENCIA",
        regra_financeira_dependencia_snapshot: {
          origem: "DEPENDENCIA",
        },
        gateway_provider: "banese_card",
        gateway_payment_method: "BOLETO",
        forma_pagamento: "BOLETO",
      }),
      () => false,
    );

    await assert.rejects(
      () => service.syncReceivable(runtime, "dependency-receivable"),
      /fluxo específico de dependência/i,
    );
    assert.equal(remoteCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sync preserva link Asaas historico sem novo POST", async () => {
  const originalFetch = globalThis.fetch;
  let remoteCalls = 0;
  const receivable = {
    id: "00000000-0000-4000-8000-000000000020",
    status: "PENDENTE",
    cliente_id: "00000000-0000-4000-8000-000000000021",
    gateway_provider: "asaas",
    gateway_payment_link_id: "link_historico",
    asaas_payment_link_id: "link_historico",
  };
  try {
    globalThis.fetch = (() => {
      remoteCalls += 1;
      throw new Error("Nao deveria chamar o Asaas");
    }) as typeof fetch;

    const service = createAsaasBillingService(
      createAdmin(receivable),
      () => false,
    );
    const result = await service.syncReceivable(
      runtime,
      "receivable-historic",
    );

    assert.equal(result, receivable);
    assert.equal(remoteCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sync ambiguo legado tenta somente recovery GET", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  try {
    globalThis.fetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      methods.push(String(init?.method || "GET").toUpperCase());
      assert.match(String(input), /\/paymentLinks\?externalReference=/);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const service = createAsaasBillingService(
      createAdmin({
        id: "00000000-0000-4000-8000-000000000030",
        status: "PENDENTE",
        categoria: "OUTROS_CREDITOS",
        cliente_id: null,
        asaas_status: "CREATING",
        gateway_provider: "asaas",
        gateway_payment_method: "BOLETO",
        forma_pagamento: "BOLETO",
      }),
      () => false,
    );

    await assert.rejects(
      () => service.syncReceivable(runtime, "receivable-ambiguous"),
      /criacao Asaas permanece ambigua/i,
    );
    assert.deepEqual(methods, ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
