import assert from "node:assert/strict";
import { paymentResponseFromReceivable } from "./gateway-view.ts";

Deno.test("reabertura do checkout usa o snapshot persistido da cobranca", () => {
  const response = paymentResponseFromReceivable(
    {
      gateway_payment_id: "000000074",
      gateway_payment_method: "BOLETO",
      gateway_installments: 1,
      gateway_status: "PAID",
      valor: 14.9,
      data_vencimento: "2026-08-01",
    },
    {
      charge: {
        method: "PIX",
        installmentCount: 3,
        value: 109.9,
        dueDate: "2026-09-01",
      },
      course: { nome: "Auxiliar Administrativo" },
    } as any,
    "banese_card",
  );

  assert.equal(response.method, "BOLETO");
  assert.equal(response.installments, 1);
  assert.equal(response.value, 14.9);
  assert.equal(response.dueDate, "2026-08-01");
});
