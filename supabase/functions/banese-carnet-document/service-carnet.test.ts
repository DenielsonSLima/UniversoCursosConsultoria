import assert from "node:assert/strict";
import { selectServiceCarnetRows } from "./service-carnet.ts";
import type { BaneseCarnetReceivableRow } from "./document-policy.ts";
import type { ServiceDocumentContext } from "../banese/internal/service-document-context.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context: ServiceDocumentContext = { invoiceNumber: "123", serviceDescription: "Serviço autorizado", installmentNumber: 1,
  installmentCount: 3, operationId: id(8), serviceId: id(9), receivableIds: [id(1), id(2), id(3)] };
const row = (n: number) => ({ id: id(n), cliente_id: id(4), polo_id: id(5), status: "PENDENTE",
  gateway_environment: "production", gateway_issuer_polo_id: id(5), gateway_boleto_convenio: "11111",
  gateway_boleto_agencia: "001", gateway_provider: "banese_card", gateway_payment_method: "BOLETO", gateway_status: "PENDING",
  gateway_financial_terms: {}, gateway_financial_terms_confirmed_at: "2026-11-12T20:00:00Z" } as BaneseCarnetReceivableRow);

Deno.test("service carnet uses its frozen invoice group, preserves installment order and omits settled titles", () => {
  assert.deepEqual(selectServiceCarnetRows(row(1), [row(3), row(1), { ...row(2), status: "PAGO" }], context).map(r => r.id), [id(1), id(3)]);
});
Deno.test("service carnet rejects a foreign payer, missing row, mixed issuer, unknown bank result or closed selected title", () => {
  const cases = [[row(1), row(2)], [row(1), row(2), { ...row(3), cliente_id: id(6) }],
    [row(1), row(2), { ...row(3), gateway_issuer_polo_id: id(6) }],
    [row(1), row(2), { ...row(3), gateway_status: "API_AMBIGUOUS" }],
    [row(1), row(2), { ...row(3), gateway_financial_terms_confirmed_at: null }]];
  for (const candidates of cases) assert.throws(() => selectServiceCarnetRows(row(1), candidates, context));
  assert.throws(() => selectServiceCarnetRows({ ...row(1), status: "PAGO" }, [{ ...row(1), status: "PAGO" }, row(2), row(3)], context));
});
