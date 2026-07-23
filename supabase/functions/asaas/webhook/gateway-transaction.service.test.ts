import assert from "node:assert/strict";
import { syncAsaasGatewayTransaction } from "./gateway-transaction.service.ts";

const receivable = {
  id: "00000000-0000-4000-8000-000000000201",
  valor: 99.9,
  gateway_payment_method: "BOLETO",
  gateway_payment_id: "pay_1",
  gateway_customer_id: "cus_1",
  gateway_payment_link_id: null,
  gateway_installment_id: null,
  gateway_status: "RECEIVED",
  gateway_fee_value: 2.5,
  gateway_net_value: 97.4,
  gateway_invoice_url: "https://sandbox.asaas.com/i/pay_1",
  gateway_bank_slip_url: null,
  gateway_transaction_receipt_url: "https://asaas.com/r/pay_1",
  gateway_last_error: null,
};

const payment = {
  id: "pay_1",
  customer: "cus_1",
  billingType: "BOLETO",
  value: 99.9,
  status: "RECEIVED",
};

Deno.test("insere payment_gateway_transactions com snapshot Asaas canônico", async () => {
  let inserted: Record<string, unknown> | null = null;
  const admin = {
    from(table: string) {
      assert.equal(table, "payment_gateway_transactions");
      const readQuery = {
        select: () => readQuery,
        eq: () => readQuery,
        maybeSingle: () => ({ data: null, error: null }),
      };
      return {
        ...readQuery,
        insert(values: Record<string, unknown>) {
          inserted = values;
          const query = {
            select: () => query,
            maybeSingle: () => ({
              data: { id: "tx_1", ...values },
              error: null,
            }),
          };
          return query;
        },
      };
    },
  };

  await syncAsaasGatewayTransaction({
    admin,
    environment: "sandbox",
    receivable,
    payment,
    syncedAt: "2026-07-22T11:00:00.000Z",
  });

  const captured = inserted as unknown as Record<string, unknown> | null;
  assert.ok(captured);
  assert.equal(captured.provider_code, "asaas");
  assert.equal(captured.environment, "sandbox");
  assert.equal(captured.receivable_id, receivable.id);
  assert.equal(captured.remote_payment_id, payment.id);
  assert.equal(captured.remote_status, receivable.gateway_status);
  assert.equal(captured.amount, receivable.valor);
});

Deno.test("rejeita transação Asaas já pertencente a outro recebível", async () => {
  await assert.rejects(
    () =>
      syncAsaasGatewayTransaction({
        admin: { from: () => assert.fail("não deveria acessar o banco") },
        environment: "sandbox",
        receivable,
        payment,
        syncedAt: "2026-07-22T11:00:00.000Z",
        existing: {
          id: "tx_1",
          receivable_id: "00000000-0000-4000-8000-000000000299",
        },
      }),
    /outro recebível/i,
  );
});

Deno.test("retry reutiliza a transacao canonica sem inserir duplicata", async () => {
  let updates = 0;
  let inserts = 0;
  const initial = {
    id: "tx_1",
    receivable_id: receivable.id,
    provider_code: "asaas",
    environment: "sandbox",
    payment_method: "BOLETO",
    remote_payment_id: payment.id,
    remote_customer_id: payment.customer,
    remote_payment_link_id: null,
    remote_installment_id: null,
    remote_status: "PENDING",
    amount: receivable.valor,
    fee_value: receivable.gateway_fee_value,
    net_value: receivable.gateway_net_value,
    invoice_url: receivable.gateway_invoice_url,
    bank_slip_url: null,
    transaction_receipt_url: receivable.gateway_transaction_receipt_url,
    raw_payload: {},
    last_error: null,
    synced_at: "2026-07-22T10:59:00.000Z",
    updated_at: "2026-07-22T10:59:00.000Z",
  };
  const admin = {
    from(table: string) {
      assert.equal(table, "payment_gateway_transactions");
      let values: Record<string, unknown> = {};
      const query = {
        update(nextValues: Record<string, unknown>) {
          updates += 1;
          values = nextValues;
          return query;
        },
        insert: () => {
          inserts += 1;
          throw new Error("retry nao deve inserir");
        },
        eq: () => query,
        is: () => query,
        select: () => query,
        maybeSingle: () => ({
          data: { ...initial, ...values },
          error: null,
        }),
      };
      return query;
    },
  };

  const first = await syncAsaasGatewayTransaction({
    admin,
    environment: "sandbox",
    receivable,
    payment,
    syncedAt: "2026-07-22T11:00:00.000Z",
    existing: initial,
  });
  const second = await syncAsaasGatewayTransaction({
    admin,
    environment: "sandbox",
    receivable,
    payment,
    syncedAt: "2026-07-22T11:01:00.000Z",
    existing: first,
  });

  assert.equal(second.id, initial.id);
  assert.equal(second.remote_status, receivable.gateway_status);
  assert.equal(updates, 2);
  assert.equal(inserts, 0);
});

Deno.test("CAS de transação falha fechado diante de estado concorrente", async () => {
  const initial = {
    id: "tx_1",
    receivable_id: receivable.id,
    provider_code: "asaas",
    environment: "sandbox",
    payment_method: "BOLETO",
    remote_payment_id: "pay_1",
    remote_status: "PENDING",
    updated_at: "2026-07-22T10:59:00.000Z",
    raw_payload: {},
  };
  const concurrent = {
    ...initial,
    remote_status: "REFUNDED",
    updated_at: "2026-07-22T11:00:01.000Z",
  };
  let call = 0;
  const admin = {
    from(table: string) {
      assert.equal(table, "payment_gateway_transactions");
      call += 1;
      if (call === 1) {
        let filters = 0;
        const query = {
          update: () => query,
          eq: () => {
            filters += 1;
            return query;
          },
          is: () => {
            filters += 1;
            return query;
          },
          select: () => query,
          maybeSingle: () => {
            assert.ok(filters >= 7);
            return { data: null, error: null };
          },
        };
        return query;
      }
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => ({ data: concurrent, error: null }),
      };
      return query;
    },
  };

  await assert.rejects(
    () =>
      syncAsaasGatewayTransaction({
        admin,
        environment: "sandbox",
        receivable,
        payment,
        syncedAt: "2026-07-22T11:00:00.000Z",
        existing: initial,
      }),
    /mudou durante o CAS/i,
  );
});
