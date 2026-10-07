import { CorrectionBlocked } from "./processor.ts";

export const CORRECTION_ACTION = "cancel_approved_financial_correction_item";

export function parseCorrectionRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CorrectionBlocked("INVALID_REQUEST");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(",") !==
    "action,manifestFingerprint,operationId,receivableId" ||
    body.action !== CORRECTION_ACTION || typeof body.operationId !== "string" ||
    typeof body.receivableId !== "string" || typeof body.manifestFingerprint !== "string") {
    throw new CorrectionBlocked("INVALID_REQUEST");
  }
  return {
    operationId: body.operationId,
    receivableId: body.receivableId,
    manifestFingerprint: body.manifestFingerprint,
  };
}
