import assert from "node:assert/strict";
import { hasScopedServiceDocumentReadAccess, parseServiceDocumentContext,
  readServiceDocumentContext, withServiceDocumentContext } from "./service-document-context.ts";
import { BANESE_DOCUMENT_FIXTURE } from "./testing/document-fixture.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const metadata = () => ({ invoiceNumber: "123", serviceDescription: "Serviço do período contratado, com descrição autorizada.",
  installmentNumber: 1, installmentCount: 3, operationId: id(8), serviceId: id(9), receivableIds: [id(1), id(2), id(3)] });

Deno.test("service document references keep the full authorized description and frozen invoice number for every installment", () => {
  const raw = metadata(); raw.serviceDescription = "Descrição completa. ".repeat(100);
  const context = parseServiceDocumentContext(raw, id(1))!;
  const source = { ...BANESE_DOCUMENT_FIXTURE, receivableId: id(2) };
  const input = withServiceDocumentContext(source, context);
  assert.equal(input.serviceInvoice.description, raw.serviceDescription);
  assert.equal(input.serviceInvoice.number, "123");
  assert.deepEqual(input.installment, { current: 2, total: 3 });
  for (const field of ["barcode", "digitableLine", "ourNumber", "documentNumber"] as const) assert.equal(input[field], source[field]);
  assert.throws(() => withServiceDocumentContext({ ...source, receivableId: id(6) }, context));
});

Deno.test("unrelated documents keep the legacy path; malformed, oversized or foreign fiscal references fail closed", () => {
  assert.equal(parseServiceDocumentContext(null, id(1)), null);
  for (const override of [{ invoiceNumber: "" }, { serviceDescription: "x".repeat(2001) }, { installmentCount: 61 },
    { installmentNumber: 3 }, { receivableIds: [id(1), id(1), id(3)] }, { operationId: "untrusted" }]) {
    assert.throws(() => parseServiceDocumentContext({ ...metadata(), ...override }, id(1)));
  }
});

Deno.test("document data is trusted only from the service RPC and the caller JWT proves Receber permission", async () => {
  const seen: string[] = [];
  const admin = { rpc: async (name: string) => { seen.push(name); return { data: metadata(), error: null }; } };
  assert.equal((await readServiceDocumentContext(admin, id(1)))?.invoiceNumber, "123");
  assert.deepEqual(seen, ["get_nfse_service_boleto_context_internal"]);
  assert.equal(await hasScopedServiceDocumentReadAccess({ rpc: async () => ({ data: true, error: null }) }, id(1)), true);
  assert.equal(await hasScopedServiceDocumentReadAccess({ rpc: async () => ({ data: true, error: "denied" }) }, id(1)), false);
  await assert.rejects(readServiceDocumentContext({ rpc: async () => ({ data: null, error: "unavailable" }) }, id(1)));
});
