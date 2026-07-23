import assert from "node:assert/strict";
import { createAsaasBillingService } from "./billing.service.ts";

const runtime = {
  apiKey: "test-key",
  environment: "sandbox" as const,
  baseUrl: "https://api-sandbox.asaas.com/v3",
  config: {},
};

const snapshot = {
  id: "00000000-0000-4000-8000-000000000010",
  status: "PENDENTE",
  origem_pagamento: "LOCAL",
  updated_at: "2026-07-21T10:00:00.000Z",
  valor: 99.9,
  matricula_id: null,
  asaas_payment_id: "pay_1",
  asaas_payment_link_id: null,
  asaas_installment_id: null,
  asaas_status: "PENDING",
  nosso_numero_asaas: "pay_1",
  gateway_provider: "asaas",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: "pay_1",
  gateway_payment_link_id: null,
  gateway_boleto_nosso_numero: null,
  gateway_customer_id: "cus_1",
  gateway_installment_id: null,
  gateway_status: "PENDING",
};

type QueryWrite = {
  values: Record<string, unknown>;
  filters: Array<["eq" | "is", string, unknown]>;
};

const createReceivableAdmin = (input: {
  reads: Array<Record<string, unknown>>;
  updateResults: Array<Record<string, unknown> | null>;
  writes: QueryWrite[];
}) => ({
  from(table: string) {
    assert.equal(table, "contas_receber");
    let mode: "read" | "update" = "read";
    let values: Record<string, unknown> = {};
    const filters: Array<["eq" | "is", string, unknown]> = [];
    const query = {
      select: () => query,
      update(nextValues: Record<string, unknown>) {
        mode = "update";
        values = nextValues;
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return query;
      },
      is(column: string, value: unknown) {
        filters.push(["is", column, value]);
        return query;
      },
      maybeSingle: () => {
        if (mode === "read") {
          return { data: input.reads.shift() || null, error: null };
        }
        input.writes.push({ values, filters });
        const result = input.updateResults.shift() ?? null;
        return {
          data: result ? { ...result, ...values } : null,
          error: null,
        };
      },
    };
    return query;
  },
});

const withRemotePayment = async (run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "pay_1",
            customer: "cus_1",
            status: "RECEIVED",
            billingType: "BOLETO",
            value: 99.9,
            paymentDate: "2026-07-21",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )) as typeof fetch;
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

Deno.test("refresh aplica projeção somente com CAS do estado e identidade", async () => {
  await withRemotePayment(async () => {
    const writes: QueryWrite[] = [];
    const admin = createReceivableAdmin({
      reads: [{ ...snapshot }],
      updateResults: [{ ...snapshot }],
      writes,
    });
    const service = createAsaasBillingService(admin, () => false);

    const result = await service.refreshReceivableStatus(runtime, {
      ...snapshot,
    });

    assert.equal(result.status, "PAGO");
    assert.equal(result.origem_pagamento, "ASAAS");
    assert.equal(writes.length, 1);
    assert.equal(
      writes[0].filters.some((filter) =>
        filter[0] === "eq" && filter[1] === "status" &&
        filter[2] === "PENDENTE"
      ),
      true,
    );
    assert.equal(
      writes[0].filters.some((filter) =>
        filter[0] === "eq" && filter[1] === "origem_pagamento" &&
        filter[2] === "LOCAL"
      ),
      true,
    );
    assert.equal(
      writes[0].filters.some((filter) =>
        filter[0] === "eq" && filter[1] === "updated_at" &&
        filter[2] === snapshot.updated_at
      ),
      true,
    );
    assert.equal(
      writes[0].filters.some((filter) =>
        filter[0] === "eq" && filter[1] === "asaas_payment_id" &&
        filter[2] === "pay_1"
      ),
      true,
    );
  });
});

Deno.test("refresh preserva baixa manual concorrente e marca revisão", async () => {
  await withRemotePayment(async () => {
    const manualSettlement = {
      ...snapshot,
      status: "PAGO",
      origem_pagamento: "PRESENCIAL",
      updated_at: "2026-07-21T10:01:00.000Z",
    };
    const writes: QueryWrite[] = [];
    const admin = createReceivableAdmin({
      reads: [{ ...snapshot }, manualSettlement],
      updateResults: [null, manualSettlement],
      writes,
    });
    const service = createAsaasBillingService(admin, () => false);

    const result = await service.refreshReceivableStatus(runtime, {
      ...snapshot,
    });

    assert.equal(result.status, "PAGO");
    assert.equal(result.origem_pagamento, "PRESENCIAL");
    assert.equal(result.asaas_refresh_review_required, true);
    assert.match(String(result.asaas_last_error), /REVISAO_ASAAS_REFRESH/);
    assert.equal(writes.length, 2);
    assert.equal("status" in writes[1].values, false);
    assert.equal("origem_pagamento" in writes[1].values, false);
    assert.match(
      String(writes[1].values.asaas_last_error),
      /conciliacao manual/,
    );
  });
});
