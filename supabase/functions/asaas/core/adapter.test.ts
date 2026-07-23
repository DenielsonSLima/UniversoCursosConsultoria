import assert from "node:assert/strict";
import { remotePaymentMatchesInput } from "./adapter.ts";

const input = {
  admin: {},
  environment: "sandbox" as const,
  paymentMethod: "BOLETO" as const,
  receivable: { id: "receivable-1" },
  payer: {},
  description: "Matricula",
  amount: 100,
  dueDate: "2026-08-10",
  installments: 1,
};

Deno.test("recovery Asaas exige metodo, valor e vencimento identicos", () => {
  assert.equal(
    remotePaymentMatchesInput({
      billingType: "BOLETO",
      value: 100,
      dueDate: "2026-08-10",
    }, input),
    true,
  );
  assert.equal(
    remotePaymentMatchesInput({
      billingType: "BOLETO",
      value: 100,
      dueDate: "2026-08-11",
    }, input),
    false,
  );
});
