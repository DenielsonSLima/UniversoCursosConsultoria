import { normalizeBaneseFinancialTerms, type BaneseFinancialTermsInput } from "./financial-terms.ts";

export const RENEGOTIATION_RECEIPT_DAYS = 60;
export const RENEGOTIATION_RECEIPT_INSTRUCTION =
  "SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.";

export type RenegotiationBillingSnapshot = {
  version: 1;
  origin: "RENEGOTIATION";
  agreementId: string;
  receiptPolicy: { daysAfterDue: 60; instruction: string };
  financialTerms: BaneseFinancialTermsInput;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A dedicated, server-generated snapshot wins over mutable credential metadata. */
export const renegotiationBillingSnapshotFromReceivable = (
  value: unknown,
): RenegotiationBillingSnapshot | null => {
  const receivable = record(value);
  const candidate = receivable.regra_financeira_renegociacao_snapshot;
  const tagged = String(receivable.tipo_lancamento || "").toUpperCase() === "RENEGOCIACAO" ||
    Boolean(receivable.renegotiation_agreement_id);
  if (candidate == null && !tagged) return null;
  const snapshot = record(candidate);
  const policy = record(snapshot.receiptPolicy);
  if (snapshot.version !== 1 || snapshot.origin !== "RENEGOTIATION" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(snapshot.agreementId || "")) ||
    (receivable.renegotiation_agreement_id && receivable.renegotiation_agreement_id !== snapshot.agreementId) ||
    policy.daysAfterDue !== RENEGOTIATION_RECEIPT_DAYS ||
    policy.instruction !== RENEGOTIATION_RECEIPT_INSTRUCTION) {
    throw new Error("A parcela renegociada não possui política de recebimento canônica.");
  }
  const terms = normalizeBaneseFinancialTerms(snapshot.financialTerms as BaneseFinancialTermsInput);
  if (Number(receivable.valor) !== terms.nominalAmount ||
    String(receivable.data_vencimento || "").slice(0, 10) !== terms.dueDate) {
    throw new Error("Os termos da renegociação divergem da parcela persistida.");
  }
  return { version: 1, origin: "RENEGOTIATION", agreementId: String(snapshot.agreementId),
    receiptPolicy: { daysAfterDue: 60, instruction: RENEGOTIATION_RECEIPT_INSTRUCTION },
    financialTerms: terms };
};
