import { cancelBaneseBoleto } from "../banese/core/adapter/boleto-cancellation.ts";
import { queryBaneseBoleto } from "../banese/core/adapter/boleto-query.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { assertBaneseAsbaceField, assertBaneseBankNumbers, assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import {
  ActivationError, type ActivationContext, type ActivationSource,
  type BankSnapshot, type CancellationEvidence, FINGERPRINT_RE,
} from "./contract.ts";

const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
export const assertCancellationSnapshot = (value: BankSnapshot | null): BankSnapshot => {
  if (!value || value.provider !== "banese_card" || value.environment !== "production" ||
    value.paymentMethod !== "BOLETO" || !/^\d+$/.test(value.convenio) ||
    !/^\d{9}$/.test(value.nossoNumero) || !/^\d{3}$/.test(value.agency) || value.agency === "000" ||
    !/^\d{9}$/.test(digits(value.account)) || !/^(\d{11}|\d{14})$/.test(value.payerDocument) ||
    !value.documentNumber || !value.companyTitleId || !Number.isFinite(value.amount) ||
    value.amount <= 0 || !/^\d{47}$/.test(digits(value.digitableLine)) ||
    !/^\d{44}$/.test(digits(value.barcode))) {
    throw new ActivationError("SOURCE_BANK_SNAPSHOT_INVALID", "Identidade bancária de origem incompleta.");
  }
  const terms = normalizeBaneseFinancialTerms(value.financialTerms);
  if (terms.nominalAmount !== value.amount || terms.dueDate !== value.dueDate) {
    throw new ActivationError("SOURCE_TERMS_DIVERGENCE", "Termos bancários de origem divergentes.");
  }
  const bank = assertBaneseBankNumbers(value.digitableLine, value.barcode);
  assertBaneseDueDateFactor(bank.barcode, value.dueDate);
  assertBaneseAsbaceField(bank.barcode, { agency: value.agency,
    account: digits(value.account), ourNumber: value.nossoNumero });
  if (Number(bank.barcode.slice(9, 19)) !== Math.round(value.amount * 100)) {
    throw new ActivationError("SOURCE_BANK_AMOUNT_DIVERGENCE", "Valor bancário original diverge do snapshot.");
  }
  return value;
};

const fingerprint = async (value: unknown) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))),
)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const createSourceCanceller = (admin: Parameters<typeof cancelBaneseBoleto>[0],
  bank = { cancel: cancelBaneseBoleto, query: queryBaneseBoleto }) =>
async (context: ActivationContext, source: ActivationSource,
  beforeMutation: () => Promise<void>): Promise<CancellationEvidence> => {
  if (!FINGERPRINT_RE.test(source.sourceFingerprint)) {
    throw new ActivationError("SOURCE_FINGERPRINT_INVALID", "Snapshot da parcela de origem inválido.");
  }
  if (source.kind === "LOCAL") {
    if (source.bankSnapshot !== null) throw new ActivationError("LOCAL_BANK_CONFLICT", "Parcela local possui vínculo bancário.");
    // SQL confirms absence of bank identity under lock; no local settlement/payment is created.
    return {
      kind: "LOCAL", situationCode: null, paymentsVerified: false, paymentCount: 0,
      identityVerified: true, confirmedAt: new Date().toISOString(),
      evidenceFingerprint: await fingerprint([context.operationId, source.receivableId, source.sourceFingerprint, "LOCAL"]),
    };
  }
  if (source.kind !== "BANESE") throw new ActivationError("SOURCE_KIND_UNSUPPORTED", "Origem não suportada para ativação.");
  const snapshot = assertCancellationSnapshot(source.bankSnapshot);
  const input = {
    convenio: snapshot.convenio,
    nossoNumero: snapshot.nossoNumero,
    expectedAmount: snapshot.amount,
    expectedDueDate: snapshot.dueDate,
    expectedAgency: snapshot.agency,
    expectedAccount: snapshot.account,
    expectedDocumentNumber: snapshot.documentNumber,
    expectedCompanyTitleId: snapshot.companyTitleId,
    expectedPayerDocument: snapshot.payerDocument,
    expectedDigitableLine: snapshot.digitableLine,
    expectedBarcode: snapshot.barcode,
    expectedFinancialTerms: snapshot.financialTerms,
    signal: AbortSignal.timeout(Math.max(1, Math.min(8_000, (context.deadlineAt || Date.now() + 8_000) - Date.now()))),
  };
  if (source.state === "CANCEL_INTENT") {
    // The preceding PUT may have succeeded. A resume only queries the same identity.
    const result = await bank.query(admin, "production", {
      ...input, validateTitleIdentity: true, recoverPix: false,
    });
    if (result.paymentsError) throw new ActivationError("PAYMENTS_UNCONFIRMED", "Pagamentos bancários ainda não confirmados.", true);
    if (result.paid || result.payments.length > 0) {
      throw new ActivationError("SOURCE_PAYMENT_DETECTED", "Pagamento identificado durante a ativação. Revisão obrigatória.");
    }
    if (result.financialTermsError || !result.financialTerms) {
      throw new ActivationError("SOURCE_TERMS_UNCONFIRMED", "Termos bancários não confirmados na retomada.");
    }
    assertBaneseFinancialTermsEqual(snapshot.financialTerms, result.financialTerms);
    const raw = result.raw as Record<string, unknown>;
    if (digits(raw.NumeroLinhaDigitavel ?? raw.numeroLinhaDigitavel) !== digits(snapshot.digitableLine) ||
      digits(raw.NumeroCodigoBarras ?? raw.numeroCodigoBarras) !== digits(snapshot.barcode)) {
      throw new ActivationError("SOURCE_BANK_NUMBERS_DIVERGENCE", "Identidade do boleto mudou durante a retomada.");
    }
    if (result.situationCode !== 5) {
      throw new ActivationError("CANCELLATION_NOT_CONFIRMED", "Cancelamento bancário não confirmado. Nenhuma nova emissão foi iniciada.");
    }
  } else if (source.state === "PENDING") {
    const result = await bank.cancel(admin, "production", { ...input, onMutationStart: beforeMutation });
    if (result.situationCode !== 5 || result.pixAvailable) {
      throw new ActivationError("CANCELLATION_NOT_CONFIRMED", "O banco não confirmou o cancelamento.");
    }
    if (result.alreadyCanceled) {
      // No PUT was needed. Consume the local per-source intent under the same
      // lease before projecting the already-confirmed bank cancellation.
      await beforeMutation();
    }
  } else {
    throw new ActivationError("SOURCE_STATE_INVALID", "Estado da parcela incompatível com cancelamento.");
  }
  return {
    kind: "BANESE", situationCode: 5, paymentsVerified: true, paymentCount: 0,
    identityVerified: true, confirmedAt: new Date().toISOString(),
    evidenceFingerprint: await fingerprint([context.operationId, source.receivableId, source.sourceFingerprint, 5, 0]),
  };
};
