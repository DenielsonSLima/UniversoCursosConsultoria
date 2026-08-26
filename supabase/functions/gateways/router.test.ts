import assert from "node:assert/strict";
import {
  createGatewayCharge,
  gatewayTransactionInputFromReceivable,
  normalizeGatewayAdapterResult,
  repairGatewayTransactionFromReceivable,
} from "./router.ts";

for (const environment of ["sandbox", "production"] as const) {
  Deno.test(`facade bloqueia Pix Banese direto em ${environment} antes de consultar configuracao`, async () => {
    let databaseReads = 0;
    await assert.rejects(
      () =>
        createGatewayCharge({
          admin: {
            from: () => {
              databaseReads += 1;
              throw new Error("nao deveria consultar configuracao");
            },
          },
          supabaseUrl: "https://example.supabase.co",
          providerCode: "banese_card",
          environment,
          paymentMethod: "PIX",
          receivable: { id: `receivable-${environment}` },
          payer: {},
          amount: 99.9,
          description: "Matricula",
        }),
      /Pix Banese direto permanece bloqueado.*BolePix.*BOLETO/i,
    );
    assert.equal(databaseReads, 0);
  });
}

Deno.test("normalizacao preserva o Pix oficial apresentado pelo BolePix BOLETO", () => {
  const bolePix = normalizeGatewayAdapterResult("banese_card", "BOLETO", {
    id: "boleto-123",
    link: "https://example.supabase.co/functions/v1/banese-boleto-document",
    pixPayload: "pix-copia-e-cola-oficial",
    pixEncodedImage: "imagem-qr-oficial",
  });

  assert.equal(
    bolePix.bankSlipUrl,
    "https://example.supabase.co/functions/v1/banese-boleto-document",
  );
  assert.equal(bolePix.pixPayload, "pix-copia-e-cola-oficial");
  assert.equal(bolePix.pixEncodedImage, "imagem-qr-oficial");
});

Deno.test("facade aceita somente o escopo Banese e Mercado Pago para novas cobrancas", async () => {
  let databaseReads = 0;
  const base = {
    admin: {
      from: () => {
        databaseReads += 1;
        throw new Error("nao deveria consultar configuracao");
      },
    },
    supabaseUrl: "https://example.supabase.co",
    environment: "sandbox" as const,
    receivable: { id: "receivable-scope" },
    payer: {},
    amount: 99.9,
    description: "Matricula",
  };

  await assert.rejects(
    () =>
      createGatewayCharge({
        ...base,
        providerCode: "asaas",
        paymentMethod: "BOLETO",
      }),
    /Asaas foi desativado/i,
  );
  await assert.rejects(
    () =>
      createGatewayCharge({
        ...base,
        providerCode: "mercado_pago",
        paymentMethod: "BOLETO",
      }),
    /somente cartao/i,
  );
  await assert.rejects(
    () =>
      createGatewayCharge({
        ...base,
        providerCode: "mercado_pago",
        paymentMethod: "CREDIT_CARD",
      }),
    /homologacao segura do cartao/i,
  );
  await assert.rejects(
    () =>
      createGatewayCharge({
        ...base,
        providerCode: "banco_inter" as any,
        paymentMethod: "BOLETO",
      }),
    /sem adapter homologado/i,
  );
  assert.equal(databaseReads, 0);
});

Deno.test("URL de checkout nao e gravada como id de payment link", () => {
  const asaas = normalizeGatewayAdapterResult("asaas", "BOLETO", {
    id: "pay_123",
    link: "https://sandbox.asaas.com/i/pay_123",
    invoiceUrl: "https://sandbox.asaas.com/i/pay_123",
  });
  assert.equal(asaas.remotePaymentId, "pay_123");
  assert.equal(asaas.remotePaymentLinkId, null);
  assert.equal(asaas.invoiceUrl, "https://sandbox.asaas.com/i/pay_123");

  const mercadoPago = normalizeGatewayAdapterResult(
    "mercado_pago",
    "CREDIT_CARD",
    {
      id: "preference_123",
      link: "https://www.mercadopago.com.br/checkout/v1/redirect",
    },
  );
  assert.equal(mercadoPago.remotePaymentLinkId, "preference_123");
  assert.equal(
    mercadoPago.invoiceUrl,
    "https://www.mercadopago.com.br/checkout/v1/redirect",
  );
});

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
  assert.equal(
    gatewayTransactionInputFromReceivable({
      gateway_provider: "banese_card",
      gateway_environment: "sandbox",
      gateway_payment_method: "BOLETO",
    }),
    null,
  );
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
