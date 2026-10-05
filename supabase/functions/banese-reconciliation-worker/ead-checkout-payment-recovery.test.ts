import assert from "node:assert/strict";
import { recoverBaneseEadCheckoutPayment } from "./ead-checkout-payment-recovery.ts";

const JOB = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";
const RECEIVABLE = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const REVIEW = "55555555-5555-4555-8555-555555555555";
const TERMS = { nominalAmount: 99.9, dueDate: "2026-10-03", discount: null, penalty: null, interest: null };
const payment = { DataPagamento: "2026-10-09T09:00:00", ValorPago: 99.9 };
const input = (overrides: Record<string, unknown> = {}) => ({
  jobId: JOB, leaseToken: LEASE, receivableId: RECEIVABLE, attemptId: ATTEMPT,
  today: "2026-10-09", expectedSnapshot: {
    receivableId: RECEIVABLE, nossoNumero: "000000001", dueDate: TERMS.dueDate, financialTerms: TERMS,
  }, bankSnapshot: {
    convenio: "1", nossoNumero: "000000001", situationCode: 5, remoteStatus: "PAID",
    paid: true, payments: [payment], paymentsError: null,
    financialTerms: TERMS, financialTermsError: null, pixPayload: null, pixEncodedImage: null,
    raw: { DataLimitePagamento: "2026-11-02", unrelatedPrivatePayload: "must-not-persist" },
    ...overrides,
  },
});
const runtime = (state: "PAID" | "PAID_REVIEW" | "REVIEW_REQUIRED" = "PAID", overrides = {}) => {
  const calls: Array<Record<string, any>> = [];
  const admin = { async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, "recover_banese_ead_checkout_payment");
    calls.push(args);
    return { data: { jobId: JOB, receivableId: RECEIVABLE, attemptId: ATTEMPT, state,
      paid: state !== "REVIEW_REQUIRED", ...(state !== "PAID" ? { reviewId: REVIEW } : {}), ...overrides,
    }, error: null };
  } };
  return { admin, calls };
};

Deno.test("recuperação usa original, detalhe efetivado e canal desconhecido sem inventar Pix/boleto", async () => {
  const rt = runtime();
  const result = await recoverBaneseEadCheckoutPayment(rt.admin, input());
  assert.equal(result.state, "PAID");
  assert.equal(rt.calls[0].p_job_id, JOB);
  assert.equal(rt.calls[0].p_lease_token, LEASE);
  const proof = rt.calls[0].p_evidence;
  assert.deepEqual(Object.keys(proof).sort(), ["evidenceFingerprint", "expectedSnapshot", "lastPaymentDate",
    "paymentCount", "paymentDate", "settlementMethod", "totalAmountCents"]);
  assert.equal(proof.totalAmountCents, 9990);
  assert.equal(proof.paymentDate, "2026-10-09");
  assert.equal(proof.settlementMethod, "NAO_IDENTIFICADO");
  assert.match(proof.evidenceFingerprint, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(proof).includes("must-not-persist"));
});

Deno.test("outro pagamento já confirmado produz revisão durável vinculada sem novo acesso no worker", async () => {
  const rt = runtime("PAID_REVIEW");
  const result = await recoverBaneseEadCheckoutPayment(rt.admin, input({
    payments: [{ ...payment, FormaLiquidacao: "PIX" }],
  }));
  assert.equal(result.state, "PAID_REVIEW");
  assert.equal(result.reviewId, REVIEW);
  assert.equal(result.paid, true);
  assert.equal(rt.calls[0].p_evidence.settlementMethod, "PIX");
  assert.equal(rt.calls.length, 1, "One atomic RPC decides receipt, access and review");
});

Deno.test("montante divergente persiste valor real em revisão e nunca aceita ACK PAGO", async () => {
  const bank = input({ payments: [{ ...payment, ValorPago: 50 }] });
  const rt = runtime("REVIEW_REQUIRED");
  const result = await recoverBaneseEadCheckoutPayment(rt.admin, bank);
  assert.equal(result.paid, false);
  assert.equal(rt.calls[0].p_evidence.totalAmountCents, 5000);
  await assert.rejects(() => recoverBaneseEadCheckoutPayment(runtime().admin, bank), /ACK_INVALID/);
});

Deno.test("múltiplos pagamentos mistos vão a revisão com fingerprint estável entre ordem de GET", async () => {
  const rt = runtime("REVIEW_REQUIRED");
  const records = [{ ...payment, FormaLiquidacao: "BOLETO" },
    { ...payment, DataPagamento: "2026-10-09T10:00:00", FormaLiquidacao: "PIX" }];
  await recoverBaneseEadCheckoutPayment(rt.admin, input({ payments: records }));
  await recoverBaneseEadCheckoutPayment(rt.admin, input({ payments: records.toReversed() }));
  assert.equal(rt.calls[0].p_evidence.paymentCount, 2);
  assert.equal(rt.calls[0].p_evidence.totalAmountCents, 19980);
  assert.equal(rt.calls[0].p_evidence.settlementMethod, "MISTO");
  assert.equal(rt.calls[0].p_evidence.evidenceFingerprint, rt.calls[1].p_evidence.evidenceFingerprint);
  await assert.rejects(() => recoverBaneseEadCheckoutPayment(runtime().admin, input({ payments: records })), /ACK_INVALID/);
});

Deno.test("prova incompleta, título errado ou pagamento futuro não aciona persistência", async () => {
  for (const bank of [
    { nossoNumero: "000000002" }, { paid: false }, { payments: [] }, { raw: {} },
    { paymentsError: new Error("payments unavailable") },
    { payments: [{ ...payment, DataPagamento: "2026-10-10" }] },
    { payments: [{ ...payment, ValorPago: 99.901 }] },
    { financialTerms: { ...TERMS, nominalAmount: 100 } },
  ]) {
    const rt = runtime();
    await assert.rejects(() => recoverBaneseEadCheckoutPayment(rt.admin, input(bank)));
    assert.equal(rt.calls.length, 0);
  }
});

Deno.test("ACK de outra tentativa ou revisão sem vínculo não é considerado conclusão", async () => {
  for (const rt of [runtime("PAID", { attemptId: REVIEW }), runtime("PAID", { receivableId: REVIEW }),
    runtime("PAID_REVIEW", { reviewId: null }), runtime("REVIEW_REQUIRED", { paid: true })]) {
    await assert.rejects(() => recoverBaneseEadCheckoutPayment(rt.admin, input()), /ACK_INVALID/);
  }
});
