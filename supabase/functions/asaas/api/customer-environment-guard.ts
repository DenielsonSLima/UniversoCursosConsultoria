export const asaasCustomerCandidateIds = (
  environmentMappingId: unknown,
  legacyCustomerId: unknown,
) => {
  const candidates = [environmentMappingId, legacyCustomerId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(candidates)];
};

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

export const asaasCustomerMatchesDocument = (
  customer: Record<string, unknown> | null | undefined,
  expectedDocument: unknown,
) =>
  Boolean(customer?.id) &&
  onlyDigits(customer?.cpfCnpj) === onlyDigits(expectedDocument);
