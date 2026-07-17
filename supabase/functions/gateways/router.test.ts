import assert from "node:assert/strict";
import {
  gatewayTransactionInputFromReceivable,
  repairGatewayTransactionFromReceivable,
} from "./router.ts";

const repairableReceivable = {
  id: "11111111-1111-4111-8111-111111111111",
  valor: 99.9,
  gateway_provider: "banese_card",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: "000000015",
  gateway_boleto_nosso_numero: "000000015",
  gateway_boleto_linha_digitavel: "1".repeat(47),
  gateway_boleto_codigo_barras: "2".repeat(44),
  gateway_status: "PENDING",
  gateway_installments: 1,
};

Deno.test("reconstroi auditoria bancaria a partir do recebivel persistido", () => {
  const input = gatewayTransactionInputFromReceivable(repairableReceivable);

  assert.ok(input);
  assert.equal(input.providerCode, "banese_card");
  assert.equal(input.result.remotePaymentId, "000000015");
  assert.equal(input.result.bankSlipOurNumber, "000000015");
  assert.deepEqual(input.result.rawPayload, { repairedFromReceivable: true });
});

Deno.test("nao inventa auditoria sem identidade remota", () => {
  assert.equal(gatewayTransactionInputFromReceivable({
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
  }), null);
});

Deno.test("reparo preserva auditoria existente sem executar update", async () => {
  let writes = 0;
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { id: "audit-existing" }, error: null }),
    update: () => {
      writes += 1;
      return builder;
    },
    insert: async () => {
      writes += 1;
      return { error: null };
    },
  };
  const admin = { from: () => builder };

  assert.equal(
    await repairGatewayTransactionFromReceivable(
      admin,
      repairableReceivable,
    ),
    true,
  );
  assert.equal(writes, 0);
});

Deno.test("reparo concorrente aceita auditoria criada por outra requisicao", async () => {
  let lookups = 0;
  let inserts = 0;
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => {
      lookups += 1;
      return lookups < 2
        ? { data: null, error: null }
        : { data: { id: "audit-concurrent" }, error: null };
    },
    insert: async () => {
      inserts += 1;
      return { error: { message: "duplicate key" } };
    },
  };
  const admin = { from: () => builder };

  assert.equal(
    await repairGatewayTransactionFromReceivable(
      admin,
      repairableReceivable,
    ),
    true,
  );
  assert.equal(inserts, 1);
  assert.equal(lookups, 2);
});
