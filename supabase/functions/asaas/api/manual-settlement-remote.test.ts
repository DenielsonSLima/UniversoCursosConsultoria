import assert from "node:assert/strict";
import { cancelRemoteTitleBeforeManualSettlement } from "./manual-settlement-remote.ts";

const asaasReceivable = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "PENDENTE",
  gateway_provider: "asaas",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: "pay_123",
  asaas_payment_id: "pay_123",
  gateway_status: "PENDING",
  asaas_status: "PENDING",
};

const runtime = async () => ({
  environment: "sandbox" as const,
  baseUrl: "https://sandbox.example",
  apiKey: "test-key",
});

Deno.test("Asaas só libera baixa depois de consultar, cancelar e confirmar", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const responses = [
    new Response(JSON.stringify({ status: "PENDING" }), { status: 200 }),
    new Response(JSON.stringify({ deleted: true }), { status: 200 }),
    new Response(null, { status: 404 }),
  ];
  const result = await cancelRemoteTitleBeforeManualSettlement({
    admin: {},
    getAsaasRuntime: runtime,
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: String(init?.method || "GET") });
      return responses.shift()!;
    },
  }, asaasReceivable);

  assert.equal(result.required, true);
  assert.equal(result.asaasPaymentCanceled, true);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "DELETE", "GET"]);
});

Deno.test("título já pago no Asaas nunca é cancelado nem baixado manualmente", async () => {
  const methods: string[] = [];
  await assert.rejects(
    () =>
      cancelRemoteTitleBeforeManualSettlement({
        admin: {},
        getAsaasRuntime: runtime,
        fetcher: async (_url, init) => {
          methods.push(String(init?.method || "GET"));
          return new Response(JSON.stringify({ status: "RECEIVED" }), {
            status: 200,
          });
        },
      }, asaasReceivable),
    /já registrou pagamento/i,
  );
  assert.deepEqual(methods, ["GET"]);
});

Deno.test("falha ou retorno ambíguo do cancelamento Asaas falha fechado", async () => {
  const responses = [
    new Response(JSON.stringify({ status: "PENDING" }), { status: 200 }),
    new Response(JSON.stringify({ message: "indisponível" }), { status: 503 }),
  ];
  await assert.rejects(
    () =>
      cancelRemoteTitleBeforeManualSettlement({
        admin: {},
        getAsaasRuntime: runtime,
        fetcher: async () => responses.shift()!,
      }, asaasReceivable),
    /indisponível/i,
  );
});

Deno.test("título Banese emitido por CNAB não usa cancelamento da API", async () => {
  let apiCancellationCalled = false;
  await assert.rejects(
    () =>
      cancelRemoteTitleBeforeManualSettlement({
        admin: {},
        getAsaasRuntime: runtime,
        cancelBanese: async () => {
          apiCancellationCalled = true;
          throw new Error("não deveria chamar");
        },
      }, {
        status: "PENDENTE",
        gateway_provider: "banese_card",
        gateway_environment: "sandbox",
        gateway_payment_method: "BOLETO",
        gateway_boleto_nosso_numero: "000000015",
        gateway_submission_channel: "CNAB",
        gateway_submission_status: "CNAB_GENERATED",
      }),
    /canal CNAB/i,
  );
  assert.equal(apiCancellationCalled, false);
});
