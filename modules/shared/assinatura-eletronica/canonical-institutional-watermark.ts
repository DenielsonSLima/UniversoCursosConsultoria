import type {
  ElectronicSignatureCanonicalInstitutionalWatermarkDataUri,
} from "./assinatura-eletronica.contract.ts";

/** Mesmo limite material aplicado no manifesto e na Edge do Diário. */
export const CANONICAL_INSTITUTIONAL_WATERMARK_MAX_BYTES = 1024 * 1024;

const CANONICAL_DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u;

/**
 * A marca institucional é materializada em Modelos de Documentos e chega ao
 * navegador já congelada pelo backend. Aceitar somente esta forma impede que
 * uma URL ou uma data URI flexível reintroduza fonte alternativa no fluxo.
 */
export const isCanonicalInstitutionalWatermarkDataUri = (
  value: unknown,
): value is ElectronicSignatureCanonicalInstitutionalWatermarkDataUri => {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const match = CANONICAL_DATA_IMAGE_PATTERN.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;

  try {
    const decoded = atob(match[2]);
    return decoded.length >= 1 &&
      decoded.length <= CANONICAL_INSTITUTIONAL_WATERMARK_MAX_BYTES &&
      btoa(decoded) === match[2];
  } catch {
    return false;
  }
};

export const assertCanonicalInstitutionalWatermarkDataUri = (
  value: unknown,
  label = "A marca-d'água institucional",
): ElectronicSignatureCanonicalInstitutionalWatermarkDataUri => {
  if (!isCanonicalInstitutionalWatermarkDataUri(value)) {
    throw new Error(
      `${label} deve usar a data URI canônica retrato cadastrada no polo.`,
    );
  }
  return value;
};
