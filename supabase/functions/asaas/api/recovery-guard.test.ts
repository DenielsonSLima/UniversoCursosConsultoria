import assert from "node:assert/strict";
import {
  remoteAsaasPaymentMatchesReceivable,
  remoteDetachedLinkMatchesReceivable,
  selectUniqueAsaasRecoveryCandidate,
} from "./recovery-guard.ts";

const payment = {
  id: "pay_1",
  externalReference: "receivable-1",
  billingType: "BOLETO",
  value: 99.9,
  dueDate: "2026-08-10",
  status: "PENDING",
};

Deno.test("recovery aceita somente pagamento com termos exatos", () => {
  const matches = (candidate: any) =>
    remoteAsaasPaymentMatchesReceivable({
      payment: candidate,
      receivableId: "receivable-1",
      billingType: "BOLETO",
      value: 99.9,
      dueDate: "2026-08-10",
    });
  assert.equal(matches(payment), true);
  assert.equal(matches({ ...payment, value: 199.8 }), false);
  assert.equal(matches({ ...payment, billingType: "PIX" }), false);
  assert.equal(matches({ ...payment, dueDate: "2026-08-11" }), false);
  assert.equal(matches({ ...payment, installment: "ins_1" }), false);
});

Deno.test("recovery detached valida valor, método, tipo e URL", () => {
  const link = {
    id: "link_1",
    externalReference: "receivable-1",
    billingType: "PIX",
    value: 50,
    chargeType: "DETACHED",
    url: "https://sandbox.asaas.com/c/link_1",
    deleted: false,
  };
  const matches = (candidate: any) =>
    remoteDetachedLinkMatchesReceivable({
      paymentLink: candidate,
      receivableId: "receivable-1",
      billingType: "PIX",
      value: 50,
    });
  assert.equal(matches(link), true);
  assert.equal(matches({ ...link, chargeType: "INSTALLMENT" }), false);
  assert.equal(matches({ ...link, value: 51 }), false);
  assert.equal(matches({ ...link, url: null }), false);
});

Deno.test("recovery falha fechado para candidato divergente ou duplicado", () => {
  assert.throws(
    () =>
      selectUniqueAsaasRecoveryCandidate({
        candidates: [payment, { ...payment, id: "pay_2" }],
        externalReference: "receivable-1",
        isInactive: () => false,
        matches: () => true,
        label: "pagamento Asaas",
      }),
    /divergente ou duplicado/i,
  );
  assert.throws(
    () =>
      selectUniqueAsaasRecoveryCandidate({
        candidates: [{ ...payment, value: 150 }],
        externalReference: "receivable-1",
        isInactive: () => false,
        matches: () => false,
        label: "pagamento Asaas",
      }),
    /nenhum vínculo foi adotado/i,
  );
});
