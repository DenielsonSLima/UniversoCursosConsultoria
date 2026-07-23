import assert from "node:assert/strict";
import {
  asaasRefreshReviewMessage,
  hasAsaasRefreshIdentityChanged,
  isManualReceivableSettlement,
  shouldPreserveReceivableAfterRefreshConflict,
} from "./billing-refresh-guard.ts";

Deno.test("refresh detecta troca concorrente da identidade remota", () => {
  const snapshot = {
    gateway_provider: "asaas",
    gateway_environment: "sandbox",
    gateway_payment_id: "pay_old",
    asaas_payment_id: "pay_old",
  };

  assert.equal(
    hasAsaasRefreshIdentityChanged(snapshot, {
      ...snapshot,
      gateway_environment: "production",
    }),
    true,
  );
  assert.equal(
    hasAsaasRefreshIdentityChanged(snapshot, {
      ...snapshot,
      gateway_payment_id: "pay_new",
      asaas_payment_id: "pay_new",
    }),
    true,
  );
  assert.equal(
    hasAsaasRefreshIdentityChanged(snapshot, { ...snapshot }),
    false,
  );
});

Deno.test("refresh preserva baixa presencial e demais estados terminais", () => {
  assert.equal(
    isManualReceivableSettlement({
      status: "PAGO",
      origem_pagamento: "PRESENCIAL",
    }),
    true,
  );

  for (const status of ["PAGO", "CANCELADO", "ESTORNADO", "DEVOLVIDO"]) {
    assert.equal(
      shouldPreserveReceivableAfterRefreshConflict({ status }),
      true,
      status,
    );
  }
  assert.equal(
    shouldPreserveReceivableAfterRefreshConflict({ status: "VENCIDO" }),
    false,
  );
});

Deno.test("refresh produz marcador explicito de revisao", () => {
  assert.equal(
    asaasRefreshReviewMessage({
      reason: "estado alterado durante consulta remota",
      paymentId: "pay_123",
      paymentStatus: "RECEIVED",
    }),
    "REVISAO_ASAAS_REFRESH | estado alterado durante consulta remota | payment_id=pay_123 | remote_status=RECEIVED | estado local preservado; exige conciliacao manual",
  );
});
