import { cancelBaneseBoleto, queryBaneseBoleto } from "../banese/core/adapter.ts";
import { BaneseBoletoPaymentProcessingError } from "../banese/core/adapter/boleto-cancellation-processing.ts";
import { nextNationalBankingDay } from "../banese/internal/banking-calendar.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { assertBaneseLastPaymentDate, baneseLastPaymentDate } from "../banese/internal/receipt-deadline.ts";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { classifyBaneseReconciliationError } from "./error-classification.ts";
import { recoverBaneseEadCheckoutPayment } from "./ead-checkout-payment-recovery.ts";

type Environment = "sandbox" | "production";
type Claim = {
  claimed: true;
  jobId: string;
  leaseToken: string;
  receivableId: string;
  attemptId?: string;
  environment: Environment;
  mode: "CANCEL" | "VERIFY" | "OBSERVE";
  firstExpirationDay: string;
  verifiedLocalHolidays: string[] | null;
  lastErrorCode?: string | null;
  officialLastPaymentDate?: string | null;
  localPaid?: boolean;
  settledPaymentCount?: number;
  cancelReason?: "EXPIRED_OPTIONAL" | "DUPLICATE_PENDING";
  snapshot: {
    receivableId: string;
    amount: number;
    dueDate: string;
    convenio: string;
    nossoNumero: string;
    agency: string;
    line: string;
    barcode: string;
    financialTerms: Parameters<typeof normalizeBaneseFinancialTerms>[0];
  };
};
type Identity = { payerDocument: string; agency: string; account: string };
type Dependencies = {
  queryBoleto?: typeof queryBaneseBoleto;
  cancelBoleto?: typeof cancelBaneseBoleto;
  reconcile?: typeof reconcileBaneseReceivable;
  loadIdentity?: (admin: any, claim: Claim) => Promise<Identity>;
  today?: () => string;
  recoverPayment?: typeof recoverBaneseEadCheckoutPayment;
  claimLane?: "ACTION" | "OBSERVE";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const addDay = (day: string) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

export const firstEadCheckoutExpirationDay = (
  dueDate: string,
  verifiedLocalHolidays: string[] | null,
): string | null => {
  if (!verifiedLocalHolidays || verifiedLocalHolidays.some((d) => !/^2026-\d{2}-\d{2}$/.test(d))) return null;
  let day = dueDate;
  let effectiveDay: string | null = null;
  let completeDays = 0;
  for (let step = 0; step < 40; step++) {
    const bankingDay = nextNationalBankingDay(day);
    if (!bankingDay) return null;
    if (!verifiedLocalHolidays.includes(bankingDay)) {
      if (!effectiveDay) effectiveDay = bankingDay;
      else completeDays += 1;
      if (completeDays === 3) {
        const firstDay = addDay(bankingDay);
        return firstDay.startsWith("2026-") ? firstDay : null;
      }
    }
    day = addDay(bankingDay);
  }
  return null;
};

const maceioToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Maceio", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const rpc = async (admin: any, name: string, args?: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

const loadIdentity = async (admin: any, claim: Claim): Promise<Identity> => {
  const { data: receivable, error: receivableError } = await admin.from("contas_receber")
    .select("cliente_id").eq("id", claim.receivableId).single();
  if (receivableError) throw receivableError;
  const [payer, credential] = await Promise.all([
    admin.from("parceiros").select("cpf_cnpj").eq("id", receivable.cliente_id).single(),
    admin.from("payment_gateway_credentials").select("metadata")
      .eq("provider_code", "banese_card").eq("environment", claim.environment).single(),
  ]);
  if (payer.error) throw payer.error;
  if (credential.error) throw credential.error;
  const metadata = credential.data?.metadata || {};
  const identity = {
    payerDocument: digits(payer.data?.cpf_cnpj),
    agency: digits(metadata.baneseAgencia).padStart(3, "0"),
    account: digits(metadata.baneseConta || metadata.baneseContaDisplay),
  };
  if (![11, 14].includes(identity.payerDocument.length)
    || !/^\d{3}$/.test(identity.agency) || identity.agency === "000"
    || !/^\d{9}$/.test(identity.account)
    || identity.agency !== digits(claim.snapshot.agency).padStart(3, "0")
    || digits(metadata.baneseBoletoConvenio || metadata.baneseConvenio) !== claim.snapshot.convenio) {
    throw new Error("EAD_EXPIRATION_BENEFICIARY_IDENTITY_INVALID");
  }
  return identity;
};

const validateClaim = (value: unknown): Claim => {
  const claim = value as Claim;
  if (!claim || !UUID.test(claim.jobId) || !UUID.test(claim.leaseToken)
    || !UUID.test(claim.receivableId) || claim.snapshot?.receivableId !== claim.receivableId
    || !["sandbox", "production"].includes(claim.environment)
    || !["CANCEL", "VERIFY", "OBSERVE"].includes(claim.mode)
    || (claim.mode === "OBSERVE" || claim.cancelReason === "DUPLICATE_PENDING") && !UUID.test(claim.attemptId ?? "")
    || claim.cancelReason !== undefined && !["EXPIRED_OPTIONAL", "DUPLICATE_PENDING"].includes(claim.cancelReason)
    || !/^\d{9}$/.test(claim.snapshot.nossoNumero)
    || !/^\d{1,20}$/.test(claim.snapshot.convenio)
    || !Number.isFinite(Number(claim.snapshot.amount)) || Number(claim.snapshot.amount) <= 0
    || !/^0479\d{43}$/.test(claim.snapshot.line) || !/^0479\d{40}$/.test(claim.snapshot.barcode)
    || claim.mode === "CANCEL" && !Array.isArray(claim.verifiedLocalHolidays)) {
    throw new Error("EAD_EXPIRATION_CLAIM_INVALID");
  }
  return claim;
};

const fingerprint = async (snapshot: {
  nossoNumero: string; situationCode: number; remoteStatus: string; payments: unknown[];
  raw?: unknown;
}) => {
  const raw = snapshot.raw && typeof snapshot.raw === "object"
    ? snapshot.raw as Record<string, unknown> : {};
  const bytes = new TextEncoder().encode(JSON.stringify({
    title: snapshot.nossoNumero, situation: snapshot.situationCode,
    status: snapshot.remoteStatus, paymentCount: snapshot.payments.length,
    lastPaymentDate: raw.DataLimitePagamento ?? raw.dataLimitePagamento ?? null,
  }));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const processOneBaneseEadCheckoutExpiration = async (
  admin: any,
  dependencies: Dependencies = {},
) => {
  const { data, error } = await admin.rpc("claim_banese_ead_checkout_expiration", {
    p_lane: dependencies.claimLane ?? "ACTION",
  });
  if (error) {
    if (error.code === "PGRST202") return { handled: false };
    throw error;
  }
  if (!data?.claimed) return { handled: false, reviewRequired: data?.reviewRequired === true };
  const claim = validateClaim(data);
  if ((dependencies.claimLane === "OBSERVE" && claim.mode !== "OBSERVE") ||
    (dependencies.claimLane === "ACTION" && claim.mode === "OBSERVE")) {
    throw new Error("EAD_EXPIRATION_CLAIM_LANE_INVALID");
  }
  const finish = async (result: string, extra: Record<string, unknown> = {}) => {
    const completed = await rpc(admin, "finish_banese_ead_checkout_expiration", {
      p_job_id: claim.jobId, p_lease_token: claim.leaseToken, p_result: result, ...extra,
    });
    const expected = result === "CANCELED" || result === "OBSERVED_UNPAID" ? "DONE" : result;
    if (completed?.jobId !== claim.jobId || !(completed.state === expected
      || result === "RETRY" && completed.state === "REVIEW_REQUIRED")) {
      throw new Error("EAD_EXPIRATION_COMPLETION_ACK_INVALID");
    }
    return completed;
  };
  const controller = new AbortController();
  // A dedicated worker keeps this bank deadline independent of normal batches.
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let mutationStarted = claim.mode === "VERIFY";
  const reconcileStrictly = () => (dependencies.reconcile ?? reconcileBaneseReceivable)(
    admin, claim.receivableId, {
      signal: controller.signal,
      queryBoleto: (queryAdmin, environment, input) =>
        (dependencies.queryBoleto ?? queryBaneseBoleto)(queryAdmin, environment, {
          ...input, strictEffectivePayments: true,
        }),
    },
  );
  try {
    if (claim.mode === "CANCEL" && claim.lastErrorCode !== "WAITING_COMPENSATION" &&
      claim.cancelReason !== "DUPLICATE_PENDING") {
      const expirationDay = firstEadCheckoutExpirationDay(claim.snapshot.dueDate, claim.verifiedLocalHolidays);
      if (!expirationDay || expirationDay !== claim.firstExpirationDay) {
        throw new Error("EAD_EXPIRATION_CALENDAR_UNVERIFIED");
      }
      const today = (dependencies.today ?? maceioToday)();
      if (!today.startsWith("2026-") || today < expirationDay) {
        throw new Error("EAD_EXPIRATION_CALENDAR_OR_COMPENSATION_WINDOW_OPEN");
      }
    }
    if (claim.mode !== "OBSERVE" && claim.cancelReason !== "DUPLICATE_PENDING" &&
      claim.localPaid === true && Number(claim.settledPaymentCount) > 0) {
      const payment = await reconcileStrictly();
      if (!payment.paid || payment.receivable?.status !== "PAGO") {
        throw new Error("EAD_EXPIRATION_PAYMENT_RECONCILIATION_INCOMPLETE");
      }
      await finish("PAID", { p_remote_status: "PAID", p_payment_count: claim.settledPaymentCount });
      return { handled: true, result: "PAID" };
    }
    const identity = await (dependencies.loadIdentity ?? loadIdentity)(admin, claim);
    const financialTerms = normalizeBaneseFinancialTerms(claim.snapshot.financialTerms);
    if (financialTerms.nominalAmount !== Number(claim.snapshot.amount)
      || financialTerms.dueDate !== claim.snapshot.dueDate) {
      throw new Error("EAD_EXPIRATION_FINANCIAL_TERMS_DIVERGENCE");
    }
    const queryInput = {
      convenio: claim.snapshot.convenio, nossoNumero: claim.snapshot.nossoNumero,
      validateTitleIdentity: true, expectedAmount: claim.snapshot.amount,
      expectedDueDate: claim.snapshot.dueDate, expectedAgency: identity.agency,
      expectedAccount: identity.account, expectedPayerDocument: identity.payerDocument,
      expectedDocumentNumber: claim.receivableId.slice(0, 15),
      expectedCompanyTitleId: claim.receivableId.slice(0, 25),
      strictEffectivePayments: true,
      signal: controller.signal,
    };
    // Pure GET keeps the local snapshot intact before the cancellation CAS.
    const snapshot = await (dependencies.queryBoleto ?? queryBaneseBoleto)(admin, claim.environment, queryInput);
    if (snapshot.paymentsError) throw snapshot.paymentsError;
    if (snapshot.financialTermsError) throw snapshot.financialTermsError;
    assertBaneseFinancialTermsEqual(financialTerms, snapshot.financialTerms!);
    if (claim.officialLastPaymentDate != null) {
      assertBaneseLastPaymentDate(snapshot.raw, claim.snapshot.dueDate, claim.officialLastPaymentDate);
    }
    const evidence = {
      p_remote_status: snapshot.remoteStatus, p_situation_code: snapshot.situationCode,
      p_payment_count: snapshot.payments.length, p_evidence_fingerprint: await fingerprint(snapshot),
    };
    if (snapshot.paid || snapshot.payments.length > 0) {
      if (claim.mode === "OBSERVE" || claim.cancelReason === "DUPLICATE_PENDING") {
        const recovered = await (dependencies.recoverPayment ?? recoverBaneseEadCheckoutPayment)(admin, {
          jobId: claim.jobId, leaseToken: claim.leaseToken, receivableId: claim.receivableId,
          attemptId: claim.attemptId!, expectedSnapshot: claim.snapshot,
          bankSnapshot: snapshot, today: (dependencies.today ?? maceioToday)(),
        });
        return { handled: true, result: recovered.state, mode: claim.mode, reviewId: recovered.reviewId };
      }
      const payment = await reconcileStrictly();
      if (!payment.paid || payment.receivable?.status !== "PAGO") {
        throw new Error("EAD_EXPIRATION_PAYMENT_RECONCILIATION_INCOMPLETE");
      }
      await finish("PAID", { ...evidence, p_remote_status: "PAID" });
      return { handled: true, result: "PAID" };
    }
    const lastPaymentDate = baneseLastPaymentDate(snapshot.raw, claim.snapshot.dueDate);
    if ((snapshot.situationCode === 5 && snapshot.remoteStatus === "CANCELED")
      || (snapshot.situationCode === 4 && snapshot.remoteStatus === "EXPIRED")) {
      const result = claim.mode === "OBSERVE" ? "OBSERVED_UNPAID" : "CANCELED";
      await finish(result, { ...evidence, p_last_payment_date: lastPaymentDate });
      return { handled: true, result, mode: claim.mode };
    }
    if (snapshot.situationCode !== 2 || snapshot.remoteStatus !== "PENDING") {
      throw new Error("EAD_EXPIRATION_REMOTE_STATUS_REQUIRES_REVIEW");
    }
    if (claim.mode !== "CANCEL" || claim.lastErrorCode === "WAITING_COMPENSATION") {
      const waiting = claim.lastErrorCode === "WAITING_COMPENSATION";
      await finish(waiting ? "RETRY" : "REVIEW_REQUIRED", {
        ...evidence, p_error_code: waiting ? "WAITING_COMPENSATION" : "REMOTE_MUTATION_AMBIGUOUS",
      });
      return { handled: true, result: waiting ? "WAITING_COMPENSATION" : "REVIEW_REQUIRED", mode: claim.mode };
    }
    const canceled = await (dependencies.cancelBoleto ?? cancelBaneseBoleto)(admin, claim.environment, {
      ...queryInput, expectedDigitableLine: claim.snapshot.line, expectedBarcode: claim.snapshot.barcode,
      expectedFinancialTerms: financialTerms,
      expectedLastPaymentDate: lastPaymentDate,
      onMutationStart: async () => {
        const started = await rpc(admin, "start_banese_ead_checkout_expiration_mutation", {
          p_job_id: claim.jobId, p_lease_token: claim.leaseToken,
          p_last_payment_date: lastPaymentDate, p_evidence_fingerprint: evidence.p_evidence_fingerprint,
        });
        if (started !== true) throw new Error("EAD_EXPIRATION_MUTATION_FENCE_REJECTED");
        mutationStarted = true;
      },
    });
    if (canceled.situationCode !== 5 || canceled.remoteStatus !== "CANCELED") {
      throw new Error("EAD_EXPIRATION_CANCELLATION_NOT_CONFIRMED");
    }
    await finish("CANCELED", {
      p_remote_status: "CANCELED", p_situation_code: 5, p_payment_count: 0,
      p_last_payment_date: lastPaymentDate,
      p_evidence_fingerprint: await fingerprint({ ...canceled, payments: [] }),
    });
    return { handled: true, result: "CANCELED", mode: claim.mode };
  } catch (error) {
    const classification = classifyBaneseReconciliationError(error);
    const processing = error instanceof BaneseBoletoPaymentProcessingError;
    const paidDuringPreflight = error instanceof Error && /ja confirmou o pagamento/i.test(error.message);
    const retryable = processing || paidDuringPreflight || mutationStarted
      || ["NETWORK", "TIMEOUT", "UPSTREAM_5XX", "RATE_LIMIT"].includes(classification.errorClass);
    const proofDiagnostic = error instanceof Error &&
        /^(EAD_EXPIRATION_RECEIPT_DEADLINE_(UNVERIFIED|INVALID|CHANGED)|EAD_PAYMENT_RECOVERY_(IDENTITY_OR_PAYMENT_INVALID|AMOUNT_OR_DATE_INVALID|ACK_INVALID))$/.test(error.message)
      ? error.message : classification.diagnosticCode;
    const code = processing || claim.lastErrorCode === "WAITING_COMPENSATION" ? "WAITING_COMPENSATION"
      : paidDuringPreflight ? "PAYMENT_DETECTED_DURING_PREFLIGHT"
      : mutationStarted ? "REMOTE_MUTATION_AMBIGUOUS"
      : proofDiagnostic;
    await finish(retryable ? "RETRY" : "REVIEW_REQUIRED", { p_error_code: code });
    return { handled: true, result: processing ? "WAITING_COMPENSATION" : retryable ? "RETRY" : "REVIEW_REQUIRED", mode: claim.mode };
  } finally {
    clearTimeout(timeout);
  }
};
