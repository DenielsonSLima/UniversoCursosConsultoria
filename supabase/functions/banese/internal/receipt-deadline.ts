// DataLimitePagamento is the bank's natural write-off date. It does not
// replace the commercial deadline for a beneficiary-requested cancellation.
export const baneseLastPaymentDate = (raw: unknown, dueDate: string): string => {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const candidate = value.DataLimitePagamento ?? value.dataLimitePagamento;
  if (typeof candidate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(candidate)) {
    throw new Error("EAD_EXPIRATION_RECEIPT_DEADLINE_UNVERIFIED");
  }
  const date = candidate.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !Number.isFinite(new Date(candidate).getTime()) ||
    !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
    date < dueDate) {
    throw new Error("EAD_EXPIRATION_RECEIPT_DEADLINE_INVALID");
  }
  return date;
};

export const assertBaneseLastPaymentDate = (
  raw: unknown,
  dueDate: string,
  expected: string,
) => {
  if (baneseLastPaymentDate(raw, dueDate) !== expected) {
    throw new Error("EAD_EXPIRATION_RECEIPT_DEADLINE_CHANGED");
  }
};
