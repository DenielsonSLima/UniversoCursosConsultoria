import {
  BANESE_CARNET_ALLOWED_LAUNCH_TYPES,
  BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES,
  type BaneseCarnetReceivableRow,
  isRegisteredBaneseDocumentRow,
} from "../banese-carnet-document/document-policy.ts";
import type { BaneseDocumentGroup } from "./document-groups.ts";

export type DocumentExclusionReason =
  | "OTHER_OR_MISSING_BANK_PROVIDER"
  | "NOT_PAYABLE"
  | "UNSUPPORTED_LAUNCH_TYPE"
  | "BANK_EVIDENCE_MISSING"
  | "BANK_EVIDENCE_INVALID"
  | "DOCUMENT_GROUP_INCONSISTENT";

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();
/** Mirror the existing SQL predicates even when reading exclusions for one enrollment. */
export const isCatalogBankCandidate = (row: BaneseCarnetReceivableRow) => (
  row.gateway_provider === "banese_card" && row.gateway_payment_method === "BOLETO" &&
  (BANESE_CARNET_ALLOWED_LAUNCH_TYPES as readonly unknown[]).includes(row.tipo_lancamento) &&
  (BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES as readonly unknown[]).includes(row.status) &&
  row.gateway_boleto_issued_at != null && row.gateway_financial_terms_confirmed_at != null &&
  isRegisteredBaneseDocumentRow(row)
);
const reasonFor = (row: BaneseCarnetReceivableRow): DocumentExclusionReason | null => {
  if (upper(row.gateway_provider) !== "BANESE_CARD" || upper(row.gateway_payment_method) !== "BOLETO") {
    return "OTHER_OR_MISSING_BANK_PROVIDER";
  }
  if (!(BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES as readonly string[]).includes(upper(row.status))) {
    return "NOT_PAYABLE";
  }
  if (!(BANESE_CARNET_ALLOWED_LAUNCH_TYPES as readonly string[]).includes(upper(row.tipo_lancamento))) {
    return "UNSUPPORTED_LAUNCH_TYPE";
  }
  if ([row.gateway_boleto_issued_at, row.gateway_financial_terms_confirmed_at,
    row.gateway_boleto_linha_digitavel, row.gateway_boleto_codigo_barras,
    row.gateway_boleto_nosso_numero, row.gateway_boleto_convenio,
    row.gateway_boleto_agencia, row.gateway_issuer_polo_id, row.gateway_environment,
    row.cliente_id, row.matricula_id, row.gateway_financial_terms]
    .some((value) => value == null || value === "")) return "BANK_EVIDENCE_MISSING";
  return isCatalogBankCandidate(row) ? null : "BANK_EVIDENCE_INVALID";
};

/** Counts only: never expose a discarded row, bank identity or raw validation error. */
export const buildEnrollmentDocumentDiagnostics = (
  rows: BaneseCarnetReceivableRow[],
  groups: BaneseDocumentGroup[],
  complete = true,
) => {
  const availableIds = new Set(groups.flatMap((group) => group.receivableIds));
  const counts = new Map<DocumentExclusionReason, number>();
  for (const row of rows) {
    const reason = reasonFor(row) ?? (availableIds.has(row.id) ? null : "DOCUMENT_GROUP_INCONSISTENT");
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return {
    inspectedCount: rows.length,
    availableCount: rows.filter((row) => availableIds.has(row.id)).length,
    complete,
    exclusions: [...counts].map(([reason, count]) => ({ reason, count })),
  };
};
