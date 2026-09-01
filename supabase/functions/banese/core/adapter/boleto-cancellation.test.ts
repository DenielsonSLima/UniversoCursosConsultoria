import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE } from "../../internal/testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../../internal/testing/pix-fixture.ts";
import { cancelBaneseBoleto } from "./boleto-cancellation.ts";

const admin = {
  rpc: (_name: string, params?: Record<string, unknown>) =>
    Promise.resolve({
      data: String(params?.p_secret_name || "").includes("client_id")
        ? "client-id"
        : "client-secret",
      error: null,
    }),
};

const titleResponse = (situationCode: number, qrCode?: string) => ({
  NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  NumeroLinhaDigitavel: BANESE_DOCUMENT_FIXTURE.digitableLine,
  NumeroCodigoBarras: BANESE_DOCUMENT_FIXTURE.barcode,
  ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
  DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
  NumeroDocumento: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 15),
  IdTituloEmpresa: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 25),
  Pagador: {
    TipoPessoa: "F",
    NumeroCPFCNPJ: Number(BANESE_DOCUMENT_FIXTURE.payer.document),
  },
  CodigoSituacaoBoleto: situationCode,
  ...(qrCode ? { QrCode: qrCode } : {}),
});

const cancellationInput = () => ({
  convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
  stopWhenPixAvailable: true,
  expectedAmount: BANESE_DOCUMENT_FIXTURE.amount,
  expectedDueDate: BANESE_DOCUMENT_FIXTURE.dueDate,
  expectedAgency: BANESE_DOCUMENT_FIXTURE.beneficiary.agency,
  expectedAccount: BANESE_DOCUMENT_FIXTURE.beneficiary.account,
  expectedDocumentNumber: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 15),
  expectedCompanyTitleId: BANESE_DOCUMENT_FIXTURE.receivableId.slice(0, 25),
  expectedPayerDocument: BANESE_DOCUMENT_FIXTURE.payer.document,
  expectedDigitableLine: BANESE_DOCUMENT_FIXTURE.digitableLine,
  expectedBarcode: BANESE_DOCUMENT_FIXTURE.barcode,
});

const withMockedBanese = async (
  title: (canceled: boolean) => Record<string, unknown>,
  test: (methods: string[]) => Promise<void>,
  paymentStatus = 200,
) => {
  const originalFetch = globalThis.fetch;
  let canceled = false;
  const methods: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    methods.push(method);
    if (method === "POST") {
      return new Response(
        JSON.stringify({
          access_token: "token-test",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200 },
      );
    }
    if (method === "PUT" && url.endsWith("/baixa")) {
      canceled = true;
      return new Response("", { status: 200 });
    }
    if (url.endsWith("/pagamentos/efetivados")) {
      return new Response(paymentStatus === 200 ? "[]" : "indisponivel", {
        status: paymentStatus,
      });
    }
    return new Response(JSON.stringify(title(canceled)), { status: 200 });
  };
  try {
    await test(methods);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

Deno.test("baixa para e recupera o Pix oficial antes de qualquer PUT", async () => {
  const payload = buildBanesePixPayloadFixture(
    "BAIXA-PARADA-PELO-PIX",
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  await withMockedBanese(
    () => titleResponse(2, payload),
    async (methods) => {
      const result = await cancelBaneseBoleto(
        admin,
        "production",
        cancellationInput(),
      );
      assert.equal(result.pixAvailable, true);
      assert.equal(result.mutationAttempted, false);
      assert.equal(methods.includes("PUT"), false);
    },
  );
});

Deno.test("baixa pendente somente apos identidade e confirma situacao 5", async () => {
  let mutationStarts = 0;
  await withMockedBanese(
    (canceled) => titleResponse(canceled ? 5 : 2),
    async (methods) => {
      const result = await cancelBaneseBoleto(admin, "production", {
        ...cancellationInput(),
        onMutationStart: () => {
          mutationStarts += 1;
        },
      });
      assert.equal(result.situationCode, 5);
      assert.equal(result.pixAvailable, false);
      assert.equal(result.alreadyCanceled, false);
      assert.equal(result.mutationAttempted, true);
      assert.equal(mutationStarts, 1);
      assert.equal(methods.filter((method) => method === "PUT").length, 1);
    },
  );
});

Deno.test("titulo cancelado com QrCode nunca e recuperado como pendente", async () => {
  const payload = buildBanesePixPayloadFixture(
    "PIX-DE-TITULO-CANCELADO",
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  await withMockedBanese(
    () => titleResponse(5, payload),
    async (methods) => {
      const result = await cancelBaneseBoleto(
        admin,
        "production",
        cancellationInput(),
      );
      assert.equal(result.alreadyCanceled, true);
      assert.equal(result.pixAvailable, false);
      assert.equal(result.mutationAttempted, false);
      assert.equal(methods.includes("PUT"), false);
    },
  );
});

Deno.test("falha em pagamentos efetivados bloqueia Pix e PUT", async () => {
  const payload = buildBanesePixPayloadFixture(
    "PIX-COM-PAGAMENTOS-INDISPONIVEIS",
    BANESE_DOCUMENT_FIXTURE.amount,
  );
  await withMockedBanese(
    () => titleResponse(2, payload),
    async (methods) => {
      await assert.rejects(
        () => cancelBaneseBoleto(admin, "production", cancellationInput()),
        /PagamentosEfetivados antes da baixa/i,
      );
      assert.equal(methods.includes("PUT"), false);
    },
    503,
  );
});

Deno.test("baixa recusa linha local divergente antes do PUT", async () => {
  await withMockedBanese(
    () => titleResponse(2),
    async (methods) => {
      await assert.rejects(
        () =>
          cancelBaneseBoleto(admin, "production", {
            ...cancellationInput(),
            expectedDigitableLine: "1".repeat(47),
          }),
        /Linha digitavel ou codigo de barras diverge/i,
      );
      assert.equal(methods.includes("PUT"), false);
    },
  );
});
