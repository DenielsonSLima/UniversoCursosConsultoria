import assert from "node:assert/strict";
import {
  assertGatewayCreationFence,
  assertNoImplicitAsaasFallback,
  decideEnrollmentPaymentPatch,
  decideTechnicalInstallmentPaymentPatch,
  requireGatewayRouteForNewCharge,
  resolveAsaasBillingType,
  resolveManualSettlementReversalGateway,
  resolveReceivableGatewayPaymentMethod,
} from "./gateway-routing-guard.ts";

Deno.test("estorno recria link Asaas detached e preserva o metodo", () => {
  const decision = resolveManualSettlementReversalGateway({
    status: "PAGO",
    origem_pagamento: "PRESENCIAL",
    gateway_provider: "asaas",
    gateway_environment: "sandbox",
    gateway_payment_method: "CREDIT_CARD",
    forma_pagamento: "CARTAO",
    gateway_payment_link_id: "paylink_old",
    asaas_payment_link_id: null,
    cliente_id: null,
  }, true);

  assert.equal(decision.shouldRecreateAsaas, true);
  assert.equal(decision.shouldRecreateGateway, true);
  assert.equal(decision.clearCanceledGateway, true);
  assert.equal(decision.restoredLegacyPaymentMethod, "CARTAO");
});

Deno.test("fencing aceita a reserva atomica do Nosso Numero Banese", () => {
  const snapshot = {
    status: "PENDENTE",
    forma_pagamento: "BOLETO",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_status: "CREATING",
    gateway_boleto_nosso_numero: "000000015",
  };
  assert.doesNotThrow(() =>
    assertGatewayCreationFence({
      receivable: snapshot,
      providerCode: "banese_card",
      environment: "sandbox",
      paymentMethod: "BOLETO",
      expectedBankSlipOurNumber: "000000015",
    })
  );
  assert.throws(
    () =>
      assertGatewayCreationFence({
        receivable: snapshot,
        providerCode: "banese_card",
        environment: "sandbox",
        paymentMethod: "BOLETO",
        expectedBankSlipOurNumber: "000000016",
      }),
    /Nosso Numero reservado diverge/i,
  );
});

Deno.test("fencing rejeita tentativa que perdeu o token de ownership", () => {
  assert.throws(
    () =>
      assertGatewayCreationFence({
        receivable: {
          status: "PENDENTE",
          forma_pagamento: "PIX",
          gateway_provider: "asaas",
          gateway_environment: "sandbox",
          gateway_payment_method: "PIX",
          gateway_status: "CREATING",
          gateway_creation_token: "attempt-b",
        },
        providerCode: "asaas",
        environment: "sandbox",
        paymentMethod: "PIX",
        attemptToken: "attempt-a",
      }),
    /identidade da cobranca mudou/i,
  );
});

Deno.test("parcelas tecnicas recebem BOLETO antes da sincronizacao individual", () => {
  assert.equal(
    decideTechnicalInstallmentPaymentPatch({
      receivable: { status: "PENDENTE" },
      hasRemoteReference: false,
    }),
    "apply",
  );
  assert.equal(
    decideTechnicalInstallmentPaymentPatch({
      receivable: {
        status: "VENCIDO",
        forma_pagamento: "BOLETO",
        gateway_payment_method: "BOLETO",
      },
      hasRemoteReference: false,
    }),
    "noop",
  );
});

Deno.test("parcela tecnica nao troca metodo ou identidade bancaria existente", () => {
  assert.throws(
    () =>
      decideTechnicalInstallmentPaymentPatch({
        receivable: { status: "PENDENTE", forma_pagamento: "PIX" },
        hasRemoteReference: false,
      }),
    /metodo diferente de BOLETO/i,
  );
  assert.throws(
    () =>
      decideTechnicalInstallmentPaymentPatch({
        receivable: { status: "PENDENTE", gateway_payment_id: "titulo-1" },
        hasRemoteReference: true,
      }),
    /titulo bancario ja emitido/i,
  );
});

Deno.test("sync de matricula nao altera metodo pago ou titulo remoto", () => {
  assert.equal(
    decideEnrollmentPaymentPatch({
      receivable: {
        status: "PAGO",
        gateway_payment_method: "PIX",
        forma_pagamento: "PIX",
      },
      requestedMethod: "PIX",
      hasRemoteReference: true,
    }),
    "noop",
  );
  assert.throws(
    () =>
      decideEnrollmentPaymentPatch({
        receivable: {
          status: "PAGO",
          gateway_payment_method: "PIX",
          forma_pagamento: "PIX",
        },
        requestedMethod: "BOLETO",
        hasRemoteReference: true,
      }),
    /recebivel ja pago/i,
  );
  assert.throws(
    () =>
      decideEnrollmentPaymentPatch({
        receivable: {
          status: "PENDENTE",
          gateway_payment_method: "PIX",
          forma_pagamento: "PIX",
        },
        requestedMethod: "BOLETO",
        hasRemoteReference: true,
      }),
    /titulo bancario ja emitido/i,
  );
});

