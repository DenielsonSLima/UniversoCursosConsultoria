import assert from "node:assert/strict";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import { processOneBaneseEadCheckoutExpiration } from "./ead-checkout-expiration.ts";

// Only fixture responses reach the real query/cancellation adapter. No bank or
// Supabase connection is opened; financial/academic persistence uses fixture RPCs.
const document = baneseDocumentFixtureAt(0, "2026-10-03", 99.9);
const JOB = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "33333333-3333-4333-8333-333333333333";
const PAYER = "00000000000";
const TERMS = {
  nominalAmount: document.amount, dueDate: document.dueDate,
  discount: null, penalty: null, interest: null,
};
const selectedClaim = (mode = "CANCEL") => ({
  claimed: true, jobId: JOB, leaseToken: LEASE, receivableId: document.receivableId,
  attemptId: ATTEMPT,
  environment: "production", mode, firstExpirationDay: "2026-10-09",
  verifiedLocalHolidays: [], snapshot: {
    receivableId: document.receivableId, amount: document.amount,
    dueDate: document.dueDate, convenio: document.beneficiary.agreement,
    nossoNumero: document.ourNumber, agency: document.beneficiary.agency,
    line: document.digitableLine, barcode: document.barcode, financialTerms: TERMS,
  },
});
type Call = { name: string; args?: Record<string, unknown> };
const runtime = () => {
  const calls: Call[] = [];
  let claim: Record<string, unknown> = selectedClaim();
  let missingRpc = false;
  let recoveryState: "PAID" | "PAID_REVIEW" | "REVIEW_REQUIRED" = "PAID";
  const admin = {
    async rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "claim_banese_ead_checkout_expiration") {
        return { data: missingRpc ? null : claim, error: missingRpc ? { code: "PGRST202" } : null };
      }
      if (name === "payment_gateway_get_secret") return { data: "synthetic-fixture", error: null };
      if (name === "start_banese_ead_checkout_expiration_mutation") return { data: true, error: null };
      if (name === "recover_banese_ead_checkout_payment") return { data: {
        jobId: JOB, receivableId: document.receivableId, attemptId: ATTEMPT,
        state: recoveryState, paid: recoveryState !== "REVIEW_REQUIRED",
        ...(recoveryState !== "PAID" ? { reviewId: LEASE } : {}),
      }, error: null };
      assert.equal(name, "finish_banese_ead_checkout_expiration");
      const result = args?.p_result;
      return { data: {
        jobId: JOB, state: result === "CANCELED" || result === "OBSERVED_UNPAID" ? "DONE" : result,
      }, error: null };
    },
  };
  return {
    admin, calls,
    setClaim: (value: Record<string, unknown>) => { claim = value; },
    withoutMigration: () => { missingRpc = true; },
    setRecovery: (state: typeof recoveryState) => { recoveryState = state; },
    lastFinish: () => calls.filter((call) => call.name === "finish_banese_ead_checkout_expiration").at(-1)?.args,
    starts: () => calls.filter((call) => call.name === "start_banese_ead_checkout_expiration_mutation").length,
  };
};
const dependencies = () => ({
  today: () => "2026-10-09",
  loadIdentity: () => Promise.resolve({
    payerDocument: PAYER, agency: document.beneficiary.agency,
    account: document.beneficiary.account.replace(/\D/g, ""),
  }),
});
const title = (situationCode: number) => ({
  NossoNumero: document.ourNumber, CodigoSituacaoBoleto: situationCode,
  ValorNominal: document.amount, DataVencimento: document.dueDate,
  DataLimitePagamento: "2026-11-02",
  NumeroLinhaDigitavel: document.digitableLine, NumeroCodigoBarras: document.barcode,
  NumeroDocumento: document.receivableId.slice(0, 15),
  IdTituloEmpresa: document.receivableId.slice(0, 25),
  Pagador: { TipoPessoa: "F", NumeroCPFCNPJ: PAYER },
});
const payment = { ValorPago: document.amount, DataPagamento: "2026-10-09T09:00:00" };
type BankState = {
  situation: number; paid: boolean; puts: number; paymentReads: number;
  deadline: string | undefined;
  paymentRecords?: Array<Record<string, unknown>>;
  onPut?: () => Response;
  onPayments?: (read: number) => void;
  titleError?: Error;
};
const withBank = async (test: (bank: BankState) => Promise<void>) => {
  const original = globalThis.fetch;
  const bank: BankState = { situation: 2, paid: false, puts: 0, paymentReads: 0, deadline: "2026-11-02" };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/autenticacao/")) {
      return new Response(JSON.stringify({ access_token: "synthetic-fixture", token_type: "Bearer" }));
    }
    if (init?.method === "PUT") {
      assert.ok(url.endsWith("/baixa"));
      bank.puts += 1;
      return bank.onPut?.() ?? new Response("{}");
    }
    assert.ok(url.includes(`/boletos/${document.ourNumber}`));
    if (url.endsWith("/pagamentos/efetivados")) {
      bank.paymentReads += 1;
      bank.onPayments?.(bank.paymentReads);
      return new Response(JSON.stringify({ PagamentosEfetivados: bank.paid ? bank.paymentRecords ?? [payment] : [] }));
    }
    if (bank.titleError) throw bank.titleError;
    return new Response(JSON.stringify({ ...title(bank.situation), DataLimitePagamento: bank.deadline }));
  }) as typeof fetch;
  try { await test(bank); } finally { globalThis.fetch = original; }
};

