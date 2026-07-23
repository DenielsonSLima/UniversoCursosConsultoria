import assert from "node:assert/strict";
import type { GatewayWebhookContext } from "../../types.ts";
import {
  findMercadoPagoTransactionForPayment,
  mercadoPagoPreferenceIdFor,
  tryConsumeMercadoPagoPreferencePlaceholder,
} from "./transactions.ts";

const RECEIVABLE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RECEIVABLE_ID = "22222222-2222-4222-8222-222222222222";

type Transaction = Record<string, unknown> & {
  id: string;
  provider_code: string;
  environment: string;
  receivable_id: string;
  remote_payment_id: string;
  remote_payment_link_id?: string | null;
};

const contextFor = (transactions: Transaction[]): GatewayWebhookContext => ({
  providerCode: "mercado_pago",
  environment: "sandbox",
  eventId: "event-id",
  payload: {},
  remotePaymentId: null,
  supabaseUrl: "https://example.supabase.co",
  admin: {
    from(table: string) {
      assert.equal(table, "payment_gateway_transactions");
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        limit: () => query,
        maybeSingle: () => {
          const data = transactions.find((transaction) =>
            filters.every(([column, value]) => transaction[column] === value)
          );
          return Promise.resolve({ data: data || null, error: null });
        },
      };
      return query;
    },
  },
});

Deno.test("associa primeiro pelo remote_payment_id exato", async () => {
  const exact = {
    id: "transaction-exact",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: RECEIVABLE_ID,
    remote_payment_id: "987654321",
  };
  const latestButUnrelated = {
    id: "transaction-latest",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: RECEIVABLE_ID,
    remote_payment_id: "111111111",
  };

  const found = await findMercadoPagoTransactionForPayment(
    contextFor([latestButUnrelated, exact]),
    {
      receivableId: RECEIVABLE_ID,
      remotePaymentId: "987654321",
      preferenceId: "3523270816-preference-id",
    },
  );

  assert.equal(found?.id, "transaction-exact");
});

Deno.test("na primeira notificacao associa a preferencia do mesmo recebivel", async () => {
  const placeholder = {
    id: "transaction-preference",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: RECEIVABLE_ID,
    remote_payment_id: "3523270816-preference-id",
  };

  const found = await findMercadoPagoTransactionForPayment(
    contextFor([placeholder]),
    {
      receivableId: RECEIVABLE_ID,
      remotePaymentId: "987654321",
      preferenceId: "3523270816-preference-id",
    },
  );

  assert.equal(found?.id, "transaction-preference");
});

Deno.test("nao reutiliza apenas a transacao mais recente do recebivel", async () => {
  const unrelated = {
    id: "transaction-unrelated",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: RECEIVABLE_ID,
    remote_payment_id: "111111111",
  };

  const found = await findMercadoPagoTransactionForPayment(
    contextFor([unrelated]),
    {
      receivableId: RECEIVABLE_ID,
      remotePaymentId: "987654321",
    },
  );

  assert.equal(found, null);
});

Deno.test("retry na mesma preferencia nao sobrescreve tentativa anterior", async () => {
  const rejectedAttempt = {
    id: "transaction-rejected",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: RECEIVABLE_ID,
    remote_payment_id: "111111111",
    remote_payment_link_id: "3523270816-preference-id",
  };

  const found = await findMercadoPagoTransactionForPayment(
    contextFor([rejectedAttempt]),
    {
      receivableId: RECEIVABLE_ID,
      remotePaymentId: "987654321",
      preferenceId: "3523270816-preference-id",
    },
  );

  assert.equal(found, null);
});

Deno.test("bloqueia remote_payment_id ja ligado a outro recebivel", async () => {
  const collision = {
    id: "transaction-collision",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: OTHER_RECEIVABLE_ID,
    remote_payment_id: "987654321",
  };

  await assert.rejects(
    () =>
      findMercadoPagoTransactionForPayment(contextFor([collision]), {
        receivableId: RECEIVABLE_ID,
        remotePaymentId: "987654321",
      }),
    /ja associado a outro recebivel/,
  );
});

Deno.test("bloqueia preference id ja ligado a outro recebivel", async () => {
  const collision = {
    id: "preference-collision",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: OTHER_RECEIVABLE_ID,
    remote_payment_id: "3523270816-preference-id",
  };

  await assert.rejects(
    () =>
      findMercadoPagoTransactionForPayment(contextFor([collision]), {
        receivableId: RECEIVABLE_ID,
        remotePaymentId: "987654321",
        preferenceId: "3523270816-preference-id",
      }),
    /Preferencia Mercado Pago ja associada a outro recebivel/,
  );
});

Deno.test("CAS permite consumir o placeholder apenas uma vez", async () => {
  const row: Transaction = {
    id: "transaction-placeholder",
    provider_code: "mercado_pago",
    environment: "sandbox",
    receivable_id: RECEIVABLE_ID,
    remote_payment_id: "3523270816-preference-id",
  };
  const casContext = {
    ...contextFor([row]),
    admin: {
      from(table: string) {
        assert.equal(table, "payment_gateway_transactions");
        const filters: Array<[string, unknown]> = [];
        let updatePayload: Record<string, unknown> = {};
        const query = {
          update: (payload: Record<string, unknown>) => {
            updatePayload = payload;
            return query;
          },
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return query;
          },
          select: () => query,
          maybeSingle: () => {
            const matches = filters.every(([column, value]) =>
              row[column] === value
            );
            if (!matches) {
              return Promise.resolve({ data: null, error: null });
            }
            Object.assign(row, updatePayload);
            return Promise.resolve({ data: { id: row.id }, error: null });
          },
        };
        return query;
      },
    },
  };

  assert.equal(
    await tryConsumeMercadoPagoPreferencePlaceholder(casContext, {
      transactionId: row.id,
      preferenceId: "3523270816-preference-id",
      payload: { remote_payment_id: "payment-a" },
    }),
    true,
  );
  assert.equal(
    await tryConsumeMercadoPagoPreferencePlaceholder(casContext, {
      transactionId: row.id,
      preferenceId: "3523270816-preference-id",
      payload: { remote_payment_id: "payment-b" },
    }),
    false,
  );
  assert.equal(row.remote_payment_id, "payment-a");
});

Deno.test("extrai preference id do link sem tratar payment id numerico como preferencia", () => {
  assert.equal(
    mercadoPagoPreferenceIdFor({}, {
      gateway_payment_link_id:
        "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=3523270816-preference-id",
      gateway_payment_id: "987654321",
    }),
    "3523270816-preference-id",
  );
  assert.equal(
    mercadoPagoPreferenceIdFor({}, { gateway_payment_id: "987654321" }),
    "",
  );
});
