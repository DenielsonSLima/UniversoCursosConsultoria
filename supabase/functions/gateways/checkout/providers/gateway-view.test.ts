import assert from "node:assert/strict";
import {
  paymentResponseFromReceivable,
  shouldReuseReceivable,
} from "./gateway-view.ts";

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

Deno.test("reuse aceita somente recebivel local aberto e nao pago", () => {
  const context = {
    environment: "production",
    charge: {
      method: "BOLETO",
      installmentCount: 1,
      value: 14.9,
      dueDate: "2026-09-01",
    },
  } as any;
  const base = {
    gateway_provider: "banese_card",
    gateway_payment_method: "BOLETO",
    gateway_environment: "production",
    gateway_installments: 1,
    gateway_status: "PENDING",
    gateway_invoice_url: "https://boleto.example",
    valor: 14.9,
    data_vencimento: "2026-09-01",
    data_pagamento: null,
  };

  for (const status of ["PENDENTE", "VENCIDO"]) {
    assert.equal(
      shouldReuseReceivable({ ...base, status }, context, "banese_card"),
      true,
      status,
    );
  }
  for (
    const status of [
      "SUSPENSO",
      "CANCELADO",
      "ESTORNADO",
      "DEVOLVIDO",
      "PAGO",
    ]
  ) {
    assert.equal(
      shouldReuseReceivable({ ...base, status }, context, "banese_card"),
      false,
      status,
    );
  }
  assert.equal(
    shouldReuseReceivable(
      { ...base, status: "PENDENTE", data_pagamento: "2026-08-26" },
      context,
      "banese_card",
    ),
    false,
  );
});