Deno.test("intenção ou observação não aceita mudança da data limite persistida", async () => {
  await withBank(async (bank) => {
    for (const [mode, situation, paid] of [["VERIFY", 5, false], ["OBSERVE", 5, false], ["OBSERVE", 3, true]] as const) {
      const rt = runtime();
      rt.setClaim({ ...selectedClaim(mode), officialLastPaymentDate: "2026-11-01" });
      bank.situation = situation; bank.paid = paid;
      const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
      assert.ok(["RETRY", "REVIEW_REQUIRED"].includes(result.result!));
      assert.equal(bank.puts, 0);
      assert.equal(rt.starts(), 0);
      assert.ok(!rt.calls.some((call) => call.name === "recover_banese_ead_checkout_payment"));
      assert.ok(!["CANCELED", "OBSERVED_UNPAID"].includes(String(rt.lastFinish()?.p_result)));
    }
  });
});

Deno.test("fase de expiração desligada ou ainda sem migration não faz chamadas bancárias", async () => {
  await withBank(async (bank) => {
    for (const absentMigration of [false, true]) {
      const rt = runtime();
      rt.setClaim({ claimed: false });
      if (absentMigration) rt.withoutMigration();
      const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
      assert.equal(result.handled, false);
      assert.equal(bank.puts, 0);
      assert.equal(bank.paymentReads, 0);
      assert.equal(rt.calls.length, 1);
    }
  });
});

Deno.test("pagamento entre GET inicial e preflight do adapter impede PUT e cancelamento local", async () => {
  await withBank(async (bank) => {
    bank.onPayments = (read) => { if (read === 2) bank.paid = true; };
    const rt = runtime();
    const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(result.result, "RETRY");
    assert.equal(rt.lastFinish()?.p_error_code, "PAYMENT_DETECTED_DURING_PREFLIGHT");
    assert.equal(rt.starts(), 0);
    assert.equal(bank.puts, 0);
    assert.equal(bank.paymentReads, 2);
    assert.notEqual(rt.lastFinish()?.p_result, "CANCELED");
  });
});

Deno.test("pagamento só visível após PUT preserva intenção e retoma conciliação sem repetir PUT", async () => {
  await withBank(async (bank) => {
    bank.onPut = () => {
      bank.situation = 5;
      bank.paid = true;
      return new Response("{}");
    };
    const rt = runtime();
    await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(rt.starts(), 1);
    assert.equal(bank.puts, 1);
    assert.equal(bank.paymentReads, 3);
    assert.equal(rt.lastFinish()?.p_result, "RETRY");
    assert.equal(rt.lastFinish()?.p_error_code, "REMOTE_MUTATION_AMBIGUOUS");

    let reconciliations = 0;
    rt.setClaim(selectedClaim("VERIFY"));
    const resumed = await processOneBaneseEadCheckoutExpiration(rt.admin, {
      ...dependencies(),
      reconcile: () => {
        reconciliations += 1;
        return Promise.resolve({
          success: true, paid: true, receivable: { status: "PAGO" },
          remoteStatus: "PAID", payments: 1, futureSyncWarning: null,
        });
      },
    });
    assert.equal(resumed.result, "PAID");
    assert.equal(reconciliations, 1);
    assert.equal(bank.puts, 1);
    assert.equal(rt.lastFinish()?.p_result, "PAID");
  });
});

Deno.test("timeout antes do PUT não grava intenção; timeout depois retoma GET-only", async () => {
  await withBank(async (bank) => {
    const rt = runtime();
    bank.titleError = new Error("timeout before PUT");
    await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(rt.lastFinish()?.p_result, "RETRY");
    assert.equal(rt.lastFinish()?.p_error_code, "TIMEOUT");
    assert.equal(rt.starts(), 0);
    assert.equal(bank.puts, 0);

    bank.titleError = undefined;
    bank.onPut = () => {
      bank.situation = 5;
      throw new Error("timeout after PUT");
    };
    await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(rt.starts(), 1);
    assert.equal(bank.puts, 1);
    assert.equal(rt.lastFinish()?.p_error_code, "REMOTE_MUTATION_AMBIGUOUS");
    assert.equal(rt.lastFinish()?.p_result, "RETRY");

    rt.setClaim(selectedClaim("VERIFY"));
    const verified = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(verified.result, "CANCELED");
    assert.equal(rt.lastFinish()?.p_situation_code, 5);
    assert.equal(rt.lastFinish()?.p_payment_count, 0);
    assert.equal(bank.puts, 1);
  });
});

