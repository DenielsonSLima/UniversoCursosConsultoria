import { queryBaneseBoleto } from "../banese/core/adapter.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { calculateBaneseSettlementRange } from "../banese/internal/settlement-range.ts";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import {
  assertBaneseReceivableTitleCompatible, assertBaneseReconciliationProvenance,
  banesePaymentDate, sumBanesePaymentValues,
} from "../gateways/api/banese-reconciliation-contract.ts";
import { loadBaneseExpectedTransactions } from "../gateways/api/banese-reconciliation-persistence.ts";
import type { BaneseReviewedSettlementApproval } from "../gateways/api/banese-reviewed-settlement.ts";
import { BANESE_DISCOUNT_REMOVAL_PENDING } from "../gateways/api/banese-discount-removal.ts";
import { assertPortalPdfBankEvidence, isPortalPdfImport } from "./portal-pdf-evidence.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const authority = "EXPLICIT_MANAGER_REVIEW" as const;
const reason = "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE" as const;
const cents = (value: number) => Math.round(value * 100);
const sameMoney = (value: number, expected: number) => Number.isFinite(value) && Math.abs(value - expected) < 0.0000001;
const sameTerms = (value: unknown, terms: ReturnType<typeof normalizeBaneseFinancialTerms>) =>
  JSON.stringify(normalizeBaneseFinancialTerms(value as Parameters<typeof normalizeBaneseFinancialTerms>[0])) === JSON.stringify(terms);

export type ReviewedPaymentInput = { receivableId: string; expectedAmount: number; expectedPaymentDate: string };
export const isReviewedPaymentInput = (input: unknown): input is ReviewedPaymentInput => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const date = typeof value.expectedPaymentDate === "string" ? value.expectedPaymentDate : "";
  return typeof value.receivableId === "string" && uuid.test(value.receivableId) &&
    typeof value.expectedAmount === "number" && Number.isFinite(value.expectedAmount) && value.expectedAmount > 0 &&
    Number.isSafeInteger(cents(value.expectedAmount)) && Math.abs(value.expectedAmount * 100 - cents(value.expectedAmount)) < 0.000001 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
};

const payloadRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "string") {
    try { return payloadRecord(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};

const loadReviewContext = async (admin: any, input: ReviewedPaymentInput) => {
  if (!isReviewedPaymentInput(input)) throw new Error("INVALID_REVIEWED_PAYMENT_INPUT");
  const { data: row, error } = await admin.from("contas_receber").select("*").eq("id", input.receivableId).maybeSingle();
  if (error || !row || row.gateway_provider !== "banese_card" || row.gateway_payment_method !== "BOLETO" ||
    row.gateway_environment !== "production" || row.gateway_submission_channel !== "API" ||
    row.gateway_submission_status !== "API_REGISTERED" || row.gateway_last_error === BANESE_DISCOUNT_REMOVAL_PENDING ||
    !["PENDENTE", "VENCIDO", "AGUARDANDO_CONFIRMACAO", "PAGO"].includes(String(row.status))) {
    throw new Error("REVIEWED_PAYMENT_SCOPE_INVALID");
  }
  const nossoNumero = assertBaneseReceivableTitleCompatible(row);
  const transactions = await loadBaneseExpectedTransactions(admin, { receivableId: input.receivableId, environment: "production" });
  if (transactions.length !== 1 || transactions[0].is_legacy_import || isPortalPdfImport(transactions[0].raw_payload)) {
    throw new Error("REVIEWED_PAYMENT_TRANSACTION_INVALID");
  }
  assertBaneseReconciliationProvenance(row, transactions, nossoNumero);
  const bankNumbers = assertPortalPdfBankEvidence(row, transactions[0], nossoNumero);
  const terms = normalizeBaneseFinancialTerms(row.gateway_financial_terms);
  if (cents(terms.nominalAmount) !== cents(Number(row.valor)) || terms.dueDate !== String(row.data_vencimento).slice(0, 10) ||
    !digits(row.gateway_boleto_convenio)) throw new Error("REVIEWED_PAYMENT_TERMS_INVALID");
  const calculatedRange = calculateBaneseSettlementRange(terms, input.expectedPaymentDate);
  if (cents(input.expectedAmount) >= cents(calculatedRange.minimumAmount) &&
    cents(input.expectedAmount) <= cents(calculatedRange.maximumAmount)) throw new Error("REVIEWED_PAYMENT_VARIANCE_ABSENT");
  const persisted = payloadRecord(payloadRecord(transactions[0].raw_payload).paymentVarianceReview);
  const replay = row.status === "PAGO";
  if (replay) {
    if (persisted.authority !== authority || persisted.reason !== reason || persisted.receivableId !== input.receivableId ||
      persisted.environment !== "production" || persisted.nossoNumero !== nossoNumero ||
      !sameMoney(Number(persisted.amount), input.expectedAmount) || persisted.paymentDate !== input.expectedPaymentDate ||
      !sameTerms(persisted.financialTerms, terms) || !sameMoney(Number(row.valor_pago), input.expectedAmount) ||
      String(row.data_pagamento).slice(0, 10) !== input.expectedPaymentDate || row.gateway_status !== "PAID" ||
      transactions[0].remote_status !== "PAID" || persisted.paidComponents !== null ||
      typeof persisted.reviewedAt !== "string" || !Number.isFinite(Date.parse(persisted.reviewedAt))) {
      throw new Error("REVIEWED_PAYMENT_REPLAY_INVALID");
    }
  } else {
    const { data: queue, error: queueError } = await admin.from("banese_reconciliation_queue")
      .select("state,last_error_class,last_result,modality,environment").eq("receivable_id", input.receivableId)
      .eq("environment", "production").maybeSingle();
    if (queueError || !queue || queue.state !== "QUARANTINED" || queue.last_error_class !== "REVIEW_REQUIRED" ||
      queue.last_result !== "ERROR" || queue.modality !== "TECNICO") throw new Error("REVIEWED_PAYMENT_NOT_QUARANTINED");
  }
  return { row, nossoNumero, bankNumbers, terms, calculatedRange, persisted, replay };
};

// Explicit worker action only. The automatic reconciler never supplies this
// approval callback; its financial range guard remains unchanged.
export const reconcileReviewedPayment = async (
  admin: any,
  input: ReviewedPaymentInput,
  dependencies: { queryBoleto?: typeof queryBaneseBoleto; reconcile?: typeof reconcileBaneseReceivable } = {},
) => {
  const initial = await loadReviewContext(admin, input);
  let officialVerified = false;
  let reviewRecorded = initial.replay;
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const result = await (dependencies.reconcile ?? reconcileBaneseReceivable)(admin, input.receivableId, {
      signal: controller.signal,
      repairDiscountRemoval: async () => { throw new Error("REVIEWED_PAYMENT_MAINTENANCE_NOT_ALLOWED"); },
      queryBoleto: async (client, environment, queryInput) => {
        const context = await loadReviewContext(client, input);
        const agency = digits(queryInput.expectedAgency), account = digits(queryInput.expectedAccount);
        if (environment !== "production" || digits(queryInput.nossoNumero) !== context.nossoNumero ||
          digits(queryInput.convenio) !== digits(context.row.gateway_boleto_convenio) ||
          Number(queryInput.expectedAmount) !== context.terms.nominalAmount || queryInput.expectedDueDate !== context.terms.dueDate ||
          queryInput.expectedDocumentNumber !== input.receivableId.slice(0, 15) ||
          queryInput.expectedCompanyTitleId !== input.receivableId.slice(0, 25) ||
          ![11, 14].includes(digits(queryInput.expectedPayerDocument).length) ||
          !/^\d{3}$/.test(agency) || agency === "000" || !/^\d{9}$/.test(account) || account === "000000000") {
          throw new Error("REVIEWED_PAYMENT_QUERY_IDENTITY_INVALID");
        }
        const snapshot = await (dependencies.queryBoleto ?? queryBaneseBoleto)(client, environment, {
          ...queryInput, recoverPix: false, validateTitleIdentity: true,
          strictEffectivePayments: true, skipEffectivePaymentsWhenOfficiallyUnpaid: false,
        });
        const official = snapshot.raw as Record<string, unknown>;
        if (!snapshot.paid || snapshot.financialTermsError || snapshot.paymentsError || !snapshot.payments.length ||
          !sameMoney(sumBanesePaymentValues(snapshot.payments), input.expectedAmount) ||
          snapshot.payments.some((payment) => banesePaymentDate(payment) !== input.expectedPaymentDate) ||
          digits(official.NumeroLinhaDigitavel ?? official.numeroLinhaDigitavel) !== context.bankNumbers.digitableLine ||
          digits(official.NumeroCodigoBarras ?? official.numeroCodigoBarras) !== context.bankNumbers.barcode ||
          snapshot.pixPayload || snapshot.pixEncodedImage) throw new Error("REVIEWED_PAYMENT_OFFICIAL_EVIDENCE_DIVERGENCE");
        officialVerified = true;
        return snapshot;
      },
      reviewedSettlement: async (facts) => {
        const context = await loadReviewContext(admin, input);
        if (!officialVerified || facts.receivableId !== input.receivableId || facts.environment !== "production" ||
          facts.nossoNumero !== context.nossoNumero || !sameMoney(facts.amount, input.expectedAmount) ||
          facts.paymentDate !== input.expectedPaymentDate || !sameTerms(facts.financialTerms, context.terms) ||
          facts.calculatedRange.minimumAmount !== context.calculatedRange.minimumAmount ||
          facts.calculatedRange.expectedAmount !== context.calculatedRange.expectedAmount ||
          facts.calculatedRange.maximumAmount !== context.calculatedRange.maximumAmount) {
          throw new Error("REVIEWED_PAYMENT_APPROVAL_FACTS_DIVERGENCE");
        }
        reviewRecorded = true;
        return { ...facts, authority, reason, reviewedAt: context.replay
          ? String(context.persisted.reviewedAt) : new Date().toISOString() } satisfies BaneseReviewedSettlementApproval;
      },
    });
    return { success: result.success, action: "reconcile_reviewed_payment", paid: result.paid,
      payments: result.payments, reviewRecorded, amount: input.expectedAmount, paymentDate: input.expectedPaymentDate };
  } finally { clearTimeout(timeout); }
};
