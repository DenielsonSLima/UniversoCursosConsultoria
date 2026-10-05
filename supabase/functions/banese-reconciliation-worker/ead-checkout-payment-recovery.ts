import type { queryBaneseBoleto } from "../banese/core/adapter.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { baneseLastPaymentDate } from "../banese/internal/receipt-deadline.ts";
import { calculateBaneseSettlementRange } from "../banese/internal/settlement-range.ts";
import {
  banesePaymentDate,
  classifyBaneseSettlementMethod,
  sumBanesePaymentValues,
} from "../gateways/api/banese-reconciliation-contract.ts";

type BankSnapshot = Omit<Awaited<ReturnType<typeof queryBaneseBoleto>>, "raw"> & { raw: unknown };
type RecoveryInput = {
  jobId: string;
  leaseToken: string;
  receivableId: string;
  attemptId: string;
  expectedSnapshot: Record<string, unknown> & {
    dueDate: string;
    nossoNumero: string;
    financialTerms: Parameters<typeof normalizeBaneseFinancialTerms>[0];
  };
  bankSnapshot: BankSnapshot;
  today: string;
};
export type EadPaymentRecovery = {
  jobId: string;
  receivableId: string;
  attemptId: string;
  state: "PAID" | "PAID_REVIEW" | "REVIEW_REQUIRED";
  paid: boolean;
  reviewId?: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sha256 = async (value: unknown) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// Only this leased RPC may restore a canceled optional purchase. The usual
// reconciliation path deliberately continues to reject canceled receivables.
export const recoverBaneseEadCheckoutPayment = async (
  admin: any,
  input: RecoveryInput,
): Promise<EadPaymentRecovery> => {
  const { bankSnapshot: bank, expectedSnapshot: expected } = input;
  if (![input.jobId, input.leaseToken, input.receivableId, input.attemptId].every((id) => UUID.test(id)) ||
    expected.receivableId !== input.receivableId || bank.nossoNumero !== expected.nossoNumero ||
    !bank.paid || bank.payments.length === 0) {
    throw new Error("EAD_PAYMENT_RECOVERY_IDENTITY_OR_PAYMENT_INVALID");
  }
  if (bank.paymentsError) throw bank.paymentsError;
  if (bank.financialTermsError) throw bank.financialTermsError;
  const terms = normalizeBaneseFinancialTerms(expected.financialTerms);
  assertBaneseFinancialTermsEqual(terms, bank.financialTerms!);
  const lastPaymentDate = baneseLastPaymentDate(bank.raw, expected.dueDate);
  const paymentTotal = sumBanesePaymentValues(bank.payments);
  const totalAmountCents = Math.round(paymentTotal * 100);
  const dates = bank.payments.map(banesePaymentDate).sort();
  const paymentDate = dates.at(-1)!;
  if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents <= 0 ||
    paymentDate > input.today || bank.payments.some((payment) => {
      const cents = Number(payment.ValorPago ?? payment.valorPago) * 100;
      return Math.abs(cents - Math.round(cents)) > 0.000001;
    })) {
    throw new Error("EAD_PAYMENT_RECOVERY_AMOUNT_OR_DATE_INVALID");
  }
  const settlementMethod = classifyBaneseSettlementMethod(bank.payments);
  const range = calculateBaneseSettlementRange(terms, paymentDate);
  const amountMatchesTerms = totalAmountCents >= Math.round(range.minimumAmount * 100) &&
    totalAmountCents <= Math.round(range.maximumAmount * 100);
  const normalizedPayments = bank.payments.map((payment) => ({
    at: String(payment.DataPagamento ?? payment.dataPagamento).trim(),
    amountCents: Math.round(Number(payment.ValorPago ?? payment.valorPago) * 100),
    method: classifyBaneseSettlementMethod([payment]),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const evidenceFingerprint = await sha256({
    title: expected.nossoNumero, lastPaymentDate, payments: normalizedPayments,
  });
  // No raw response, payer document, Pix or credential enters this evidence.
  // Divergent amounts/multiple payments reach a visible durable review, rather
  // than disappearing into a generic worker failure or a false local receipt.
  const { data, error } = await admin.rpc("recover_banese_ead_checkout_payment", {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_evidence: {
      paymentCount: bank.payments.length,
      paymentDate,
      totalAmountCents,
      settlementMethod,
      evidenceFingerprint,
      lastPaymentDate,
      expectedSnapshot: expected,
    },
  });
  if (error) throw error;
  const receipt = data as EadPaymentRecovery;
  const validState = ["PAID", "PAID_REVIEW", "REVIEW_REQUIRED"].includes(receipt?.state);
  const shouldBePaid = receipt?.state === "PAID" || receipt?.state === "PAID_REVIEW";
  if (!validState || receipt.jobId !== input.jobId || receipt.receivableId !== input.receivableId ||
    receipt.attemptId !== input.attemptId || receipt.paid !== shouldBePaid ||
    (receipt.state !== "PAID" && !UUID.test(receipt.reviewId ?? "")) ||
    (receipt.paid && (!amountMatchesTerms || bank.payments.length !== 1 || settlementMethod === "MISTO"))) {
    throw new Error("EAD_PAYMENT_RECOVERY_ACK_INVALID");
  }
  return receipt;
};
