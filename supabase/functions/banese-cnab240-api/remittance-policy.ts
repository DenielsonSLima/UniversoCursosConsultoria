import {
  prepareRemittance,
  publicRemittancePreview,
} from "./remittance-preparation.ts";

const SUPPORTED_INSTRUCTION_FIELDS = [
  ["movementCode", "01"],
  ["remittanceMovementCode", "01"],
  ["entryType", "CNAB240_NEW_TITLE"],
  ["operation", "NEW_TITLE"],
] as const;

/**
 * A contingência implementada gera somente entrada de título (movimento 01).
 * O layout Banese descreve pedido de baixa (02), mas esse contrato, gerador e
 * ciclo de confirmação ainda não foram implementados nem homologados.
 */
export const assertNewTitleRemittanceRequest = (
  body: Record<string, unknown>,
) => {
  for (const [field, supportedValue] of SUPPORTED_INSTRUCTION_FIELDS) {
    if (!Object.hasOwn(body, field)) continue;
    const requested = String(body[field] || "").trim().toUpperCase();
    if (requested && requested !== supportedValue) {
      throw new Error(
        "A remessa CNAB240 disponível aceita somente entrada de título (movimento 01). Pedido de baixa/cancelamento permanece bloqueado até homologação específica.",
      );
    }
  }
};

export const previewRemittance = async (
  admin: any,
  body: Record<string, unknown>,
) => {
  assertNewTitleRemittanceRequest(body);
  return publicRemittancePreview(
    await prepareRemittance(admin, body.receivableIds, body.environment),
  );
};

export const isConfirmedRemittanceClaimState = (
  file: any,
  receivables: any[],
  expectedReceivableIds: string[],
) => {
  const expectedIds = new Set(expectedReceivableIds);
  return Boolean(
    file?.status === "GENERATED" &&
      Number(file?.title_count || 0) === expectedIds.size &&
      Number(file?.processing_summary?.claimedReceivables || 0) ===
        expectedIds.size &&
      receivables.length === expectedIds.size &&
      receivables.every((receivable) =>
        expectedIds.has(receivable.id) &&
        receivable.gateway_submission_channel === "CNAB" &&
        receivable.gateway_submission_status === "CNAB_GENERATED" &&
        receivable.gateway_cnab_file_id === file.id
      ),
  );
};