Deno.test("recusa real do adapter por compensação mantém pendente e consultas futuras GET-only", async () => {
  await withBank(async (bank) => {
    bank.onPut = () => new Response(JSON.stringify({ Erros: [{
      CodigoErroProcessamento: "ERRO_BOLETO_COM_PAGAMENTO_NAO_EFETIVADO",
    }] }), { status: 400 });
    const rt = runtime();
    const pending = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(pending.result, "WAITING_COMPENSATION");
    assert.equal(rt.lastFinish()?.p_result, "RETRY");
    assert.equal(rt.lastFinish()?.p_error_code, "WAITING_COMPENSATION");
    assert.equal(bank.puts, 1);
    assert.equal(bank.situation, 2);

    rt.setClaim({ ...selectedClaim("VERIFY"), lastErrorCode: "WAITING_COMPENSATION" });
    await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(rt.lastFinish()?.p_error_code, "WAITING_COMPENSATION");
    assert.equal(bank.puts, 1);
  });
});

Deno.test("pagamento tardio em título na situação 5 restaura original por RPC atômica sem novo PUT", async () => {
  await withBank(async (bank) => {
    bank.situation = 5;
    bank.paid = true;
    const rt = runtime();
    rt.setClaim(selectedClaim("OBSERVE"));
    let reconciliations = 0;
    const result = await processOneBaneseEadCheckoutExpiration(rt.admin, {
      ...dependencies(),
      reconcile: () => { reconciliations += 1; throw new Error("Unexpected reconciliation"); },
    });
    assert.equal(result.result, "PAID");
    const recovery = rt.calls.find((call) => call.name === "recover_banese_ead_checkout_payment");
    const evidence = recovery?.args?.p_evidence as Record<string, unknown>;
    assert.equal(evidence.paymentCount, 1);
    assert.equal(evidence.totalAmountCents, 9990);
    assert.equal(evidence.lastPaymentDate, "2026-11-02");
    assert.equal(evidence.settlementMethod, "NAO_IDENTIFICADO");
    assert.equal(rt.lastFinish(), undefined, "Recovery closes its own lease atomically");
    assert.equal(reconciliations, 0);
    assert.equal(rt.starts(), 0);
    assert.equal(bank.puts, 0);
  });
});

Deno.test("data limite oficial faltante ou divergente entre consultas nunca autoriza novo PUT", async () => {
  await withBank(async (bank) => {
    const missing = runtime();
    bank.deadline = undefined;
    await processOneBaneseEadCheckoutExpiration(missing.admin, dependencies());
    assert.equal(missing.lastFinish()?.p_result, "REVIEW_REQUIRED");
    assert.equal(missing.lastFinish()?.p_error_code, "EAD_EXPIRATION_RECEIPT_DEADLINE_UNVERIFIED");
    assert.equal(bank.puts, 0);
    assert.equal(missing.starts(), 0);
    bank.deadline = "2026-11-02";
    bank.paymentReads = 0;
    bank.onPayments = (read) => { if (read === 1) bank.deadline = "2026-11-03"; };
    const changed = runtime();
    await processOneBaneseEadCheckoutExpiration(changed.admin, dependencies());
    assert.equal(changed.lastFinish()?.p_result, "REVIEW_REQUIRED");
    assert.equal(bank.puts, 0);
    assert.equal(changed.starts(), 0);
  });
});

Deno.test("nova tentativa redundante já paga usa recuperação e revisão sem cancelar nem acesso extra", async () => {
  await withBank(async (bank) => {
    bank.paid = true;
    const rt = runtime();
    rt.setClaim({ ...selectedClaim(), cancelReason: "DUPLICATE_PENDING", firstExpirationDay: "2026-10-16" });
    rt.setRecovery("PAID_REVIEW");
    const result = await processOneBaneseEadCheckoutExpiration(rt.admin, {
      ...dependencies(), reconcile: () => { throw new Error("Common reconciliation must stay fenced"); },
    });
    assert.equal(result.result, "PAID_REVIEW");
    assert.equal(result.reviewId, LEASE);
    assert.equal(bank.puts, 0);
    assert.equal(rt.starts(), 0);
    assert.equal(rt.calls.filter((call) => call.name === "recover_banese_ead_checkout_payment").length, 1);
  });
});

Deno.test("pagamento tardio divergente fica em revisão com montante real e nunca recebe PAGO falso", async () => {
  await withBank(async (bank) => {
    bank.situation = 5;
    bank.paid = true;
    bank.paymentRecords = [{ ...payment, ValorPago: 50 }];
    const rt = runtime();
    rt.setClaim(selectedClaim("OBSERVE"));
    rt.setRecovery("REVIEW_REQUIRED");
    const result = await processOneBaneseEadCheckoutExpiration(rt.admin, dependencies());
    assert.equal(result.result, "REVIEW_REQUIRED");
    const evidence = rt.calls.find((call) => call.name === "recover_banese_ead_checkout_payment")?.args?.p_evidence as Record<string, unknown>;
    assert.equal(evidence.totalAmountCents, 5000);
    assert.equal(bank.puts, 0);
    assert.equal(rt.lastFinish(), undefined, "The RPC records review and releases the lease atomically");
  });
});
