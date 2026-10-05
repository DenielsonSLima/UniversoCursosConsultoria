import assert from "node:assert/strict";
import { BaneseBoletoPaymentProcessingError } from "../banese/core/adapter/boleto-cancellation-processing.ts";
import { firstEadCheckoutExpirationDay, processOneBaneseEadCheckoutExpiration } from "./ead-checkout-expiration.ts";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const RECEIVABLE_ID = "22222222-2222-4222-8222-222222222222";
const LEASE = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const TERMS = { nominalAmount: 99.9, dueDate: "2026-10-03", discount: null, penalty: null, interest: null };
const claim = (overrides: Record<string, unknown> = {}) => ({
  claimed: true, jobId: JOB_ID, leaseToken: LEASE, receivableId: RECEIVABLE_ID,
  attemptId: ATTEMPT,
  environment: "production", mode: "CANCEL", firstExpirationDay: "2026-10-09",
  verifiedLocalHolidays: [], snapshot: {
    receivableId: RECEIVABLE_ID, amount: 99.9, dueDate: TERMS.dueDate,
    convenio: "1", nossoNumero: "000000001", agency: "001",
    line: "0479" + "0".repeat(43), barcode: "0479" + "0".repeat(40), financialTerms: TERMS,
  }, ...overrides,
});
const snapshot = (overrides: Record<string, unknown> = {}) => ({
  convenio: "1", nossoNumero: "000000001", situationCode: 2, remoteStatus: "PENDING",
  paid: false, payments: [], paymentsError: null, financialTerms: TERMS,
  financialTermsError: null, pixPayload: null, pixEncodedImage: null,
  raw: { DataLimitePagamento: "2026-11-02" }, ...overrides,
});
const runtime = (selectedClaim = claim()) => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const admin = {
    async rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "claim_banese_ead_checkout_expiration") return { data: selectedClaim, error: null };
      if (name === "start_banese_ead_checkout_expiration_mutation") return { data: true, error: null };
      if (name === "recover_banese_ead_checkout_payment") return { data: {
        jobId: JOB_ID, receivableId: RECEIVABLE_ID, attemptId: ATTEMPT, state: "PAID", paid: true,
      }, error: null };
      const result = args?.p_result;
      return { data: { jobId: JOB_ID, state: result === "CANCELED" || result === "OBSERVED_UNPAID" ? "DONE" : result }, error: null };
    },
  };
  return { admin, calls, finish: () => calls.find((c) => c.name === "finish_banese_ead_checkout_expiration")?.args };
};
const dependencies = (overrides: Record<string, unknown> = {}) => ({
  today: () => "2026-10-09",
  loadIdentity: () => Promise.resolve({ payerDocument: "0".repeat(11), agency: "001", account: "0".repeat(9) }),
  queryBoleto: () => Promise.resolve(snapshot()),
  cancelBoleto: async (_admin: any, _environment: any, input: any) => {
    await input.onMutationStart();
    return { ...snapshot(), situationCode: 5, remoteStatus: "CANCELED", alreadyCanceled: false, mutationAttempted: true, pixAvailable: false };
  },
  ...overrides,
}) as Parameters<typeof processOneBaneseEadCheckoutExpiration>[1];

Deno.test("janela usa três dias úteis completos após vencimento útil efetivo", () => {
  assert.equal(firstEadCheckoutExpirationDay("2026-10-03", []), "2026-10-09");
  assert.equal(firstEadCheckoutExpirationDay("2026-10-09", []), "2026-10-16");
  assert.equal(firstEadCheckoutExpirationDay("2026-09-06", []), "2026-09-12");
  assert.equal(firstEadCheckoutExpirationDay("2026-10-03", ["2026-10-06"]), "2026-10-10");
  assert.equal(firstEadCheckoutExpirationDay("2026-10-03", null), null);
  assert.equal(firstEadCheckoutExpirationDay("2027-01-01", []), null);
  assert.equal(firstEadCheckoutExpirationDay("2026-12-29", []), null);
  assert.equal(firstEadCheckoutExpirationDay("2026-12-28", []), null);
});

