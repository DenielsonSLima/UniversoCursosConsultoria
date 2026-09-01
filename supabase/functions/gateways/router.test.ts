import assert from "node:assert/strict";
import {
  createGatewayCharge,
  gatewayTransactionInputFromReceivable,
  normalizeGatewayAdapterResult,
  repairGatewayTransactionFromReceivable,
} from "./router.ts";
import { withProviderMetadata } from "./router-adapter-runtime.ts";

const gatewayMetadataAdmin = (issuerPoloId: string) => ({
  from(table: string) {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => {
        if (table === "payment_gateway_credentials") {
          return { data: { metadata: {} }, error: null };
        }
        if (table === "payment_gateway_issuer_config") {
          return {
            data: {
              issuer_polo_id: issuerPoloId,
              active: true,
              applies_to_all_polos: true,
            },
            error: null,
          };
        }
        if (table === "polos") {
          return {
            data: {
              id: issuerPoloId,
              company_id: "company-matriz",
              nome: "Matriz",
              cnpj: "13278137000154",
              cidade: "Japoatã",
              estado: "SE",
              status: "ativo",
              is_matriz: true,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  },
});

Deno.test("router bloqueia drift do emissor antes de chamar o adapter", async () => {
  const issuerPoloId = "11111111-1111-4111-8111-111111111111";
  await assert.rejects(
    () =>
      withProviderMetadata({
        admin: gatewayMetadataAdmin(issuerPoloId),
        supabaseUrl: "https://example.supabase.co",
        providerCode: "banese_card",
        environment: "production",
        paymentMethod: "BOLETO",
        receivable: {
          id: "receivable-emissor",
          gateway_issuer_polo_id: "22222222-2222-4222-8222-222222222222",
        },
        payer: {},
        amount: 100,
        description: "Rematrícula",
      }),
    /emissor financeiro.*divergiu da Matriz/i,
  );
});

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

Deno.test("reparo Banese sem auditoria canônica não fabrica prova de POST", async () => {
  let writes = 0;
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async () => {
      writes += 1;
      return { error: null };
    },
  };

  assert.equal(
    await repairGatewayTransactionFromReceivable(
      { from: () => builder },
      repairableReceivable,
    ),
    false,
  );
  assert.equal(writes, 0);
});

Deno.test("reparo Banese exige auditoria do mesmo recebível", async () => {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (field: string, value: unknown) => {
      filters[field] = value;
      return builder;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async () => ({ error: null }),
  };

  assert.equal(
    await repairGatewayTransactionFromReceivable(
      { from: () => builder },
      repairableReceivable,
    ),
    false,
  );
  assert.equal(filters.receivable_id, repairableReceivable.id);
});

Deno.test("reparo Banese recusa auditoria originada de importação legada", async () => {
  let writes = 0;
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: {
        id: "legacy-import",
        raw_payload: { importSource: "BANESE_API_LEGACY_DISCOVERY" },
      },
      error: null,
    }),
    insert: async () => {
      writes += 1;
      return { error: null };
    },
  };

  assert.equal(
    await repairGatewayTransactionFromReceivable(
      { from: () => builder },
      repairableReceivable,
    ),
    false,
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
      {
        ...repairableReceivable,
        gateway_provider: "asaas",
        gateway_payment_id: "pay_repairable",
      },
    ),
    true,
  );
  assert.equal(inserts, 1);
  assert.equal(lookups, 2);
});
