import assert from "node:assert/strict";
import { cancelBaneseBoleto } from "./boleto-cancellation.ts";
import {
  bankRejectedCancellationForProcessingPayment,
  BaneseBoletoPaymentProcessingError,
} from "./boleto-cancellation-processing.ts";
import { adminForBaneseReservation } from "../adapter-test-fixtures.ts";
import { BANESE_DOCUMENT_FIXTURE as fixture } from "../../internal/testing/document-fixture.ts";

const processing = "ERRO_BOLETO_COM_PAGAMENTO_NAO_EFETIVADO";
Deno.test("Só o enum bancário exato comprova recusa por pagamento em processamento", () => {
  assert.equal(bankRejectedCancellationForProcessingPayment({ Erros: [{ CodigoErroProcessamento: ` ${processing} ` }] }), true);
  assert.equal(bankRejectedCancellationForProcessingPayment({ Erros: [{ CodigoErroProcessamento: "400", Descricao: processing }] }), true);
  for (const raw of [null, {}, { Erros: "erro" }, { Erros: [{ CodigoErroProcessamento: "500", Descricao: "Pagamento desconhecido" }] }, { Erros: [{ CodigoErroProcessamento: `prefix_${processing}` }] }]) {
    assert.equal(bankRejectedCancellationForProcessingPayment(raw), false);
  }
});

for (const httpStatus of [200, 400, 500]) {
  Deno.test(`Recusa explícita HTTP${httpStatus} mantém boleto aberto após consultar pagamentos`, async () => {
    const original = globalThis.fetch;
    let paymentQueries = 0;
    let putCount = 0;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.includes("/autenticacao/")) return new Response(JSON.stringify({ access_token: "fixture", token_type: "Bearer" }));
      if (init?.method === "PUT") {
        putCount++;
        return new Response(JSON.stringify({ Erros: [{ CodigoErroProcessamento: processing }] }), { status: httpStatus });
      }
      if (endpoint.endsWith("/pagamentos/efetivados")) {
        paymentQueries++;
        return new Response(JSON.stringify({ PagamentosEfetivados: [] }));
      }
      return new Response(JSON.stringify({
        NossoNumero: fixture.ourNumber, CodigoSituacaoBoleto: 2,
        ValorNominal: fixture.amount, DataVencimento: fixture.dueDate,
      }));
    }) as typeof fetch;
    try {
      await assert.rejects(() => cancelBaneseBoleto(adminForBaneseReservation(true), "sandbox", {
        convenio: fixture.beneficiary.agreement, nossoNumero: fixture.ourNumber,
      }), BaneseBoletoPaymentProcessingError);
      assert.equal(putCount, 1);
      assert.equal(paymentQueries, 2);
    } finally {
      globalThis.fetch = original;
    }
  });
}
