import { assertBaneseDueDateFactor } from "../banese/internal/bank-fields.ts";
import { validateBaneseRecoveredBankNumbers } from "../gateways/api/banese-reconciliation-contract.ts";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export const isPortalPdfImport = (payload: unknown) => {
  let source = payload;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { return false; }
  }
  return Boolean(source && typeof source === "object" && !Array.isArray(source) &&
    (source as Record<string, unknown>).importSource === "BANESE_PORTAL_LEGACY_PDF");
};

// This proof does not change the eligibility of the automatic reconciler.
export const assertPortalPdfBankEvidence = (row: any, transaction: any, nossoNumero: string) => {
  const numbers = validateBaneseRecoveredBankNumbers({
    NumeroLinhaDigitavel: row.gateway_boleto_linha_digitavel,
    NumeroCodigoBarras: row.gateway_boleto_codigo_barras,
  }, { expectedOurNumber: nossoNumero });
  if (!numbers || digits(transaction.bank_slip_digitable_line) !== numbers.digitableLine ||
    digits(transaction.bank_slip_barcode) !== numbers.barcode ||
    Number(numbers.barcode.slice(9, 19)) !== Math.round(Number(row.valor) * 100)) {
    throw new Error("PORTAL_LOCAL_BANK_EVIDENCE_INVALID");
  }
  assertBaneseDueDateFactor(numbers.barcode, String(row.data_vencimento).slice(0, 10));
  return numbers;
};
