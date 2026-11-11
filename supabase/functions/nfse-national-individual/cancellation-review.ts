import type { CancellationInput } from "../_shared/nfse-national/events.ts";
import { requireContract } from "../_shared/nfse-national/xml.ts";
import type { CancellationRow, IndividualRow } from "./handler.ts";
/** A technical request for this own authorized document; SEFIN decides fiscal eligibility. */
export function assertOwnedIndividualCancellation(
  operation: IndividualRow,
  row: CancellationRow,
  currentIssuerCnpj: string,
): void {
  const issuer = operation.snapshot.issuer as { cnpj?: unknown } | undefined;
  requireContract(
    operation.previewId === row.previewId && operation.state === "AUTHORIZED" &&
      !!operation.authorizedXml &&
      operation.result?.accessKey === row.accessKey,
    "PRODUCTION_OWN_AUTHORIZED_DOCUMENT_REQUIRED",
  );
  requireContract(
    String(issuer?.cnpj || "").replace(/\D/g, "") === currentIssuerCnpj &&
      row.issuerCnpj === currentIssuerCnpj,
    "PRODUCTION_ISSUER_CHANGED",
  );
  requireContract(
    ["1", "2", "9"].includes(row.reasonCode) && row.justification.trim().length >= 15 &&
      row.justification.trim().length <= 255 &&
      !/\{\{|\}\}/.test(row.justification) &&
      row.eventReferenceId === `PRE${row.accessKey}101101`,
    "PRODUCTION_CANCELLATION_REVIEW_REQUIRED",
  );
}

export function buildIndividualCancellationInput(
  row: CancellationRow,
): CancellationInput {
  return {
    environment: "PRODUCAO",
    applicationVersion: "Universo-NFSe-Fila-1",
    occurredAt: row.occurredAt,
    accessKey: row.accessKey,
    author: { type: "CNPJ", value: row.issuerCnpj },
    eventCode: "101101",
    reasonCode: row.reasonCode,
    reason: row.justification,
  };
}