Deno.test("título pendente conserva snapshot e só cancela após intenção durável e status5", async () => {
  const rt = runtime();
  let queryInput: any;
  let cancelInput: any;
  const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: (_a: any, _e: any, input: any) => { queryInput = input; return Promise.resolve(snapshot()); },
    cancelBoleto: async (_a: any, _e: any, input: any) => {
      cancelInput = input;
      await input.onMutationStart();
      assert.equal(rt.calls.at(-1)?.name, "start_banese_ead_checkout_expiration_mutation");
      return { ...snapshot(), situationCode: 5, remoteStatus: "CANCELED" };
    },
  }));
  assert.equal(result.result, "CANCELED");
  assert.equal(queryInput.validateTitleIdentity, true);
  assert.equal(queryInput.skipEffectivePaymentsWhenOfficiallyUnpaid, undefined);
  assert.equal(queryInput.strictEffectivePayments, true);
  assert.deepEqual(cancelInput.expectedFinancialTerms, TERMS);
  assert.equal(cancelInput.expectedDocumentNumber, RECEIVABLE_ID.slice(0, 15));
  assert.equal(cancelInput.expectedCompanyTitleId, RECEIVABLE_ID.slice(0, 25));
  assert.equal(cancelInput.signal, queryInput.signal);
  assert.equal(rt.finish()?.p_payment_count, 0);
  assert.match(String(rt.finish()?.p_evidence_fingerprint), /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(rt.calls).includes("payerDocument"), false);
});

Deno.test("antes da janela e calendário não verificado nunca consultam nem cancelam", async () => {
  for (const selected of [claim(), claim({ verifiedLocalHolidays: null })]) {
    const rt = runtime(selected);
    let queries = 0;
    const deps = dependencies({ today: () => "2026-10-08", queryBoleto: () => { queries++; throw new Error("not allowed"); } });
    if (selected.verifiedLocalHolidays === null) {
      await assert.rejects(() => processOneBaneseEadCheckoutExpiration(rt.admin, deps), /CLAIM_INVALID/);
    } else {
      await processOneBaneseEadCheckoutExpiration(rt.admin, deps);
      assert.equal(rt.finish()?.p_result, "REVIEW_REQUIRED");
    }
    assert.equal(queries, 0);
  }
});

Deno.test("pagamento comprovado concilia e ativa pelo fluxo existente sem PUT", async () => {
  const rt = runtime();
  let reconciled = 0;
  let canceled = 0;
  const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: () => Promise.resolve(snapshot({ paid: true, remoteStatus: "PAID", payments: [{ ValorPago: 99.9 }] })),
    reconcile: async () => { reconciled++; return { paid: true, receivable: { status: "PAGO" } }; },
    cancelBoleto: () => { canceled++; throw new Error("not allowed"); },
  }));
  assert.equal(reconciled, 1);
  assert.equal(canceled, 0);
  assert.equal(result.result, "PAID");
  assert.equal(rt.finish()?.p_result, "PAID");
});

Deno.test("recusa bancária por compensação preserva pendente e próxima tentativa GET-only", async () => {
  const rt = runtime();
  const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    cancelBoleto: async (_a: any, _e: any, input: any) => {
      await input.onMutationStart();
      throw new BaneseBoletoPaymentProcessingError();
    },
  }));
  assert.equal(result.result, "WAITING_COMPENSATION");
  assert.equal(rt.finish()?.p_error_code, "WAITING_COMPENSATION");
  assert.equal(rt.finish()?.p_result, "RETRY");
  for (const mode of ["VERIFY", "CANCEL"]) {
    const verification = runtime(claim({ mode, lastErrorCode: "WAITING_COMPENSATION" }));
    let put = 0;
    await processOneBaneseEadCheckoutExpiration(verification.admin, dependencies({
      cancelBoleto: () => { put++; throw new Error("not allowed"); },
    }));
    assert.equal(put, 0);
    assert.equal(verification.finish()?.p_error_code, "WAITING_COMPENSATION");
  }
});

