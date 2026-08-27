import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
} from "../../internal/testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../../internal/testing/pix-fixture.ts";
import { queryBaneseBoleto } from "./boleto.ts";

const accessToken = {
  accessToken: "token-teste",
  tokenType: "Bearer",
  expiresIn: 3600,
  scope: null,
  raw: null,
};

const withBaneseQueryFetch = async (
  response: Record<string, unknown>,
  test: (methods: string[]) => Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    methods.push(
      String(init?.method || (input instanceof Request ? input.method : "GET"))
        .toUpperCase(),
    );
    return url.endsWith("/pagamentos/efetivados")
      ? new Response("[]", { status: 200 })
      : new Response(JSON.stringify(response), { status: 200 });
  };
  try {
    await test(methods);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

Deno.test("consulta oficial recupera QrCode textual sem novo POST", async () => {
  const payload = buildBanesePixPayloadFixture(
    "RECUPERACAO-GET",
    BANESE_DOCUMENT_FIXTURE.amount,
    "br.gov.bcb.pix",
  );
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    CodigoSituacaoBoleto: 2,
    QrCode: payload,
  };

  await withBaneseQueryFetch(response, async (methods) => {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken,
        recoverPix: true,
      },
    );

    assert.equal(result.pixPayload, payload);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
    assert.equal((result.raw as any).pixDiagnostic.complete, true);
    assert.deepEqual(methods, ["GET", "GET"]);
  });
});

Deno.test("consulta comum evita renderizar QR quando o snapshot ja existe", async () => {
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    CodigoSituacaoBoleto: 2,
    QrCode: buildBanesePixPayloadFixture(
      "SEM-RECUPERACAO",
      BANESE_DOCUMENT_FIXTURE.amount,
    ),
  };

  await withBaneseQueryFetch(response, async (methods) => {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken,
      },
    );

    assert.equal(result.pixPayload, null);
    assert.equal(result.pixEncodedImage, null);
    assert.equal("pixDiagnostic" in (result.raw as object), false);
    assert.deepEqual(methods, ["GET", "GET"]);
  });
});

Deno.test("rejeita Nosso Numero divergente informado pelo retorno", async () => {
  const response = {
    NossoNumero: "999999999",
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    CodigoSituacaoBoleto: 2,
  };

  await withBaneseQueryFetch(response, async (methods) => {
    await assert.rejects(
      () =>
        queryBaneseBoleto(
          { rpc: async () => ({ data: null, error: null }) },
          "production",
          {
            convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
            nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
            accessToken,
          },
        ),
      /Nosso Numero retornado.*diverge/i,
    );
    assert.deepEqual(methods, ["GET"]);
  });
});

Deno.test("normaliza Nosso Numero numerico sem zeros a esquerda", async () => {
  const response = {
    NossoNumero: Number(BANESE_DOCUMENT_FIXTURE.ourNumber),
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    CodigoSituacaoBoleto: 2,
  };

  await withBaneseQueryFetch(response, async (methods) => {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken,
      },
    );
    assert.equal(result.nossoNumero, BANESE_DOCUMENT_FIXTURE.ourNumber);
    assert.deepEqual(methods, ["GET", "GET"]);
  });
});
