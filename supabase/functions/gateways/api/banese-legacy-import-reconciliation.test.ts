import assert from "node:assert/strict";
import { baneseDocumentFixtureAt } from "../../banese/internal/testing/document-fixture.ts";
import { reconcileBaneseReceivable } from "./banese.ts";
import {
  adminFor,
  officialSnapshot,
  RECEIVABLE_ID,
  type Row,
} from "./banese-pix-reconciliation.fixture.ts";

Deno.test("consulta importação legada pelo Nosso Número sem sobrescrever par bancário divergente", async () => {
  const anotherTitle = baneseDocumentFixtureAt(1);
  const { admin, title } = adminFor([{
    id: "transaction-legacy-import",
    receivable_id: RECEIVABLE_ID,
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    raw_payload: JSON.stringify({ importSource: "BANESE_API_LEGACY_DISCOVERY" }),
    bank_slip_digitable_line: anotherTitle.digitableLine,
    bank_slip_barcode: anotherTitle.barcode,
  }]);
  title.gateway_boleto_linha_digitavel = anotherTitle.digitableLine;
  title.gateway_boleto_codigo_barras = anotherTitle.barcode;
  let persistCalled = false;
  let receivedQueryInput: unknown = null;

  await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
    queryBoleto: (_admin, _environment, input) => {
      receivedQueryInput = input;
      return Promise.resolve({
        ...officialSnapshot(), pixPayload: null, pixEncodedImage: null,
      } as any);
    },
    persistReconciliation: () => {
      persistCalled = true;
      throw new Error("snapshot nao deveria ser persistido");
    },
  });

  assert.equal(persistCalled, false);
  assert.equal((receivedQueryInput as Row)?.expectedAgency, undefined);
  assert.equal((receivedQueryInput as Row)?.expectedAccount, undefined);
  assert.equal(title.gateway_boleto_linha_digitavel, anotherTitle.digitableLine);
  assert.equal(title.gateway_boleto_codigo_barras, anotherTitle.barcode);
});