Deno.test("mutação ambígua é retomada por GET e jamais repetida", async () => {
  const rt = runtime(claim({ mode: "VERIFY" }));
  let put = 0;
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: () => Promise.resolve(snapshot({ situationCode: 5, remoteStatus: "CANCELED" })),
    cancelBoleto: () => { put++; throw new Error("not allowed"); },
  }));
  assert.equal(put, 0);
  assert.equal(rt.finish()?.p_result, "CANCELED");
  const pending = runtime(claim({ mode: "VERIFY" }));
  await processOneBaneseEadCheckoutExpiration(pending.admin, dependencies());
  assert.equal(pending.finish()?.p_result, "REVIEW_REQUIRED");
  assert.equal(pending.finish()?.p_error_code, "REMOTE_MUTATION_AMBIGUOUS");
});

Deno.test("detalhe tardio malformado gera revisão sem falsa baixa nem conciliação comum", async () => {
  const rt = runtime(claim({ mode: "OBSERVE" }));
  let reconciled = 0;
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: () => Promise.resolve(snapshot({ paid: true, remoteStatus: "PAID", payments: [{}] })),
    reconcile: () => { reconciled++; throw new Error("not allowed"); },
  }));
  assert.equal(reconciled, 0);
  assert.equal(rt.finish()?.p_result, "REVIEW_REQUIRED");
  assert.equal(rt.finish()?.p_error_code, "REMOTE_PAYMENT_DETAIL_INVALID");
  assert.ok(!rt.calls.some((call) => call.name === "recover_banese_ead_checkout_payment"));
});

Deno.test("tentativa redundante autorizada pela RPC cancela antes da janela sem ignorar provas", async () => {
  const rt = runtime(claim({ cancelReason: "DUPLICATE_PENDING", firstExpirationDay: "2026-10-09" }));
  const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({ today: () => "2026-10-04" }));
  assert.equal(result.result, "CANCELED");
  const intent = rt.calls.find((call) => call.name === "start_banese_ead_checkout_expiration_mutation");
  assert.equal(intent?.args?.p_last_payment_date, "2026-11-02");
  assert.match(String(intent?.args?.p_evidence_fingerprint), /^[a-f0-9]{64}$/);
  const unknown = runtime(claim({ cancelReason: "UNKNOWN" }));
  await assert.rejects(() => processOneBaneseEadCheckoutExpiration(unknown.admin, dependencies()), /CLAIM_INVALID/);
  assert.ok(!unknown.calls.some((call) => call.name === "start_banese_ead_checkout_expiration_mutation"));
});

Deno.test("falha de PagamentosEfetivados ou status desconhecido nunca baixa", async () => {
  for (const returned of [snapshot({ paymentsError: new Error("network failure") }), snapshot({ situationCode: 9, remoteStatus: "UNKNOWN" })]) {
    const rt = runtime();
    let put = 0;
    await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
      queryBoleto: () => Promise.resolve(returned), cancelBoleto: () => { put++; throw new Error("not allowed"); },
    }));
    assert.equal(put, 0);
    assert.notEqual(rt.finish()?.p_result, "CANCELED");
  }
});

Deno.test("expiração natural4/EXPIRED é confirmada por GET sem PUT e pares misturados param", async () => {
  const rt = runtime(claim({ mode: "VERIFY" }));
  let put = 0;
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: () => Promise.resolve(snapshot({ situationCode: 4, remoteStatus: "EXPIRED" })),
    cancelBoleto: () => { put++; throw new Error("not allowed"); },
  }));
  assert.equal(put, 0);
  assert.equal(rt.finish()?.p_result, "CANCELED");
  assert.equal(rt.finish()?.p_remote_status, "EXPIRED");
  assert.equal(rt.finish()?.p_situation_code, 4);
  for (const mixed of [snapshot({ situationCode: 4, remoteStatus: "CANCELED" }),
    snapshot({ situationCode: 5, remoteStatus: "EXPIRED" })]) {
    const blocked = runtime();
    await processOneBaneseEadCheckoutExpiration(blocked.admin, dependencies({ queryBoleto: () => Promise.resolve(mixed) }));
    assert.equal(blocked.finish()?.p_result, "REVIEW_REQUIRED");
  }
});

