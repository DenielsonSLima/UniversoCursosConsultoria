import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../internal/testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../../internal/testing/pix-fixture.ts";
import { queryBaneseBoleto } from "./boleto-query.ts";
import { normalizeBanesePixFromResponse } from "./boleto-pix-response.ts";

Deno.test("diagnostico registra forma de QrCode nulo sem expor conteudo", async () => {
  const result = await normalizeBanesePixFromResponse(
    { BolePix: { QrCode: null } },
    BANESE_DOCUMENT_FIXTURE.amount,
  );

  assert.equal(result.pixPayload, null);
  assert.equal(result.pixEncodedImage, null);
  assert.deepEqual(result.diagnostic.pixFieldShapes, [
    "bolepix:object",
    "bolepix.qrcode:null",
  ]);
});

Deno.test("recupera BolePix do envelope de pagamentos sem emitir outro titulo", async () => {
  const originalFetch = globalThis.fetch;
  const payload = buildBanesePixPayloadFixture(
    "RECUPERACAO-PAGAMENTOS",
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  const methods: string[] = [];
  const cacheControls: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    methods.push(String(init?.method || "GET").toUpperCase());
    cacheControls.push(headers.get("cache-control") || "");
    if (url.endsWith("/pagamentos/efetivados")) {
      return new Response(
        JSON.stringify({
          NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
          QrCode: payload,
          PagamentosEfetivados: [],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
        NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
        ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
        DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
        CodigoSituacaoBoleto: 2,
      }),
      { status: 200 },
    );
  };

  try {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken: {
          accessToken: "token-teste",
          tokenType: "Bearer",
          expiresIn: 3600,
          scope: null,
          raw: null,
        },
        recoverPix: true,
      },
    );

    assert.equal(result.pixPayload, payload);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
    assert.deepEqual(methods, ["GET", "GET"]);
    assert.deepEqual(cacheControls, ["no-cache", "no-cache"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("diagnostica separadamente o envelope de pagamentos sem Pix", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/pagamentos/efetivados")) {
      return new Response(
        JSON.stringify({
          BolePix: { QrCode: null },
          PagamentosEfetivados: [],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
        NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
        ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
        DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
        CodigoSituacaoBoleto: 2,
      }),
      { status: 200 },
    );
  };

  try {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken: {
          accessToken: "token-teste",
          tokenType: "Bearer",
          expiresIn: 3600,
          scope: null,
          raw: null,
        },
        recoverPix: true,
      },
    );

    assert.deepEqual(
      (result.raw as any).pixDiagnostic.paymentEnvelope.pixFieldShapes,
      ["bolepix:object", "bolepix.qrcode:null"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