Deno.test("sync de matricula permite metodo novo somente antes da emissao", () => {
  assert.equal(
    decideEnrollmentPaymentPatch({
      receivable: { status: "PENDENTE" },
      requestedMethod: "CREDIT_CARD",
      hasRemoteReference: false,
    }),
    "apply",
  );
  assert.equal(
    decideEnrollmentPaymentPatch({
      receivable: {
        status: "VENCIDO",
        forma_pagamento: "BOLETO",
        gateway_payment_method: "BOLETO",
      },
      requestedMethod: "BOLETO",
      hasRemoteReference: false,
    }),
    "noop",
  );
});

Deno.test("sync de matricula nao troca metodo durante criacao remota", () => {
  for (const field of ["asaas_status", "gateway_status"] as const) {
    assert.throws(
      () =>
        decideEnrollmentPaymentPatch({
          receivable: {
            status: "PENDENTE",
            forma_pagamento: "PIX",
            gateway_payment_method: "PIX",
            [field]: "CREATING",
          },
          requestedMethod: "BOLETO",
          hasRemoteReference: false,
        }),
      /criacao do titulo bancario/i,
    );
  }
});

Deno.test("bloqueia fallback Asaas sem metodo em todas as modalidades roteaveis", () => {
  for (const modalidade of ["TECNICO", "EAD", "LIVRE", "ESPECIALIZACAO"]) {
    assert.throws(
      () => assertNoImplicitAsaasFallback({ modalidade, receivable: {} }),
      /fallback automatico para Asaas foi bloqueado/,
    );
  }
});

Deno.test("usa o metodo bancario moderno quando o campo legado esta vazio", () => {
  const receivable = {
    forma_pagamento: null,
    gateway_payment_method: "CREDIT_CARD",
  };

  assert.equal(
    resolveReceivableGatewayPaymentMethod(receivable),
    "CREDIT_CARD",
  );
  assert.equal(
    assertNoImplicitAsaasFallback({ modalidade: "EAD", receivable }),
    "CREDIT_CARD",
  );
});

Deno.test("bloqueia divergencia entre metodo moderno e campo legado", () => {
  assert.throws(
    () =>
      resolveReceivableGatewayPaymentMethod({
        forma_pagamento: "BOLETO",
        gateway_payment_method: "PIX",
      }),
    /diverge do metodo registrado no gateway/i,
  );
});

Deno.test("monta billingType Asaas com o metodo canonico do recebivel", () => {
  const cases = [
    [{ gateway_payment_method: "PIX" }, "PIX"],
    [{ gateway_payment_method: "BOLETO" }, "BOLETO"],
    [{ gateway_payment_method: "CREDIT_CARD" }, "CREDIT_CARD"],
    [{ forma_pagamento: "CARTAO" }, "CREDIT_CARD"],
  ] as const;

  for (const [receivable, expected] of cases) {
    assert.equal(resolveAsaasBillingType(receivable), expected);
  }
});

Deno.test("mantem UNDEFINED apenas quando o legado nao registrou metodo", () => {
  assert.equal(
    resolveAsaasBillingType({ gateway_provider: "asaas" }),
    "UNDEFINED",
  );
});

Deno.test("billingType Asaas falha quando os campos de metodo divergem", () => {
  assert.throws(
    () =>
      resolveAsaasBillingType({
        gateway_payment_method: "PIX",
        forma_pagamento: "BOLETO",
      }),
    /diverge do metodo registrado no gateway/i,
  );
});

Deno.test("provedor Asaas sem metodo nao reativa fallback de nova cobranca", () => {
  assert.throws(
    () =>
      assertNoImplicitAsaasFallback({
        modalidade: "TECNICO",
        receivable: { gateway_provider: "asaas" },
      }),
    /fallback automatico para Asaas foi bloqueado/i,
  );

  assert.doesNotThrow(() =>
    assertNoImplicitAsaasFallback({
      modalidade: "SUPERIOR",
      receivable: {},
    })
  );
});

Deno.test("nova cobranca falha fechada quando nao existe modalidade e rota", () => {
  assert.throws(
    () => requireGatewayRouteForNewCharge(null),
    /nao possui modalidade e rota bancaria validas/i,
  );
  assert.deepEqual(
    requireGatewayRouteForNewCharge({
      providerCode: "banese_card",
      paymentMethod: "BOLETO",
    }),
    { providerCode: "banese_card", paymentMethod: "BOLETO" },
  );
});
