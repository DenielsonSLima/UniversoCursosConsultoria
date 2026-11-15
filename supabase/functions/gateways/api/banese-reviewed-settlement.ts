import {
  normalizeBaneseFinancialTerms,
  type NormalizedBaneseFinancialTerms,
} from "../../banese/internal/financial-terms.ts";
import type { Environment } from "./config.ts";

export type BaneseReviewedSettlementFacts = {
  receivableId: string;
  environment: Environment;
  nossoNumero: string;
  amount: number;
  paymentDate: string;
  financialTerms: NormalizedBaneseFinancialTerms;
  calculatedRange: {
    minimumAmount: number;
    expectedAmount: number;
    maximumAmount: number;
  };
};

export type BaneseReviewedSettlementApproval = BaneseReviewedSettlementFacts & {
  authority: "EXPLICIT_MANAGER_REVIEW";
  reason: "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE";
  reviewedAt: string;
};

export type BaneseReviewedSettlement = (
  facts: BaneseReviewedSettlementFacts,
) => Promise<BaneseReviewedSettlementApproval>;

export type BanesePaymentVarianceReview = BaneseReviewedSettlementApproval & {
  varianceFromCalculatedExpected: number;
  varianceFromNominal: number;
  paidComponents: null;
};

const divergenceMessage = "Valor pago no Banese diverge dos termos confirmados do titulo; a baixa automatica foi bloqueada para revisao.";
const roundMoney = (value: number) => Math.round(value * 100) / 100;

// The automatic path has no reviewer. A review cannot alter its challenge or
// broaden tolerance; only the exact official payment explicitly approved passes.
export const approveBaneseReviewedSettlement = async (
  review: BaneseReviewedSettlement | undefined,
  input: BaneseReviewedSettlementFacts,
): Promise<BanesePaymentVarianceReview> => {
  if (!review) throw new Error(divergenceMessage);
  const baseline = globalThis.structuredClone(input);
  baseline.financialTerms = normalizeBaneseFinancialTerms(baseline.financialTerms);
  const approval = await review(globalThis.structuredClone(baseline));
  if (!approval || approval.authority !== "EXPLICIT_MANAGER_REVIEW" ||
    approval.reason !== "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE" ||
    approval.receivableId !== baseline.receivableId ||
    approval.environment !== baseline.environment ||
    approval.nossoNumero !== baseline.nossoNumero ||
    approval.amount !== baseline.amount ||
    approval.paymentDate !== baseline.paymentDate ||
    JSON.stringify(normalizeBaneseFinancialTerms(approval.financialTerms)) !== JSON.stringify(baseline.financialTerms) ||
    approval.calculatedRange?.minimumAmount !== baseline.calculatedRange.minimumAmount ||
    approval.calculatedRange?.expectedAmount !== baseline.calculatedRange.expectedAmount ||
    approval.calculatedRange?.maximumAmount !== baseline.calculatedRange.maximumAmount ||
    typeof approval.reviewedAt !== "string" ||
    !Number.isFinite(Date.parse(approval.reviewedAt)) ||
    new Date(approval.reviewedAt).toISOString() !== approval.reviewedAt) {
    throw new Error("BANESE_REVIEWED_SETTLEMENT_APPROVAL_MISMATCH");
  }
  return {
    ...baseline,
    authority: "EXPLICIT_MANAGER_REVIEW",
    reason: "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE",
    reviewedAt: approval.reviewedAt,
    varianceFromCalculatedExpected: roundMoney(baseline.amount - baseline.calculatedRange.expectedAmount),
    varianceFromNominal: roundMoney(baseline.amount - baseline.financialTerms.nominalAmount),
    paidComponents: null,
  };
};
