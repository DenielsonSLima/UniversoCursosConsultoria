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
  paymentStatus = 200,
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
      ? new Response(paymentStatus === 200 ? "[]" : "indisponivel", {
        status: paymentStatus,
      })
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

Deno.test("consulta recupera Pix antes da confirmacao de pagamentos", async () => {
  const payload = buildBanesePixPayloadFixture(
    "RETORNO-REDUZIDO",
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  const response = {
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
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
        expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
        expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
      },
    );

    assert.equal(result.pixPayload, payload);
    assert.match(result.pixEncodedImage ?? "", /^data:image\/png;base64,/);
    assert.match(
      result.paymentsError?.message ?? "",
      /PagamentosEfetivados.*falhou/i,
    );
    assert.deepEqual(methods, ["GET", "GET"]);
  }, 503);
});

Deno.test("consulta de recuperacao rejeita GET sem identidade financeira", async () => {
  const response = {
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    QrCode: buildBanesePixPayloadFixture(
      "SEM-IDENTIDADE-FINANCEIRA",
      BANESE_DOCUMENT_FIXTURE.amount,
    ),
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
            recoverPix: true,
            expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
            expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
          },
        ),
      /ValorNominal.*diverge/i,
    );
    assert.deepEqual(methods, ["GET"]);
  });
});

Deno.test("consulta aceita TipoJuroMora 3 como juros isentos", async () => {
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    CodigoSituacaoBoleto: 2,
    Juros: { TipoJuroMora: 3, Valor: null, Data: null },
    QrCode: buildBanesePixPayloadFixture(
      "JUROS-ISENTOS",
      BANESE_DOCUMENT_FIXTURE.amount,
    ),
  };

  await withBaneseQueryFetch(response, async () => {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken,
        recoverPix: true,
        expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
        expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
      },
    );

    assert.equal(result.financialTerms?.interest, null);
    assert.equal(result.financialTermsError, null);
    assert.ok(result.pixPayload);
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

Deno.test("importação legada confirmada como não paga não consulta pagamentos efetivados", async () => {
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
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
        skipEffectivePaymentsWhenOfficiallyUnpaid: true,
      },
    );

    assert.equal(result.paid, false);
    assert.equal(result.remoteStatus, "PENDING");
    assert.deepEqual(methods, ["GET"]);
  });
});

Deno.test("consulta abandona GET que ignora o sinal de cancelamento", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise<Response>(() => {});
  const controller = new AbortController();
  try {
    const query = queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken,
        signal: controller.signal,
      },
    );
    controller.abort(new DOMException("Banese query timeout", "TimeoutError"));
    await assert.rejects(query, /Banese query timeout/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("consulta com Pix persistido ainda valida a identidade completa", async () => {
  const receivableId = BANESE_DOCUMENT_FIXTURE.receivableId;
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    NumeroDocumento: "outro-documento",
    IdTituloEmpresa: receivableId.slice(0, 25),
    Pagador: { NumeroCPFCNPJ: 12345678901 },
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
            recoverPix: false,
            validateTitleIdentity: true,
            expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
            expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
            expectedDocumentNumber: receivableId.slice(0, 15),
            expectedCompanyTitleId: receivableId.slice(0, 25),
            expectedPayerDocument: "01234567890",
          },
        ),
      /NumeroDocumento.*diverge/i,
    );
    assert.deepEqual(methods, ["GET"]);
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

Deno.test("recuperacao exige identidade do recebivel e do pagador", async () => {
  const receivableId = BANESE_DOCUMENT_FIXTURE.receivableId;
  const payerDocument = "01234567890";
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    NumeroDocumento: receivableId.slice(0, 15),
    IdTituloEmpresa: receivableId.slice(0, 25),
    Pagador: { NumeroCPFCNPJ: Number(payerDocument) },
    CodigoSituacaoBoleto: 2,
    QrCode: buildBanesePixPayloadFixture(
      "IDENTIDADE-COMPLETA",
      BANESE_DOCUMENT_FIXTURE.amount,
    ),
  };

  await withBaneseQueryFetch(response, async () => {
    const result = await queryBaneseBoleto(
      { rpc: async () => ({ data: null, error: null }) },
      "production",
      {
        convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
        nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        accessToken,
        recoverPix: true,
        expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
        expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
        expectedDocumentNumber: receivableId.slice(0, 15),
        expectedCompanyTitleId: receivableId.slice(0, 25),
        expectedPayerDocument: payerDocument,
      },
    );
    assert.equal(
      (result.raw as any).IdTituloEmpresa,
      receivableId.slice(0, 25),
    );
    assert.ok(result.pixPayload);
  });
});

Deno.test("recuperacao rejeita identidade bancaria de outro recebivel", async () => {
  const receivableId = BANESE_DOCUMENT_FIXTURE.receivableId;
  const response = {
    NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
    NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
    NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
    ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
    DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
    NumeroDocumento: "outro-documento",
    IdTituloEmpresa: "outro-titulo",
    Pagador: { NumeroCPFCNPJ: 99999999999 },
    QrCode: buildBanesePixPayloadFixture(
      "IDENTIDADE-DIVERGENTE",
      BANESE_DOCUMENT_FIXTURE.amount,
    ),
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
            recoverPix: true,
            expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
            expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
            expectedDocumentNumber: receivableId.slice(0, 15),
            expectedCompanyTitleId: receivableId.slice(0, 25),
            expectedPayerDocument: "01234567890",
          },
        ),
      /NumeroDocumento.*diverge/i,
    );
    assert.deepEqual(methods, ["GET"]);
  });
});
