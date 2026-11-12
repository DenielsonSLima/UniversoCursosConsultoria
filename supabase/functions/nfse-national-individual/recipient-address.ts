import { requireContract } from "../_shared/nfse-national/xml.ts";

/** Never infer missing address facts. S/N is accepted only when stored explicitly. */
export function assertRecipientAddress(address: Record<string, unknown>): void {
  const text = (key: string) => typeof address[key] === "string" ? (address[key] as string).trim() : "";
  requireContract(/^\d{8}$/.test(text("postalCode").replace(/\D/g, "")), "FISCAL_RECIPIENT_POSTAL_CODE_REQUIRED");
  requireContract(text("street").length > 0, "FISCAL_RECIPIENT_STREET_REQUIRED");
  requireContract(text("number").length > 0, "FISCAL_RECIPIENT_ADDRESS_NUMBER_REQUIRED");
  requireContract(text("district").length > 0, "FISCAL_RECIPIENT_DISTRICT_REQUIRED");
}
