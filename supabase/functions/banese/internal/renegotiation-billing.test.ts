import assert from "node:assert/strict";
import { buildBaneseBoletoPayload } from "../core/adapter/boleto-payload.ts";
import { validInput } from "../core/adapter-test-fixtures.ts";
import { RENEGOTIATION_RECEIPT_INSTRUCTION, renegotiationBillingSnapshotFromReceivable } from "./renegotiation-billing.ts";

const receivable = () => ({
  ...validInput.receivable, tipo_lancamento: "RENEGOCIACAO", valor: 15.9,
  data_vencimento: "2026-08-15", quantidadeDiasBaixaDevolucao: 30,
  regra_financeira_renegociacao_snapshot: {
    version: 1, origin: "RENEGOTIATION", agreementId: "11111111-1111-4111-8111-111111111111",
    receiptPolicy: { daysAfterDue: 60, instruction: RENEGOTIATION_RECEIPT_INSTRUCTION },
    financialTerms: validInput.financialTerms,
  },
});
Deno.test("renegociação envia 60 dias do snapshot, sem herdar prazo da credencial", () => {
  const payload = buildBaneseBoletoPayload({ ...validInput, receivable: receivable() });
  assert.equal(payload.QuantidadeDiasBaixaDevolucao, 60);
  assert.equal(payload.CodigoTipoBaixaDevolucao, 1);
});
Deno.test("renegociação falha fechada sem snapshot, com texto/prazo ou valor divergente", () => {
  assert.throws(() => renegotiationBillingSnapshotFromReceivable({ tipo_lancamento: "RENEGOCIACAO" }));
  for (const field of ["daysAfterDue", "instruction"]) {
    const value = receivable();
    Object.assign(value.regra_financeira_renegociacao_snapshot.receiptPolicy, { [field]: field === "daysAfterDue" ? 30 : "Outro texto" });
    assert.throws(() => renegotiationBillingSnapshotFromReceivable(value));
  }
  assert.throws(() => renegotiationBillingSnapshotFromReceivable({ ...receivable(), valor: 10 }));
  assert.throws(() => buildBaneseBoletoPayload({ ...validInput, receivable: receivable(), financialTerms: null }));
});
Deno.test("legados preservam metadado e fallback sem exigir snapshot de renegociação", () => {
  assert.equal(renegotiationBillingSnapshotFromReceivable(validInput.receivable), null);
  assert.equal(buildBaneseBoletoPayload(validInput).QuantidadeDiasBaixaDevolucao, 30);
  assert.equal(buildBaneseBoletoPayload({ ...validInput,
    receivable: { ...validInput.receivable, quantidadeDiasBaixaDevolucao: 5 },
  }).QuantidadeDiasBaixaDevolucao, 5);
});
