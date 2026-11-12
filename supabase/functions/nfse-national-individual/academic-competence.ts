import { requireContract } from "../_shared/nfse-national/xml.ts";

type Data = Record<string, unknown>;
const object = (value: unknown): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const code = "FISCAL_COMPETENCE_MODEL_MISMATCH";

/** Mirror the SQL academic payment-day rule using only the frozen reviewed basis. */
export function academicPaymentReference(value: unknown): string {
  const source = object(value), preparation = object(source.preparation);
  const financial = object(object(object(source.reviewBasis).basis).financial);
  const receipts = financial.currentReceipts, month = preparation.payment_month;
  requireContract(source.kind === "ACADEMIC_QUEUE" && typeof month === "string" &&
    /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month) && Array.isArray(receipts) && receipts.length > 0, code);
  const dates = receipts.map((receipt) => {
    const day = object(receipt).paymentDate;
    requireContract(typeof day === "string" && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(day) &&
      day.slice(0, 7) === month, code);
    const parsed = new Date(`${day}T00:00:00.000Z`);
    requireContract(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day, code);
    return day;
  });
  return dates.sort()[dates.length - 1];
}
