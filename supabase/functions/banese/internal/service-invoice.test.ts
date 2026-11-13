import assert from "node:assert/strict";
import { normalizeBaneseBoletoDocument } from "./types.ts";
import { validateServiceInvoiceDetails } from "./service-invoice.ts";
import { BANESE_DOCUMENT_FIXTURE } from "./testing/document-fixture.ts";

Deno.test("metadados NFS-e são opt-in e preservam todas as identidades bancárias", () => {
  const invoice = {
    number: "7",
    description: "Descrição integral do serviço sintético.",
  };
  const output = normalizeBaneseBoletoDocument({
    ...BANESE_DOCUMENT_FIXTURE,
    serviceInvoice: invoice,
  });
  assert.deepEqual(output.serviceInvoice, invoice);
  for (
    const key of [
      "ourNumber",
      "documentNumber",
      "barcode",
      "digitableLine",
    ] as const
  ) {
    assert.equal(output[key], BANESE_DOCUMENT_FIXTURE[key]);
  }
  assert.equal(
    normalizeBaneseBoletoDocument(BANESE_DOCUMENT_FIXTURE).serviceInvoice,
    undefined,
  );
});

Deno.test("descrição NFS-e aceita 2.000 caracteres integrais e rejeita excesso ou conteúdo inválido sem recortar", () => {
  const description = "Serviço sintético ".padEnd(2_000, "x");
  assert.equal(
    validateServiceInvoiceDetails({ number: "7", description }).description,
    description,
  );
  for (
    const invoice of [
      null,
      {},
      { number: "", description },
      { number: "7x", description },
      { number: "7", description: " " },
      { number: "7", description: `${description}x` },
      { number: "7", description: "Texto\u0000inválido" },
    ]
  ) {
    assert.throws(() => validateServiceInvoiceDetails(invoice));
  }
});