Deno.test("timeout GET durante espera conserva causa bancária durável", async () => {
  const rt = runtime(claim({ mode: "VERIFY", lastErrorCode: "WAITING_COMPENSATION" }));
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: () => { throw new Error("GET timeout"); },
  }));
  assert.equal(rt.finish()?.p_result, "RETRY");
  assert.equal(rt.finish()?.p_error_code, "WAITING_COMPENSATION");
});

Deno.test("baixa já persistida retoma projeção e conclusão sem perder PAGO ou emitir PUT", async () => {
  const rt = runtime(claim({ mode: "VERIFY", localPaid: true, settledPaymentCount: 1 }));
  let queried = 0;
  let reconciled = 0;
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    queryBoleto: () => { queried++; throw new Error("not allowed"); },
    reconcile: () => { reconciled++; return Promise.resolve({ paid: true, receivable: { status: "PAGO" } }); },
  }));
  assert.equal(reconciled, 1);
  assert.equal(queried, 0);
  assert.equal(rt.finish()?.p_result, "PAID");
  assert.equal(rt.finish()?.p_payment_count, 1);
});

Deno.test("data atual sem calendário2027 nunca inicia baixa automática", async () => {
  const rt = runtime();
  let queried = 0;
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    today: () => "2027-01-05", queryBoleto: () => { queried++; throw new Error("not allowed"); },
  }));
  assert.equal(queried, 0);
  assert.equal(rt.finish()?.p_result, "REVIEW_REQUIRED");
});

Deno.test("calendário corrigido ou desconhecido nunca bloqueia GET-only ou reparo pago", async () => {
  const observed = runtime(claim({ mode: "OBSERVE", verifiedLocalHolidays: null }));
  let queried = 0;
  await processOneBaneseEadCheckoutExpiration(observed.admin, dependencies({
    today: () => "2027-01-05", queryBoleto: () => {
      queried++; return Promise.resolve(snapshot({ situationCode: 5, remoteStatus: "CANCELED" }));
    },
  }));
  assert.equal(queried, 1);
  assert.equal(observed.finish()?.p_result, "OBSERVED_UNPAID");
  const verify = runtime(claim({ mode: "VERIFY", verifiedLocalHolidays: ["2027-01-01"] }));
  await processOneBaneseEadCheckoutExpiration(verify.admin, dependencies({
    today: () => "2027-01-05", queryBoleto: () =>
      Promise.resolve(snapshot({ situationCode: 5, remoteStatus: "CANCELED" })),
  }));
  assert.equal(verify.finish()?.p_result, "CANCELED");
  const paid = runtime(claim({ mode: "VERIFY", localPaid: true, settledPaymentCount: 1,
    verifiedLocalHolidays: ["2027-01-01"], firstExpirationDay: "2027-01-15" }));
  await processOneBaneseEadCheckoutExpiration(paid.admin, dependencies({
    reconcile: () => Promise.resolve({ paid: true, receivable: { status: "PAGO" } }),
  }));
  assert.equal(paid.finish()?.p_result, "PAID");
});

Deno.test("timeout após PUT conserva intenção e só permite verificação posterior", async () => {
  const rt = runtime();
  await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({
    cancelBoleto: async (_a: any, _e: any, input: any) => { await input.onMutationStart(); throw new Error("timeout after PUT"); },
  }));
  assert.equal(rt.finish()?.p_result, "RETRY");
  assert.equal(rt.finish()?.p_error_code, "REMOTE_MUTATION_AMBIGUOUS");
});

Deno.test("erro permanente na observação entra em revisão; falha de rede permite GET futuro", async () => {
  for (const [error, expected] of [[new Error("network failed"), "RETRY"],
    [new Error("Nosso Numero retornado pelo Banese diverge do titulo consultado."), "REVIEW_REQUIRED"]] as const) {
    const rt = runtime(claim({ mode: "OBSERVE" }));
    await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies({ queryBoleto: () => { throw error; } }));
    assert.equal(rt.finish()?.p_result, expected);
  }
});
