import assert from "node:assert/strict";
import { reconcileBaneseReceivable } from "./banese.ts";
import { baneseDocumentFixtureAt } from "../../banese/internal/testing/document-fixture.ts";
import { boletoSnapshot, fakeAdmin, RECEIVABLE_ID, receivableFixture } from "./banese-test-harness.ts";

const document = baneseDocumentFixtureAt(0, "2026-09-06", 279.9);
const terms = {
  nominalAmount: 279.9, dueDate: "2026-09-06",
  discount: { type: "fixed", value: 19.9, validUntil: "2026-09-06" },
  penalty: { type: "fixed", value: 5.6, startsOn: "2026-09-07" },
  interest: { type: "daily-fixed", value: 0.09, startsOn: "2026-09-07" },
};
const setup = () => fakeAdmin(receivableFixture({
  valor: 279.9, data_vencimento: "2026-09-06", gateway_financial_terms: terms,
  gateway_boleto_nosso_numero: document.ourNumber, gateway_payment_id: document.ourNumber,
  gateway_boleto_linha_digitavel: document.digitableLine, gateway_boleto_codigo_barras: document.barcode,
  gateway_pix_payload: null, gateway_pix_encoded_image: null,
}), [{
  id: "legacy-synthetic-transaction", receivable_id: RECEIVABLE_ID,
  provider_code: "banese_card", environment: "sandbox", payment_method: "BOLETO",
  remote_payment_id: document.ourNumber, bank_slip_our_number: document.ourNumber,
  bank_slip_digitable_line: document.digitableLine, bank_slip_barcode: document.barcode,
  raw_payload: { importSource: "BANESE_API_LEGACY_DISCOVERY" },
}]);
const snapshot = (amount: number, date: string) => boletoSnapshot({
  nossoNumero: document.ourNumber, paid: true, situationCode: 3, remoteStatus: "PAID",
  pixPayload: null, pixEncodedImage: null, financialTerms: terms,
  payments: [{ ValorPago: amount, DataPagamento: date, BancoRecebedor: "047" }],
  raw: { CodigoSituacaoBoleto: 3, NossoNumero: document.ourNumber,
    NumeroLinhaDigitavel: document.digitableLine, NumeroCodigoBarras: document.barcode },
});

Deno.test("legado pago260 em08/09 concilia via caminho canônico sem mudar vencimento/termos", async () => {
  const admin = setup();
  const before = JSON.stringify(admin.tables.contas_receber[0].gateway_financial_terms);
  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: () => Promise.resolve(snapshot(260, "2026-09-08") as any),
  });
  const row = admin.tables.contas_receber[0];
  assert.equal(row.status, "PAGO");
  assert.equal(row.valor_pago, 260);
  assert.equal(row.data_pagamento, "2026-09-08");
  assert.equal(row.data_vencimento, "2026-09-06");
  assert.equal(JSON.stringify(row.gateway_financial_terms), before);
  assert.equal(row.gateway_pix_payload, null);
  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
});

Deno.test("legado protege baixa fora da faixa exata ou depois da prorrogação", async () => {
  for (const [amount, date] of [[259.99, "2026-09-08"], [260.01, "2026-09-08"],
    [270, "2026-09-08"], [279.9, "2026-09-08"], [285.68, "2026-09-08"], [260, "2026-09-09"]] as const) {
    const admin = setup();
    await assert.rejects(() => reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
      queryBoleto: () => Promise.resolve(snapshot(amount, date) as any),
    }), /termos confirmados do titulo/);
    assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
  }
});
