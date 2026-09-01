import type { GatewayChargeResult } from "../gateways/router.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { strictTechnicalManualBaneseFinancialTerms } from "../gateways/api/banese-financial-terms.ts";
import { validateBaneseGatewayResult } from "./contract.ts";

export type LoadedReceivable = {
  receivable: Record<string, unknown>;
  payer: Record<string, unknown>;
  transactions: Array<Record<string, unknown>>;
};

export type StrictIssuanceScope = {
  matriculaId: string;
  turmaId: string;
  poloId: string;
  issuerPoloId: string;
};

const nullableEvidenceFields = [
  "data_pagamento",
  "valor_pago",
  "manual_settlement_id",
  "manual_settlement_principal_cents",
  "manual_settlement_interest_cents",
  "manual_settlement_penalty_cents",
  "manual_settlement_addition_cents",
  "manual_settlement_discount_cents",
  "manual_settlement_received_cents",
  "manual_settlement_reversed_at",
  "gateway_settlement_channel",
  "gateway_settlement_source",
  "gateway_settlement_evidence",
  "gateway_settlement_recorded_at",
  "gateway_transaction_receipt_url",
] as const;

const remoteArtifactFields = [
  "gateway_payment_id",
  "gateway_payment_link_id",
  "gateway_customer_id",
  "gateway_invoice_url",
  "gateway_bank_slip_url",
  "gateway_pix_payload",
  "gateway_pix_encoded_image",
  "gateway_boleto_linha_digitavel",
  "gateway_boleto_codigo_barras",
  "gateway_boleto_issued_at",
  "gateway_financial_terms_confirmed_at",
  "gateway_submission_channel",
  "gateway_submission_status",
  "gateway_cnab_file_id",
  "asaas_payment_id",
  "asaas_payment_link_id",
  "asaas_status",
] as const;

const hasValue = (value: unknown) =>
  value !== null && value !== undefined &&
  String(value).trim() !== "";

export const hasUnsafePartialBaneseEvidence = (loaded: LoadedReceivable) => {
  const receivable = loaded.receivable;
  if (loaded.transactions.length > 0) return true;
  const gatewayStatus = String(receivable.gateway_status || "")
    .trim().toUpperCase();
  if (gatewayStatus && gatewayStatus !== "CREATING") return true;
  const provider = String(receivable.gateway_provider || "")
    .trim().toLowerCase();
  if (provider && provider !== "banese_card") return true;
  if (nullableEvidenceFields.some((field) => hasValue(receivable[field]))) {
    return true;
  }
  return remoteArtifactFields.some((field) => hasValue(receivable[field]));
};

const persistedGatewayResult = (
  receivable: Record<string, unknown>,
  transaction: Record<string, unknown>,
): GatewayChargeResult => ({
  providerCode: "banese_card",
  remotePaymentId: String(receivable.gateway_payment_id || ""),
  remotePaymentLinkId: null,
  remoteCustomerId: receivable.gateway_customer_id
    ? String(receivable.gateway_customer_id)
    : null,
  remoteStatus: String(receivable.gateway_status || ""),
  invoiceUrl: receivable.gateway_invoice_url
    ? String(receivable.gateway_invoice_url)
    : null,
  bankSlipUrl: receivable.gateway_bank_slip_url
    ? String(receivable.gateway_bank_slip_url)
    : null,
  pixPayload: String(receivable.gateway_pix_payload || ""),
  pixEncodedImage: String(receivable.gateway_pix_encoded_image || ""),
  bankSlipDigitableLine: String(
    receivable.gateway_boleto_linha_digitavel || "",
  ),
  bankSlipBarcode: String(receivable.gateway_boleto_codigo_barras || ""),
  bankSlipOurNumber: String(receivable.gateway_boleto_nosso_numero || ""),
  issuerPoloId: String(receivable.gateway_issuer_polo_id || ""),
  financialTerms: receivable.gateway_financial_terms as Record<
    string,
    unknown
  >,
  rawPayload: transaction.raw_payload &&
      typeof transaction.raw_payload === "object"
    ? transaction.raw_payload as Record<string, unknown>
    : {},
});

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export const isStrictlyIssued = (
  loaded: LoadedReceivable,
  scope: StrictIssuanceScope,
) => {
  const { receivable, transactions } = loaded;
  const transaction = transactions[0];
  if (
    transactions.length !== 1 || !transaction ||
    receivable.matricula_id !== scope.matriculaId ||
    receivable.turma_id !== scope.turmaId ||
    receivable.polo_id !== scope.poloId ||
    receivable.gateway_issuer_polo_id !== scope.issuerPoloId ||
    !["PENDENTE", "VENCIDO"].includes(
      String(receivable.status || "").toUpperCase(),
    ) ||
    nullableEvidenceFields.some((field) => hasValue(receivable[field])) ||
    receivable.forma_pagamento !== "BOLETO" ||
    receivable.gateway_provider !== "banese_card" ||
    receivable.gateway_environment !== "production" ||
    receivable.gateway_payment_method !== "BOLETO" ||
    receivable.gateway_submission_channel !== "API" ||
    receivable.gateway_submission_status !== "API_REGISTERED" ||
    receivable.gateway_status !== "PENDING" ||
    hasValue(receivable.gateway_creation_token) ||
    hasValue(receivable.gateway_payment_link_id) ||
    hasValue(receivable.gateway_cnab_file_id) ||
    !receivable.gateway_boleto_issued_at ||
    !receivable.gateway_financial_terms_confirmed_at ||
    transaction.provider_code !== "banese_card" ||
    transaction.environment !== "production" ||
    transaction.payment_method !== "BOLETO" ||
    transaction.origin_polo_id !== scope.poloId ||
    transaction.issuer_polo_id !== scope.issuerPoloId ||
    transaction.remote_status !== "PENDING" ||
    Math.round(Number(transaction.amount) * 100) !==
      Math.round(Number(receivable.valor) * 100) ||
    !transaction.raw_payload || typeof transaction.raw_payload !== "object" ||
    typeof (
        transaction.raw_payload as Record<string, unknown>
      ).manualCycleIssuance !== "object"
  ) return false;
  try {
    const normalized = validateBaneseGatewayResult(
      persistedGatewayResult(receivable, transaction),
      receivable,
    );
    const expectedTerms = normalizeBaneseFinancialTerms(
      strictTechnicalManualBaneseFinancialTerms(receivable),
    );
    return sameJson(normalized.financialTerms, expectedTerms) &&
      transaction.remote_payment_id === normalized.remotePaymentId &&
      transaction.bank_slip_our_number === normalized.bankSlipOurNumber &&
      transaction.bank_slip_digitable_line ===
        normalized.bankSlipDigitableLine &&
      transaction.bank_slip_barcode === normalized.bankSlipBarcode &&
      transaction.pix_payload === normalized.pixPayload &&
      transaction.pix_encoded_image === normalized.pixEncodedImage;
  } catch {
    return false;
  }
};
