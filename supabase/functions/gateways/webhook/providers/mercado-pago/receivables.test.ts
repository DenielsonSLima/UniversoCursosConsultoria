import assert from "node:assert/strict";
import type { GatewayWebhookContext } from "../../types.ts";
import {
  decideMercadoPagoProjection,
  mercadoPagoReviewMessage,
  persistMercadoPagoReview,
  updateMercadoPagoReceivable,
} from "./receivables.ts";

const RECEIVABLE_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("projecao de recebivel ainda nao pago pode ser aplicada", () => {
  assert.equal(
    decideMercadoPagoProjection({
      currentStatus: "PENDENTE",
      currentPaymentId: "preference-id",
      incomingPaymentId: "payment-a",
      incomingLocalStatus: "PAGO",
    }),
    "apply",
  );
});

Deno.test("evento nao pago nunca regride recebivel ja pago", () => {
  assert.equal(
    decideMercadoPagoProjection({
      currentStatus: "PAGO",
      currentPaymentId: "payment-a",
      incomingPaymentId: "payment-b",
      incomingLocalStatus: "CANCELADO",
    }),
    "preserve_paid_non_settlement",
  );
});

Deno.test("distingue PAGO duplicado do mesmo payment e de outro payment", () => {
  assert.equal(
    decideMercadoPagoProjection({
      currentStatus: "PAGO",
      currentPaymentId: "payment-a",
      incomingPaymentId: "payment-a",
      incomingLocalStatus: "PAGO",
    }),
    "duplicate_paid_same_payment",
  );
  assert.equal(
    decideMercadoPagoProjection({
      currentStatus: "PAGO",
      currentPaymentId: "payment-a",
      incomingPaymentId: "payment-b",
      incomingLocalStatus: "PAGO",
    }),
    "duplicate_paid_other_payment",
  );
});

Deno.test("fluxo preserva identidade e timestamps de recebivel ja pago", async () => {
  let writes = 0;
  const context = {
    environment: "sandbox",
    remotePaymentId: "payment-b",
    admin: {
      from() {
        writes += 1;
        throw new Error("nao deveria escrever recebivel ja pago");
      },
    },
  } as GatewayWebhookContext;
  const receivable = {
    id: RECEIVABLE_ID,
    status: "PAGO",
    valor: 99.9,
    gateway_payment_id: "payment-a",
    gateway_status: "approved",
    gateway_installments: 3,
    gateway_synced_at: "2026-07-20T10:00:00.000Z",
    data_pagamento: "2026-07-20",
  };

  const result = await updateMercadoPagoReceivable(context, {
    receivable,
    payment: {
      id: "payment-b",
      status: "rejected",
      installments: 1,
    },
    localStatus: "CANCELADO",
    paymentMethod: "CREDIT_CARD",
  });

  assert.equal(writes, 0);
  assert.equal(result.applied, false);
  assert.equal(result.projection, "preserve_paid_non_settlement");
  assert.equal(result.receivable.gateway_payment_id, "payment-a");
  assert.equal(
    result.receivable.gateway_synced_at,
    "2026-07-20T10:00:00.000Z",
  );

  const duplicate = await updateMercadoPagoReceivable({
    ...context,
    remotePaymentId: "payment-a",
  }, {
    receivable,
    payment: {
      id: "payment-a",
      status: "approved",
      transaction_amount: 99.9,
      installments: 3,
    },
    localStatus: "PAGO",
    paymentMethod: "CREDIT_CARD",
  });

  assert.equal(writes, 0);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.projection, "duplicate_paid_same_payment");
  assert.equal(
    duplicate.receivable.gateway_synced_at,
    "2026-07-20T10:00:00.000Z",
  );
});

Deno.test("concorrencia de dois PAGO preserva o primeiro e sinaliza revisao", async () => {
  const settled = {
    id: RECEIVABLE_ID,
    status: "PAGO",
    valor: 99.9,
    gateway_payment_id: "payment-a",
    gateway_status: "approved",
    gateway_installments: 3,
  };
  let tableReads = 0;
  const context = {
    environment: "sandbox",
    remotePaymentId: "payment-b",
    admin: {
      from(table: string) {
        assert.equal(table, "contas_receber");
        tableReads += 1;
        if (tableReads === 1) {
          const updateQuery = {
            update: () => updateQuery,
            eq: () => updateQuery,
            neq: () => updateQuery,
            select: () => updateQuery,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          };
          return updateQuery;
        }
        const readQuery = {
          select: () => readQuery,
          eq: () => readQuery,
          maybeSingle: () => Promise.resolve({ data: settled, error: null }),
        };
        return readQuery;
      },
    },
  } as GatewayWebhookContext;

  const result = await updateMercadoPagoReceivable(context, {
    receivable: {
      id: RECEIVABLE_ID,
      status: "PENDENTE",
      valor: 99.9,
      gateway_payment_id: "preference-id",
      gateway_installments: 3,
    },
    payment: {
      id: "payment-b",
      status: "approved",
      transaction_amount: 99.9,
      installments: 3,
    },
    localStatus: "PAGO",
    paymentMethod: "CREDIT_CARD",
  });

  assert.equal(result.applied, false);
  assert.equal(result.projection, "duplicate_paid_other_payment");
  assert.equal(result.reviewRequired, true);
  assert.equal(result.receivable.gateway_payment_id, "payment-a");
});

Deno.test("persiste revisao no recebivel e na tentativa do Mercado Pago", async () => {
  const writes: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Array<[string, unknown]>;
  }> = [];
  const context = {
    environment: "sandbox",
    admin: {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        let values: Record<string, unknown> = {};
        const query = {
          update(input: Record<string, unknown>) {
            values = input;
            return query;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return query;
          },
          then(resolve: (value: unknown) => unknown) {
            writes.push({ table, values, filters });
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return query;
      },
    },
  } as unknown as GatewayWebhookContext;

  const message = await persistMercadoPagoReview(context, {
    receivableId: RECEIVABLE_ID,
    remotePaymentId: "payment-a",
    reason: "payment_partially_refunded",
  });

  assert.equal(
    message,
    mercadoPagoReviewMessage("payment_partially_refunded", "payment-a"),
  );
  assert.equal(writes.length, 2);
  assert.equal(writes[0].table, "contas_receber");
  assert.equal(writes[0].values.gateway_last_error, message);
  assert.deepEqual(writes[0].filters, [["id", RECEIVABLE_ID]]);
  assert.equal(writes[1].table, "payment_gateway_transactions");
  assert.equal(writes[1].values.last_error, message);
  assert.deepEqual(writes[1].filters, [
    ["provider_code", "mercado_pago"],
    ["environment", "sandbox"],
    ["remote_payment_id", "payment-a"],
  ]);
});
